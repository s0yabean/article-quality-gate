#!/usr/bin/env -S node --import tsx
/**
 * article-gate: score articles, gate a build on the scores, and calibrate the judge.
 *
 *   article-gate score [--fresh] [--drafts] [--only <id>]   judge articles, update the ledger
 *   article-gate check [--strict] [--staged]                 the gate: no judge calls, no cost
 *   article-gate calibrate                                   judge vs the author's own verdicts
 *   article-gate stability [--runs 5]                        does the score hold still?
 *
 * JUDGE=mock (default, keyless) or JUDGE=jev. Config: article-gate.config.json.
 *
 * check exits 1 when it blocks: always with --strict (use as `prebuild`), and with --staged
 * (pre-commit) unless ARTICLE_GATE=warn. Without either flag it only reminds.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadArticles } from './articles.ts';
import { AnswerCache } from './cache.ts';
import { calibrate, calibrationMarkdown } from './calibrate.ts';
import { checkGate, stagedFiles } from './check.ts';
import { loadConfig, resolve } from './config.ts';
import { makeJudge } from './judges/index.ts';
import { readLedger, writeLedger } from './ledger.ts';
import { scoreMarkdown, weakest, writeReport } from './report.ts';
import { RUBRIC_VERSION } from './rubric.ts';
import { recordScores, scoreArticles } from './runner.ts';
import { stability } from './stability.ts';

// Keys for JUDGE=jev live in .env (see .env.example); never committed.
if (fs.existsSync('.env')) process.loadEnvFile('.env');

const [cmd = 'help', ...args] = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const value = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const paint = (code: number) => (s: string) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = paint(31), green = paint(32), yellow = paint(33);
const MARK = { pass: 'PASS  ', review: 'REVIEW', fail: 'FAIL  ' } as const;

const cfg = loadConfig();
const rel = (p: string) => path.relative(process.cwd(), p) || '.';

async function score() {
  const { articles, errors } = loadArticles(cfg, { drafts: flag('drafts'), only: value('only') });
  for (const e of errors) console.log(red(`FAIL frontmatter: ${e}`));
  const judge = await makeJudge();
  if (judge.id.startsWith('mock')) console.log(yellow('Judge: mock (keyless heuristics). Its scores show the flow, not real quality. Set JUDGE=jev for real scores.'));
  const cache = new AnswerCache(resolve(cfg, cfg.cachePath), flag('fresh'));
  const { scored, errors: judgeErrors } = await scoreArticles(articles, judge, cache, cfg);
  cache.save();
  const ledgerFile = resolve(cfg, cfg.ledgerPath);
  writeLedger(ledgerFile, recordScores(readLedger(ledgerFile), scored, judge.id, cfg));

  console.log(`\nArticle scores (pass >= bar; REVIEW = within ${cfg.reviewMargin} of the bar, publishes but a person reads it):`);
  for (const r of scored) {
    const c = r.verdict === 'pass' ? green : r.verdict === 'review' ? yellow : red;
    console.log(c(`  ${MARK[r.verdict]} ${r.score.score.toFixed(1).padStart(4)}  ${r.article.id}  (bar ${r.score.bar})`));
    if (r.verdict !== 'pass') console.log(`           fix first: ${weakest(r.score).join(', ')}${r.score.capped ? ` · capped: ${r.score.capped}` : ''}`);
  }
  for (const e of judgeErrors) console.log(red(`  ERROR  ${e.id}: ${e.error}`));
  const report = writeReport(resolve(cfg, cfg.reportDir), 'scores', scoreMarkdown(scored, { judge: judge.id, rubric: RUBRIC_VERSION, judgeCalls: cache.misses, cacheHits: cache.hits }), scored);
  console.log(`\nJudge calls: ${cache.misses} (cached: ${cache.hits}) · ledger: ${rel(ledgerFile)} · report: ${rel(report)}`);
  process.exit(errors.length || judgeErrors.length ? 1 : 0);
}

function check() {
  const staged = flag('staged');
  const strict = flag('strict') || process.env.ARTICLE_GATE === 'strict';
  let { articles, errors } = loadArticles(cfg);
  if (staged) {
    const files = stagedFiles(cfg);
    articles = articles.filter((a) => files.has(path.resolve(a.file)));
  }
  const ledger = readLedger(resolve(cfg, cfg.ledgerPath));
  const r = checkGate(articles, ledger, cfg);
  const problems = [...errors.map((e) => ({ id: e.split(':')[0], why: 'frontmatter does not parse' })), ...r.problems];

  if (r.reviews.length) {
    console.log(yellow(`\nREVIEW: ${r.reviews.length} article(s) within ${cfg.reviewMargin} point of the bar. They publish; a person should read them and decide.`));
    for (const p of r.reviews) console.log(yellow(`    - ${p.id}: ${p.why}`));
  }
  if (r.mockScored.length) console.log(yellow(`\nNote: ${r.mockScored.length} article(s) were scored by the mock judge. Re-score with JUDGE=jev before relying on the gate.`));
  if (!problems.length) {
    console.log(green(`\nArticle gate: ${r.checked - r.reviews.length} at the bar, ${r.reviews.length} in review, none blocked.`));
    process.exit(0);
  }
  const block = strict || (staged && process.env.ARTICLE_GATE !== 'warn');
  const c = block ? red : yellow;
  console.log(c(`\n${block ? 'BLOCKED' : 'WARNING'}: ${problems.length} of ${r.checked} published article(s) are unscored, stale, structurally failed or below the review band:`));
  for (const p of problems) console.log(c(`    - ${p.id}: ${p.why}`));
  console.log(
    [
      '',
      '  Score them:     npm run score',
      '  Hold one back:  set `status: draft` in its frontmatter until it reaches the bar.',
      block ? (staged ? '  Commit blocked (ARTICLE_GATE=warn to commit anyway).' : '  Build stopped.') : '  Continuing: this is a reminder (use --strict to block).',
      '',
    ].join('\n'),
  );
  process.exit(block ? 1 : 0);
}

async function runCalibrate() {
  const judge = await makeJudge();
  const cache = new AnswerCache(resolve(cfg, cfg.cachePath), flag('fresh'));
  const result = await calibrate(cfg, judge, cache);
  cache.save();
  const md = calibrationMarkdown(result, judge.id);
  console.log('\n' + md);
  console.log(`report: ${rel(writeReport(resolve(cfg, cfg.reportDir), 'calibration', md, result))}`);
}

async function runStability() {
  const runs = Number(value('runs') ?? 5);
  const judge = await makeJudge();
  const { articles } = loadArticles(cfg, { only: value('only') });
  const r = await stability(articles, judge, cfg, runs);
  console.log(`\nStability over ${runs} runs (${judge.id}):`);
  for (const row of r.rows) console.log(`  spread ${row.spread.toFixed(1)}  ${row.id}  [${row.scores.join(', ')}]`);
  console.log(`\nLargest spread: ${r.maxSpread.toFixed(1)} points (review band is ${cfg.reviewMargin} point wide).`);
}

const commands: Record<string, () => unknown> = { score, check, calibrate: runCalibrate, stability: runStability };
if (!commands[cmd]) {
  console.log('usage: article-gate <score|check|calibrate|stability> [flags]   (see src/cli.ts)');
  process.exit(cmd === 'help' ? 0 : 2);
}
Promise.resolve(commands[cmd]()).catch((e) => {
  console.error(red(String(e?.stack ?? e)));
  process.exit(2);
});
