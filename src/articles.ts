import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { resolve, type GateConfig } from './config.ts';
import { articleAudience, type Audience } from './rubric.ts';

export type Article = {
  /** Stable id: path relative to the config root, without extension. Used as the ledger key. */
  id: string;
  file: string;
  title: string;
  description: string;
  kind: string;
  audience: Audience;
  status: string;
  date: unknown;
  body: string;
  data: Record<string, unknown>;
};

export class FrontmatterError extends Error {}

export function parseArticle(file: string, root: string): Article {
  const raw = fs.readFileSync(file, 'utf8');
  let parsed;
  try {
    parsed = matter(raw);
  } catch (e) {
    throw new FrontmatterError(`${path.relative(root, file)}: frontmatter does not parse: ${String(e).split('\n')[0]}`);
  }
  const { data, content } = parsed;
  const rel = path.relative(root, file).split(path.sep).join('/');
  return {
    id: rel.replace(/\.(md|mdx)$/, ''),
    file,
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    kind: String(data.kind ?? ''),
    audience: articleAudience(data.audience),
    status: String(data.status ?? 'published'),
    date: data.date,
    body: content,
    data,
  };
}

/** Every article file under the configured content dirs (not recursive into subfolders). */
export function articleFiles(cfg: GateConfig): string[] {
  return cfg.contentDirs.flatMap((dir) => {
    const abs = resolve(cfg, dir);
    if (!fs.existsSync(abs)) return [];
    return fs
      .readdirSync(abs)
      .filter((f) => cfg.extensions.some((ext) => f.endsWith(ext)))
      .sort()
      .map((f) => path.join(abs, f));
  });
}

export function loadArticles(cfg: GateConfig, { drafts = false, only }: { drafts?: boolean; only?: string } = {}) {
  const articles: Article[] = [];
  const errors: string[] = [];
  for (const file of articleFiles(cfg)) {
    try {
      const a = parseArticle(file, cfg.root);
      if (a.status === 'draft' && !drafts) continue;
      if (only && !a.id.includes(only)) continue;
      articles.push(a);
    } catch (e) {
      errors.push(String((e as Error).message));
    }
  }
  return { articles, errors };
}

/** The first prose paragraph: what the hook question is asked about. */
export function openingOf(body: string): string {
  return (
    body
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !p.startsWith('#') && !p.startsWith('<') && !p.startsWith('**In short')) ?? ''
  );
}
