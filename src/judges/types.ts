import type { Audience } from '../rubric.ts';
import type { Dims } from '../score.ts';

export type JudgeInput = {
  title: string;
  description: string;
  kind: string;
  audience: Audience;
  opening: string;
  body: string;
};

/**
 * A judge answers the rubric's questions for one article and returns:
 * - the eight 0-N scores (claim ... takeaway), as expected values (may be fractional),
 * - the four penalty probabilities (overclaim ... promise_broken), 0-1,
 * - one probability per structural gate (rubric STRUCTURAL_GATES ids), 0-1.
 * It never computes the final score: plain code does (src/score.ts).
 */
export interface Judge {
  /** Recorded on every ledger entry and part of the cache key. */
  readonly id: string;
  judge(input: JudgeInput): Promise<Dims>;
}
