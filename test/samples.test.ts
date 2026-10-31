import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { test } from 'node:test';
import { loadArticles } from '../src/articles.ts';
import { AnswerCache } from '../src/cache.ts';
import { calibrate } from '../src/calibrate.ts';
import { checkGate } from '../src/check.ts';
import { checkArticleSource } from '../src/deterministic.ts';
import { MockJudge } from '../src/judges/index.ts';
import { recordScores, scoreArticles } from '../src/runner.ts';
import { stability } from '../src/stability.ts';
import { cfg, sample } from './helpers.ts';

const tmpCache = () => new AnswerCache(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-')), 'cache.json'));
const judge = new MockJudge();

test('drafts are skipped when loading', () => {
  const { articles, errors } = loadArticles(cfg);
  assert.equal(errors.length, 0);
  assert.equal(articles.length, 5);
  assert.ok(!articles.some((a) => a.status === 'draft'));
});

test('end to end with the mock judge: score, record, gate', async () => {
  const { articles } = loadArticles(cfg);
  const { scored, errors } = await scoreArticles(articles, judge, tmpCache(), cfg);
  assert.equal(errors.length, 0);
  const verdicts = Object.fromEntries(scored.map((s) => [s.article.id.split('/').pop()!.slice(0, 2), s.verdict]));
  assert.deepEqual(verdicts, { '01': 'pass', '02': 'pass', '03': 'review', '04': 'fail', '05': 'fail' });

  const ledger = recordScores({ entries: {} }, scored, judge.id, cfg);
  const gate = checkGate(articles, ledger, cfg);
  assert.deepEqual(gate.problems.map((p) => p.id.split('/').pop()!.slice(0, 2)), ['04', '05']);
  assert.deepEqual(gate.reviews.map((p) => p.id.split('/').pop()!.slice(0, 2)), ['03']);
});

test('the cache answers a second run without calling the judge', async () => {
  const { articles } = loadArticles(cfg);
  const cache = tmpCache();
  await scoreArticles(articles, judge, cache, cfg);
  await scoreArticles(articles, judge, cache, cfg);
  assert.deepEqual([cache.misses, cache.hits], [5, 5]);
});

test('plain-code checks: the technical sample needs its summary', () => {
  const a = sample('05-testing-a-ticket-router.md');
  assert.equal(checkArticleSource(a).filter((f) => f.level === 'fail').length, 0);
  const missing = checkArticleSource({ ...a, body: a.body.replace('**In short.**', '') });
  assert.ok(missing.some((f) => f.check === 'required-section'));
  assert.ok(checkArticleSource({ ...a, title: '' }).some((f) => f.check === 'frontmatter'));
});

test('calibration: the score alone misses the well-written internal note; the narrow gate catches it', async () => {
  const { rows, separations } = await calibrate(cfg, judge, tmpCache());
  assert.equal(rows.length, 7);
  assert.equal(rows.filter((r) => r.agreesScoreOnly).length, 6);
  assert.equal(rows.filter((r) => r.agreesWithGates).length, 7);
  const miss = rows.find((r) => !r.agreesScoreOnly)!;
  assert.equal(miss.id, '05 before rewrite');
  const gate = separations.find((s) => s.question === 'internal_note')!;
  assert.equal(gate.falseAlarmsAtConfigured, 0);
  assert.equal(gate.caughtAtConfigured, 1);
});

test('stability: the mock judge is deterministic', async () => {
  const { articles } = loadArticles(cfg);
  const r = await stability(articles, judge, cfg, 3);
  assert.equal(r.maxSpread, 0);
});

test('the Jev judge refuses to start without a key', async () => {
  const { JevJudge } = await import('../src/judges/jev.ts');
  assert.throws(() => new JevJudge({}), /TYPESAFE_API_KEY or AI_GATEWAY_API_KEY/);
});
