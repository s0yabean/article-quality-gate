import { MockJudge } from './mock.ts';
import type { Judge } from './types.ts';

export type { Judge, JudgeInput } from './types.ts';
export { MockJudge } from './mock.ts';

/** JUDGE=mock (default, keyless) or JUDGE=jev. Add your own judge by implementing `Judge`. */
export async function makeJudge(name = process.env.JUDGE || 'mock'): Promise<Judge> {
  if (name === 'mock') return new MockJudge();
  if (name === 'jev') {
    const { JevJudge } = await import('./jev.ts');
    return new JevJudge();
  }
  throw new Error(`Unknown JUDGE "${name}" (expected mock or jev)`);
}
