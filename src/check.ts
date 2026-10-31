import { execSync } from 'node:child_process';
import path from 'node:path';
import type { Article } from './articles.ts';
import { passScoreFor, reviewScoreFor, type GateConfig } from './config.ts';
import { articleHash, type Ledger } from './ledger.ts';
import { RUBRIC_VERSION } from './rubric.ts';

/**
 * The publishing gate. Pure: given published articles and the ledger, say which are
 * blocked (problems) and which publish but need a person to read them (reviews).
 * No judge is called here, so it is fast and free enough to run before every build.
 */

export type GateItem = { id: string; why: string };
export type GateResult = { checked: number; problems: GateItem[]; reviews: GateItem[]; mockScored: string[] };

export function checkGate(articles: Article[], ledger: Ledger, cfg: GateConfig, rubric = RUBRIC_VERSION): GateResult {
  const problems: GateItem[] = [];
  const reviews: GateItem[] = [];
  const mockScored: string[] = [];
  let checked = 0;
  for (const a of articles) {
    if (a.status === 'draft') continue;
    checked++;
    const e = ledger.entries[a.id];
    const bar = passScoreFor(cfg, a.kind);
    const p = (why: string) => problems.push({ id: a.id, why });
    if (!e) p('never scored');
    else if (e.hash !== articleHash(a)) p(`edited since it scored ${e.score}/10`);
    // Reader and kind change which questions are asked and which bar applies, so a score
    // judged under different ones no longer counts.
    else if (e.audience !== a.audience) p(`scored ${e.score}/10 for reader "${e.audience}", now "${a.audience}"`);
    else if (e.kind !== a.kind) p(`scored ${e.score}/10 as kind "${e.kind}", now "${a.kind}"`);
    else if (e.rubric !== rubric) p(`scored ${e.score}/10 under rubric ${e.rubric}, current is ${rubric}`);
    else if (e.structural?.length) p(`structural check failed: ${e.structural.join(', ')}`);
    else if (e.score < reviewScoreFor(cfg, a.kind)) p(`scores ${e.score}/10 (bar ${bar})`);
    else if (e.score < bar) reviews.push({ id: a.id, why: `scores ${e.score}/10 (bar ${bar})` });
    if (e && e.judge?.startsWith('mock')) mockScored.push(a.id);
  }
  return { checked, problems, reviews, mockScored };
}

/** Article files staged in git, for a pre-commit hook that only checks what is changing. */
export function stagedFiles(cfg: GateConfig): Set<string> {
  const out = execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8', cwd: cfg.root });
  const top = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', cwd: cfg.root }).trim();
  return new Set(out.split('\n').filter(Boolean).map((f) => path.resolve(top, f)));
}
