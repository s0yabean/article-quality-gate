import { noul, score, TypeSafeClient } from '@typesafe-ai/sdk';
import { AUDIENCES, LEGENDS, PENALTY_DIMS, QUESTIONS, SCORE_DIMS, STRUCTURAL_GATES } from '../rubric.ts';
import type { Dims } from '../score.ts';
import type { Judge, JudgeInput } from './types.ts';

/**
 * Jev (TypeSafe's System One model) as the judge. Jev answers narrow typed questions with
 * a probability for every answer instead of free text, so a score question returns an
 * expected value over fixed bands and a yes/no question returns a probability.
 * All questions go in one request and are answered in parallel.
 *
 * Article text is passed as `state` (data), never spliced into the instructions.
 */

const GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/typesafe';
const GATEWAY_MODEL = 'typesafe-ai/jev';
const DIRECT_MODEL = 'jev-1.13.0';

export function jevClient(env = process.env): { client: TypeSafeClient; model: string } {
  if (env.TYPESAFE_API_KEY) {
    // A direct key lets you pin the model version, so scores stay comparable over time.
    const model = env.JEV_MODEL || DIRECT_MODEL;
    return { client: new TypeSafeClient({ apiKey: env.TYPESAFE_API_KEY, defaultModel: model, timeout: 20_000 }), model };
  }
  if (env.AI_GATEWAY_API_KEY) {
    return {
      client: new TypeSafeClient({ apiKey: env.AI_GATEWAY_API_KEY, baseURL: GATEWAY_BASE_URL, defaultModel: GATEWAY_MODEL, timeout: 20_000 }),
      model: GATEWAY_MODEL,
    };
  }
  throw new Error('JUDGE=jev needs TYPESAFE_API_KEY or AI_GATEWAY_API_KEY (see .env.example), or use JUDGE=mock.');
}

type Answer = { score?: number; noul?: number };

export class JevJudge implements Judge {
  readonly id: string;
  private client: TypeSafeClient;

  constructor(env = process.env) {
    const { client, model } = jevClient(env);
    this.client = client;
    this.id = `jev:${model}`;
  }

  async judge(a: JudgeInput): Promise<Dims> {
    const caseLike = a.kind === 'case-study' || a.kind === 'company';
    const questions = {
      claim: score(QUESTIONS.claim, LEGENDS.claim),
      receipt: score(QUESTIONS.receipt, LEGENDS.receipt),
      caught: score(QUESTIONS.caught, LEGENDS.caught),
      hook: score(QUESTIONS.hook, caseLike ? LEGENDS.case_hook : LEGENDS.hook),
      pace: score(QUESTIONS.pace, LEGENDS.pace),
      close: score(QUESTIONS.close, LEGENDS.close),
      plain: score(QUESTIONS.plain, a.audience === 'technical' ? LEGENDS.plain_technical : LEGENDS.plain_general),
      takeaway: score(QUESTIONS.takeaway, LEGENDS.takeaway),
      overclaim: noul(QUESTIONS.overclaim),
      off_audience: noul(QUESTIONS.off_audience),
      uncredited: noul(QUESTIONS.uncredited),
      promise_broken: noul(QUESTIONS.promise_broken),
      ...Object.fromEntries(STRUCTURAL_GATES.map((g) => [g.id, noul(g.question)])),
    };
    const { answers } = await this.client.systemOne({
      state: {
        audience: AUDIENCES[a.audience],
        article: { title: a.title, description: a.description, kind: a.kind, opening: a.opening, body: a.body },
      },
      questions,
    });
    const ans = answers as unknown as Record<string, Answer>;
    const dims: Dims = {};
    for (const k of SCORE_DIMS) dims[k] = ans[k]?.score ?? NaN;
    for (const k of [...PENALTY_DIMS, ...STRUCTURAL_GATES.map((g) => g.id)]) dims[k] = ans[k]?.noul ?? NaN;
    return dims;
  }
}
