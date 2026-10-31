import fs from 'node:fs';
import { parseArticle } from './articles.ts';
import type { AnswerCache } from './cache.ts';
import { resolve, type GateConfig } from './config.ts';
import type { Judge } from './judges/index.ts';
import { PENALTY_DIMS, STRUCTURAL_GATES } from './rubric.ts';
import { scoreOne } from './runner.ts';
import { scoreArticle, verdictFor } from './score.ts';

/**
 * Check the judge against the author. A goldens file lists versions of articles the
 * author has already judged (rejected drafts from git history and their approved
 * rewrites), each with a verdict and the reason. Calibration reports:
 *
 * 1. Agreement: does the overall score gate fail what the author rejected and pass what
 *    the author approved? Where it disagrees, the reason column says what the score missed.
 * 2. Separation per yes/no question: for each penalty and structural gate, the values on
 *    approved vs rejected versions, the lowest cut-off with no false alarm on any approved
 *    version, and how many rejected versions that cut-off catches.
 *
 * Keep the goldens permanent: any rubric change has to keep failing them where it should.
 */

export type Golden = { id: string; file: string; verdict: 'approve' | 'reject'; reason: string };
export type GoldenFile = { note?: string; items: Golden[] };

export type CalibrationRow = Golden & {
  score: number;
  scoreOnly: 'pass' | 'review' | 'fail';
  withGates: 'pass' | 'review' | 'fail';
  agreesScoreOnly: boolean;
  agreesWithGates: boolean;
  probs: Record<string, number>;
};

export type Separation = {
  question: string;
  approvedMax: number;
  rejected: { id: string; value: number }[];
  suggestedCutoff: number | null;
  caughtAtSuggested: number;
  configuredCutoff?: number;
  caughtAtConfigured?: number;
  falseAlarmsAtConfigured?: number;
};

// The author rejected it: the gate agrees if it blocks it. "review" publishes, so it counts as a pass.
const agrees = (verdict: Golden['verdict'], v: 'pass' | 'review' | 'fail') => (verdict === 'reject' ? v === 'fail' : v !== 'fail');

export async function calibrate(cfg: GateConfig, judge: Judge, cache: AnswerCache) {
  const goldens = JSON.parse(fs.readFileSync(resolve(cfg, cfg.calibrationFile), 'utf8')) as GoldenFile;
  const rows: CalibrationRow[] = [];
  for (const g of goldens.items) {
    const a = parseArticle(resolve(cfg, g.file), cfg.root);
    const r = await scoreOne(a, judge, cache, cfg);
    // "Score only": the same answers with every structural gate question zeroed, so the
    // column shows what the quality questions (and plain-code checks) decide on their own.
    const noGates = { ...r.score.dims, ...Object.fromEntries(STRUCTURAL_GATES.map((s) => [s.id, 0])) };
    const deterministicFails = r.score.structural.filter((id) => !STRUCTURAL_GATES.some((s) => s.id === id));
    const scoreOnly = scoreArticle(noGates, { kind: a.kind, deterministicFails, cfg });
    rows.push({
      ...g,
      score: scoreOnly.score,
      scoreOnly: verdictFor(scoreOnly, cfg.reviewMargin),
      withGates: r.verdict,
      agreesScoreOnly: agrees(g.verdict, verdictFor(scoreOnly, cfg.reviewMargin)),
      agreesWithGates: agrees(g.verdict, r.verdict),
      probs: Object.fromEntries([...PENALTY_DIMS, ...STRUCTURAL_GATES.map((s) => s.id)].map((k) => [k, r.score.dims[k]])),
    });
  }

  const separations: Separation[] = [...PENALTY_DIMS, ...STRUCTURAL_GATES.map((s) => s.id)].map((q) => {
    const approved = rows.filter((r) => r.verdict === 'approve').map((r) => r.probs[q]);
    const rejected = rows.filter((r) => r.verdict === 'reject').map((r) => ({ id: r.id, value: r.probs[q] }));
    const approvedMax = approved.length ? Math.max(...approved) : 0;
    // Lowest cut-off on a 0.05 grid strictly above every approved value.
    const suggested = Math.ceil((approvedMax + 1e-9) / 0.05) * 0.05;
    const suggestedCutoff = suggested <= 1 ? Math.round(suggested * 100) / 100 : null;
    const gate = STRUCTURAL_GATES.find((s) => s.id === q);
    return {
      question: q,
      approvedMax,
      rejected,
      suggestedCutoff,
      caughtAtSuggested: suggestedCutoff === null ? 0 : rejected.filter((r) => r.value >= suggestedCutoff).length,
      ...(gate
        ? {
            configuredCutoff: gate.cutoff,
            caughtAtConfigured: rejected.filter((r) => r.value >= gate.cutoff).length,
            falseAlarmsAtConfigured: approved.filter((v) => v >= gate.cutoff).length,
          }
        : {}),
    };
  });

  return { rows, separations };
}

export function calibrationMarkdown({ rows, separations }: Awaited<ReturnType<typeof calibrate>>, judgeId: string) {
  const n = rows.length;
  const a1 = rows.filter((r) => r.agreesScoreOnly).length;
  const a2 = rows.filter((r) => r.agreesWithGates).length;
  const lines = [
    `# Calibration: judge vs author (${judgeId})`,
    '',
    `Agreement with the author's verdicts: **${a1}/${n}** on the score alone, **${a2}/${n}** with structural gates.`,
    '',
    '| Version | Author | Why | Score (no gates) | Score-only gate | With gates |',
    '|---|---|---|---|---|---|',
    ...rows.map((r) => {
      const mark = (ok: boolean, v: string) => `${v}${ok ? '' : ' (disagrees)'}`;
      return `| ${r.id} | ${r.verdict} | ${r.reason} | ${r.score} | ${mark(r.agreesScoreOnly, r.scoreOnly)} | ${mark(r.agreesWithGates, r.withGates)} |`;
    }),
    '',
    '## Separation per yes/no question',
    '',
    'Lowest cut-off with no false alarm on an approved version, and how many rejected versions it would catch.',
    '',
    '| Question | Max on approved | Rejected values | Suggested cut-off | Caught | Configured cut-off | Caught / false alarms |',
    '|---|---|---|---|---|---|---|',
    ...separations.map(
      (s) =>
        `| ${s.question} | ${s.approvedMax.toFixed(2)} | ${s.rejected.map((r) => r.value.toFixed(2)).join(', ')} | ${s.suggestedCutoff ?? 'none'} | ${s.caughtAtSuggested}/${s.rejected.length} | ${s.configuredCutoff ?? '-'} | ${s.configuredCutoff === undefined ? '-' : `${s.caughtAtConfigured}/${s.rejected.length} / ${s.falseAlarmsAtConfigured}`} |`,
    ),
    '',
  ];
  return lines.join('\n');
}
