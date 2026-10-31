import type { Article } from './articles.ts';
import type { GateConfig } from './config.ts';
import { checkArticleSource } from './deterministic.ts';
import type { Judge } from './judges/index.ts';
import { judgeInput } from './runner.ts';
import { scoreArticle } from './score.ts';

/**
 * Does the score hold still? Judge each article `runs` times with no cache and report
 * the spread. If the largest spread is well under the distance between the bar and the
 * review band, asking twice and taking the median adds cost without changing a decision.
 * Consistency does not show the judge is right: that is what `calibrate` is for.
 */
export async function stability(articles: Article[], judge: Judge, cfg: GateConfig, runs: number) {
  const rows: { id: string; scores: number[]; spread: number }[] = [];
  for (const a of articles) {
    const deterministicFails = checkArticleSource(a).filter((f) => f.level === 'fail').map((f) => f.check);
    const scores: number[] = [];
    for (let i = 0; i < runs; i++) scores.push(scoreArticle(await judge.judge(judgeInput(a)), { kind: a.kind, deterministicFails, cfg }).score);
    rows.push({ id: a.id, scores, spread: Math.round((Math.max(...scores) - Math.min(...scores)) * 10) / 10 });
  }
  return { rows, maxSpread: rows.length ? Math.max(...rows.map((r) => r.spread)) : 0 };
}
