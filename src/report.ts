import fs from 'node:fs';
import path from 'node:path';
import type { Finding } from './deterministic.ts';
import { DIM_MAX, SCORE_DIMS } from './rubric.ts';
import type { ScoredArticle } from './runner.ts';

export const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

/** The weakest dimensions, as ratios of their maximum: what to fix first. */
export function weakest(s: ScoredArticle['score'], n = 3) {
  return SCORE_DIMS.map((k) => ({ k, ratio: s.dims[k] / DIM_MAX[k] }))
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, n)
    .map(({ k }) => `${k} ${s.dims[k].toFixed(1)}/${DIM_MAX[k]}`);
}

export function scoreMarkdown(scored: ScoredArticle[], meta: Record<string, unknown>) {
  const lines = [`# Article scores`, '', ...Object.entries(meta).map(([k, v]) => `- ${k}: ${v}`), ''];
  lines.push('| Article | Score | Bar | Verdict | Substance /6 | Delivery /6 | Fit /6 | Fix first | Notes |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of scored) {
    const s = r.score;
    const pens = Object.entries(s.penalties).filter(([, v]) => v >= 0.1).map(([k, v]) => `${k} -${v.toFixed(1)}`);
    const notes = [...(s.capped ? [`capped: ${s.capped}`] : []), ...pens].join('; ');
    lines.push(`| ${r.article.id} | ${s.score} | ${s.bar} | ${r.verdict} | ${s.substance.toFixed(1)} | ${s.delivery.toFixed(1)} | ${s.fit.toFixed(1)} | ${weakest(s).join(', ')} | ${notes} |`);
  }
  const findings: Finding[] = scored.flatMap((r) => r.findings);
  if (findings.length) {
    lines.push('', '## Plain-code findings', '', '| Level | Check | Article | Detail |', '|---|---|---|---|');
    for (const f of findings) lines.push(`| ${f.level} | ${f.check} | ${f.where} | ${f.detail} |`);
  }
  return lines.join('\n') + '\n';
}

export function writeReport(dir: string, name: string, markdown: string, json: unknown) {
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `${name}-${stamp()}`);
  fs.writeFileSync(`${base}.md`, markdown);
  fs.writeFileSync(`${base}.json`, JSON.stringify(json, null, 2));
  return `${base}.md`;
}
