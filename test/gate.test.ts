import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkGate } from '../src/check.ts';
import { articleHash, type Ledger, type LedgerEntry } from '../src/ledger.ts';
import { RUBRIC_VERSION } from '../src/rubric.ts';
import { cfg, sample } from './helpers.ts';

const a = sample('01-three-numbers-before-automating-quotes.md');
const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  score: 8.5, pass: true, hash: articleHash(a), audience: a.audience, kind: a.kind, rubric: RUBRIC_VERSION,
  judge: 'jev:test', judgedAt: '2026-10-01', substance: 5, delivery: 5, fit: 5, structural: [], ...over,
});
const ledger = (e?: LedgerEntry): Ledger => ({ entries: e ? { [a.id]: e } : {} });
const why = (l: Ledger, art = a) => checkGate([art], l, cfg).problems.map((p) => p.why);

test('a current, passing score clears the gate', () => {
  const r = checkGate([a], ledger(entry()), cfg);
  assert.deepEqual([r.checked, r.problems.length, r.reviews.length], [1, 0, 0]);
});

test('never scored blocks', () => assert.deepEqual(why(ledger()), ['never scored']));

test('editing the text after scoring blocks until re-scored', () => {
  assert.match(why(ledger(entry()), { ...a, body: a.body + '\nOne more line.' })[0], /edited since it scored 8.5/);
  assert.match(why(ledger(entry()), { ...a, title: a.title + '!' })[0], /edited/);
});

test('changing the reader or kind invalidates the score', () => {
  assert.match(why(ledger(entry()), { ...a, audience: 'technical' })[0], /reader "general", now "technical"/);
  assert.match(why(ledger(entry()), { ...a, kind: 'field-note' })[0], /kind "essay"/);
});

test('a rubric change invalidates every score', () => assert.match(why(ledger(entry({ rubric: 'old' })))[0], /under rubric old/));

test('review band publishes but is listed; below it blocks', () => {
  const review = checkGate([a], ledger(entry({ score: 7.4 })), cfg);
  assert.equal(review.problems.length, 0);
  assert.equal(review.reviews.length, 1);
  assert.match(why(ledger(entry({ score: 6.9 })))[0], /scores 6.9/);
});

test('a structural failure blocks whatever the score', () => {
  assert.match(why(ledger(entry({ score: 9.5, structural: ['internal_note'] })))[0], /internal_note/);
});

test('drafts are ignored', () => {
  const r = checkGate([{ ...a, status: 'draft' }], ledger(), cfg);
  assert.deepEqual([r.checked, r.problems.length], [0, 0]);
});

test('mock-judged entries are flagged', () => {
  assert.deepEqual(checkGate([a], ledger(entry({ judge: 'mock-1' })), cfg).mockScored, [a.id]);
});
