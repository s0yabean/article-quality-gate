import assert from 'node:assert/strict';
import { test } from 'node:test';
import { passScoreFor } from '../src/config.ts';
import { scoreArticle, verdictFor } from '../src/score.ts';
import { cfg } from './helpers.ts';

const strong = {
  claim: 2, receipt: 2, caught: 2, hook: 2, pace: 2, close: 2, plain: 3, takeaway: 3,
  overclaim: 0, off_audience: 0, uncredited: 0, promise_broken: 0, internal_note: 0,
};

test('perfect answers score 10 and pass', () => {
  const s = scoreArticle(strong, { kind: 'essay', cfg });
  assert.equal(s.score, 10);
  assert.equal(verdictFor(s, cfg.reviewMargin), 'pass');
});

test('weights: substance 4, delivery 3, fit 3', () => {
  const s = scoreArticle({ ...strong, plain: 0, takeaway: 0 }, { kind: 'essay', cfg });
  assert.equal(s.score, 7);
});

test('penalties only count confidence above 30%', () => {
  assert.equal(scoreArticle({ ...strong, overclaim: 0.3 }, { kind: 'essay', cfg }).score, 10);
  assert.equal(scoreArticle({ ...strong, overclaim: 1 }, { kind: 'essay', cfg }).score, 8);
});

test('weak substance caps just under the bar, whatever else scores', () => {
  const s = scoreArticle({ ...strong, receipt: 0, caught: 1 }, { kind: 'essay', cfg }); // substance 3/6
  assert.equal(s.score, 7.9);
  assert.equal(verdictFor(s, cfg.reviewMargin), 'review');
});

test('a structural gate over its cut-off fails the article and caps a point under the bar', () => {
  const s = scoreArticle({ ...strong, internal_note: 0.85 }, { kind: 'essay', cfg });
  assert.equal(s.score, 7);
  assert.deepEqual(s.structural, ['internal_note']);
  assert.equal(s.pass, false);
  assert.equal(verdictFor(s, cfg.reviewMargin), 'fail');
  assert.equal(scoreArticle({ ...strong, internal_note: 0.59 }, { kind: 'essay', cfg }).pass, true);
});

test('a plain-code failure is structural too', () => {
  const s = scoreArticle(strong, { kind: 'essay', deterministicFails: ['frontmatter'], cfg });
  assert.equal(verdictFor(s, cfg.reviewMargin), 'fail');
});

test('review band is one point under the bar; company pages have a lower bar', () => {
  assert.equal(passScoreFor(cfg, 'essay'), 8);
  assert.equal(passScoreFor(cfg, 'company'), 7);
  assert.equal(verdictFor({ score: 7.0, bar: 8, structural: [] }, 1), 'review');
  assert.equal(verdictFor({ score: 6.9, bar: 8, structural: [] }, 1), 'fail');
  assert.equal(verdictFor({ score: 7.0, bar: 7, structural: [] }, 1), 'pass');
});

test('a missing judge answer is an error, not a zero', () => {
  const { pace, ...rest } = strong;
  void pace;
  assert.throws(() => scoreArticle(rest, { kind: 'essay', cfg }), /pace/);
});
