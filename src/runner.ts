import { openingOf, type Article } from './articles.ts';
import { AnswerCache } from './cache.ts';
import type { GateConfig } from './config.ts';
import { checkArticleSource, type Finding } from './deterministic.ts';
import type { Judge } from './judges/index.ts';
import { articleHash, type Ledger } from './ledger.ts';
import { RUBRIC_VERSION } from './rubric.ts';
import { scoreArticle, verdictFor, type ArticleScore, type Verdict } from './score.ts';

export type ScoredArticle = { article: Article; score: ArticleScore; verdict: Verdict; findings: Finding[] };

export function judgeInput(a: Article) {
  return { title: a.title, description: a.description, kind: a.kind, audience: a.audience, opening: openingOf(a.body), body: a.body };
}

/** Judge one article (through the cache) and turn the answers into a score. */
export async function scoreOne(a: Article, judge: Judge, cache: AnswerCache, cfg: GateConfig): Promise<ScoredArticle> {
  const findings = checkArticleSource(a);
  const deterministicFails = [...new Set(findings.filter((f) => f.level === 'fail').map((f) => f.check))];
  const input = judgeInput(a);
  const dims = await cache.get(AnswerCache.key('article', judge.id, a.audience, a.kind, a.title, a.description, a.body), () => judge.judge(input));
  const score = scoreArticle(dims, { kind: a.kind, deterministicFails, cfg });
  return { article: a, score, verdict: verdictFor(score, cfg.reviewMargin), findings };
}

export async function scoreArticles(articles: Article[], judge: Judge, cache: AnswerCache, cfg: GateConfig, concurrency = 4) {
  const out: ScoredArticle[] = [];
  const errors: { id: string; error: string }[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, articles.length) }, async () => {
      while (i < articles.length) {
        const a = articles[i++];
        try {
          out.push(await scoreOne(a, judge, cache, cfg));
        } catch (e) {
          errors.push({ id: a.id, error: String((e as Error).message ?? e) });
        }
      }
    }),
  );
  out.sort((x, y) => x.article.id.localeCompare(y.article.id));
  return { scored: out, errors };
}

/** Record each score against a fingerprint of the words it was given. */
export function recordScores(ledger: Ledger, scored: ScoredArticle[], judgeId: string, cfg: GateConfig, today = new Date()) {
  for (const { article: a, score: s } of scored) {
    ledger.entries[a.id] = {
      score: s.score,
      pass: s.pass,
      hash: articleHash(a),
      audience: a.audience,
      kind: a.kind,
      rubric: RUBRIC_VERSION,
      judge: judgeId,
      judgedAt: today.toISOString().slice(0, 10),
      substance: Number(s.substance.toFixed(1)),
      delivery: Number(s.delivery.toFixed(1)),
      fit: Number(s.fit.toFixed(1)),
      structural: s.structural,
    };
  }
  ledger.rubric = RUBRIC_VERSION;
  ledger.passScore = cfg.passScore;
  return ledger;
}
