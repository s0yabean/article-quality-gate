import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArticle, type Article } from '../src/articles.ts';
import { loadConfig } from '../src/config.ts';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const cfg = loadConfig(path.join(ROOT, 'article-gate.config.json'));
export const sample = (name: string): Article => parseArticle(path.join(ROOT, 'samples/articles', name), ROOT);
