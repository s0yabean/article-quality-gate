import { HYPE } from '../rubric.ts';
import type { Dims } from '../score.ts';
import type { Judge, JudgeInput } from './types.ts';

/**
 * A keyless, deterministic stand-in for the LLM judge: word-count and phrase heuristics
 * returning answers in the same shape. It exists so the scoring maths, ledger, gate,
 * cache and calibration flow run anywhere, in CI, for free.
 *
 * Its numbers say nothing about how a real judge scores. Never publish on mock scores.
 */

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;
const has = (text: string, phrases: string[]) => phrases.filter((p) => text.includes(p)).length;
const clamp = (v: number, max: number) => Math.round(Math.max(0, Math.min(max, v)) * 100) / 100;

const PLATITUDES = [
  "in today's", 'more than ever', "it's important to", 'it is important to', 'at the end of the day', 'the key is',
  'everyone knows', 'it is crucial', 'the possibilities are endless', 'embrace', 'left behind', 'journey',
];
const TENSION = /\b(lost|losing|cost|costs|late|broke|broken|failed|fails|missed|wrong|problem|slower|worse|stuck|waited|waiting)\b/g;
const CONTRAST = /\b(but|instead|however|rather than|not)\b/g;
const ACTION = /\b(try|start with|check|write down|measure|this week|pick one|first step|count)\b/g;
const JARGON = /\b(api|apis|llm|llms|embeddings?|rag|vector|mcp|agentic|fine-tun\w*|tokens?|latency|p95|schema|webhooks?)\b/g;
const OVERCLAIM = /\b(guaranteed|never fails|10x|100%|always works|instantly|overnight)\b/g;
const INTERNAL = ['dm me', 'skills demonstrated', 'skills shown', 'my skills', 'compare notes', 'hire me', 'my cv'];

export class MockJudge implements Judge {
  readonly id = 'mock-1';

  async judge(a: JudgeInput): Promise<Dims> {
    const body = a.body.toLowerCase();
    const words = body.split(/\s+/).filter(Boolean).length || 1;
    const per100 = (n: number) => (100 * n) / words;
    const prose = a.body
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p && !p.startsWith('#') && !p.startsWith('|') && !p.startsWith('<'));
    const last = (prose.at(-1) ?? '').toLowerCase();
    const opening = a.opening.toLowerCase();
    const sentences = body.split(/[.!?]+\s/).filter((s) => s.trim().length > 0);
    const avgSentence = words / Math.max(1, sentences.length);

    const nums = count(body, /\b\d[\d,.]*%?/g);
    const firstPerson = per100(count(body, /\b(i|we|our|my)\b/g));
    const platitudes = has(body, PLATITUDES);
    const hype = has(body, HYPE);
    const contrast = per100(count(body, CONTRAST));
    const tension = count(body, TENSION);
    const actions = count(body, ACTION);
    const jargon = count(body, JARGON);
    const overclaims = count(body, OVERCLAIM);
    const internal = has(body, INTERNAL);

    return {
      claim: clamp(0.5 + 0.35 * contrast + (nums >= 3 ? 0.6 : 0) - 0.4 * platitudes - 0.3 * hype, 2),
      receipt: clamp(Math.min(2, nums / 5) * (firstPerson >= 0.5 ? 1 : 0.6), 2),
      caught: clamp(0.9 + (tension >= 3 ? 0.9 : 0.3 * tension) - 0.3 * platitudes, 2),
      hook: clamp((/\d/.test(opening) || count(opening, TENSION) > 0 ? 1.8 : 0.6) - (has(opening, HYPE) ? 0.5 : 0), 2),
      pace: clamp((avgSentence <= 18 ? 1.8 : avgSentence <= 24 ? 1.3 : 0.8) - 0.25 * platitudes, 2),
      close: clamp(/subscribe|contact us today|sign up now/.test(last) ? 0.3 : count(last, ACTION) > 0 ? 1.7 : 0.9, 2),
      plain: clamp(a.audience === 'general' ? 3 - 0.4 * jargon : 2.6 - 0.3 * hype, 3),
      takeaway: clamp(0.8 + 0.35 * actions - 0.2 * platitudes, 3),
      overclaim: clamp(0.15 + 0.25 * overclaims + 0.1 * hype, 0.95),
      off_audience: a.audience === 'general' && jargon >= 6 ? 0.7 : 0.1,
      uncredited: /\b(pareto|80\/20)\b/.test(body) && !/vilfredo/.test(body) ? 0.6 : 0.1,
      promise_broken: words < 250 ? 0.5 : 0.1,
      internal_note: clamp(0.1 + 0.4 * internal, 0.95),
    };
  }
}
