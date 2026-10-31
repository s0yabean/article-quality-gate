import type { Article } from './articles.ts';
import { HYPE, KINDS, LIMITS, REQUIRED } from './rubric.ts';

/**
 * Checks with an exact answer, done in plain code: presence, lengths, counts, required
 * sections, banned phrases. The judge is reserved for judgment calls. A `fail` here is
 * structural: the article is blocked whatever the judge says.
 */

export type Finding = { level: 'fail' | 'warn'; check: string; where: string; detail: string };

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function checkArticleSource(a: Article): Finding[] {
  const f: Finding[] = [];
  const add = (level: Finding['level'], check: string, detail: string) => f.push({ level, check, where: a.id, detail });
  const words = wordCount(a.body);
  const h2 = a.body.split('\n').filter((l) => l.startsWith('## ')).length;

  if (!a.title) add('fail', 'frontmatter', 'Missing title');
  else if (a.title.length > LIMITS.titleMax) add('warn', 'title-length', `Title is ${a.title.length} chars (keep under ${LIMITS.titleMax})`);
  else if (a.title.length < LIMITS.titleMin) add('warn', 'title-length', `Title is only ${a.title.length} chars`);

  if (!a.description) add('fail', 'frontmatter', 'Missing description');
  else if (a.description.length > LIMITS.descriptionMax) add('warn', 'description-length', `Description is ${a.description.length} chars (search results cut off around ${LIMITS.descriptionMax})`);
  else if (a.description.length < LIMITS.descriptionMin) add('warn', 'description-length', `Description is only ${a.description.length} chars`);

  if (!a.date || Number.isNaN(Date.parse(a.date instanceof Date ? a.date.toISOString() : String(a.date))))
    add('fail', 'frontmatter', 'Missing or invalid date');
  if (!(KINDS as readonly string[]).includes(a.kind)) add('fail', 'frontmatter', `Unknown kind "${a.kind}" (expected ${KINDS.join(', ')})`);

  for (const r of REQUIRED[a.audience]) if (!r.pattern.test(a.body)) add('fail', 'required-section', r.detail);

  const lower = a.body.toLowerCase();
  const hype = HYPE.filter((h) => lower.includes(h));
  if (hype.length) add('warn', 'hype', `Hype phrases: ${hype.join(', ')}`);

  const missingAlt = a.body.match(/!\[\]\([^)]*\)/g) ?? [];
  if (missingAlt.length) add('fail', 'image-alt', `${missingAlt.length} image(s) without alt text`);

  if (words < LIMITS.minWords) add('warn', 'depth', `Only ${words} words (under ${LIMITS.minWords})`);
  if (h2 < LIMITS.minH2) add('warn', 'structure', `Only ${h2} H2 section(s); scannable structure helps readers and search`);
  if (a.kind === 'case-study' && !Array.isArray(a.data.stats)) add('warn', 'receipts', 'Case study has no headline `stats` in frontmatter');
  return f;
}
