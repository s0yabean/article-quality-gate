import { passScoreFor, type GateConfig } from './config.ts';
import { DIM_MAX, PENALTY_DIMS, PENALTY_FLOOR, PENALTY_WEIGHTS, SCORE_DIMS, STRUCTURAL_GATES } from './rubric.ts';

/**
 * Plain code, not the model, turns the judge's answers into a score out of 10.
 *
 *   score = 4 x substance/6 + 3 x delivery/6 + 3 x fit/6 - penalties
 *
 * substance = claim + receipt + caught (each 0-2)
 * delivery  = hook + pace + close      (each 0-2)
 * fit       = plain + takeaway         (each 0-3)
 *
 * Weak substance (< 4/6) or weak delivery (< 3/6) caps the score just under the bar,
 * whatever the other answers say. A structural failure (plain-code fail or a structural
 * gate question over its cut-off) caps it a full point under the bar and blocks it.
 */

export type Dims = Record<string, number>;

export type ArticleScore = {
  score: number;
  pass: boolean;
  bar: number;
  substance: number;
  delivery: number;
  fit: number;
  penalties: Record<string, number>;
  structural: string[];
  capped?: string;
  dims: Dims;
};

const excess = (p: number) => Math.max(0, p - PENALTY_FLOOR) / (1 - PENALTY_FLOOR);

/** Structural gate ids whose probability is at or over the cut-off. */
export function failedGates(dims: Dims): string[] {
  return STRUCTURAL_GATES.filter((g) => (dims[g.id] ?? 0) >= g.cutoff).map((g) => g.id);
}

export function scoreArticle(
  dims: Dims,
  { kind, deterministicFails = [], cfg }: { kind?: string; deterministicFails?: string[]; cfg: Pick<GateConfig, 'passScore' | 'passScoreByKind'> },
): ArticleScore {
  for (const k of [...SCORE_DIMS, ...PENALTY_DIMS])
    if (typeof dims[k] !== 'number' || Number.isNaN(dims[k])) throw new Error(`Judge did not answer "${k}"`);
  const clamp = (k: (typeof SCORE_DIMS)[number]) => Math.max(0, Math.min(DIM_MAX[k], dims[k]));
  const bar = passScoreFor(cfg, kind);
  const substance = clamp('claim') + clamp('receipt') + clamp('caught');
  const delivery = clamp('hook') + clamp('pace') + clamp('close');
  const fit = clamp('plain') + clamp('takeaway');
  const penalties = Object.fromEntries(PENALTY_DIMS.map((k) => [k, PENALTY_WEIGHTS[k] * excess(dims[k])]));
  let score = 4 * (substance / 6) + 3 * (delivery / 6) + 3 * (fit / 6) - Object.values(penalties).reduce((a, b) => a + b, 0);
  let capped: string | undefined;
  if (substance < 4 || delivery < 3) {
    score = Math.min(score, bar - 0.1);
    capped = 'substance < 4/6 or delivery < 3/6';
  }
  const structural = [...deterministicFails, ...failedGates(dims)];
  if (structural.length) {
    score = Math.min(score, bar - 1);
    capped = `structural: ${structural.join(', ')}`;
  }
  score = Math.round(Math.max(0, Math.min(10, score)) * 10) / 10;
  return { score, pass: score >= bar && !structural.length, bar, substance, delivery, fit, penalties, structural, capped, dims };
}

export type Verdict = 'pass' | 'review' | 'fail';

export function verdictFor(s: Pick<ArticleScore, 'score' | 'bar' | 'structural'>, reviewMargin: number): Verdict {
  if (s.structural.length) return 'fail';
  if (s.score >= s.bar) return 'pass';
  if (s.score >= s.bar - reviewMargin) return 'review';
  return 'fail';
}
