import fs from 'node:fs';
import path from 'node:path';

/** Everything a project can change without touching code. Paths are relative to the config file. */
export type GateConfig = {
  root: string;
  contentDirs: string[];
  extensions: string[];
  ledgerPath: string;
  cachePath: string;
  reportDir: string;
  /** Score out of 10 an article needs to pass. */
  passScore: number;
  /** Per-kind overrides, e.g. profile pages that no reader profile fits well publish at a lower bar. */
  passScoreByKind: Record<string, number>;
  /** Scores within this many points under the bar publish, but are listed for a person to read. */
  reviewMargin: number;
  calibrationFile: string;
};

const DEFAULTS: Omit<GateConfig, 'root'> = {
  contentDirs: ['content'],
  extensions: ['.md', '.mdx'],
  ledgerPath: '.quality/article-scores.json',
  cachePath: '.quality/cache.json',
  reportDir: 'reports',
  passScore: 8,
  passScoreByKind: {},
  reviewMargin: 1,
  calibrationFile: 'calibration/goldens.json',
};

export function loadConfig(file = process.env.ARTICLE_GATE_CONFIG ?? 'article-gate.config.json'): GateConfig {
  const abs = path.resolve(file);
  const root = path.dirname(abs);
  const user = fs.existsSync(abs) ? JSON.parse(fs.readFileSync(abs, 'utf8')) : {};
  return { ...DEFAULTS, ...user, root };
}

export const resolve = (cfg: GateConfig, p: string) => path.resolve(cfg.root, p);

export const passScoreFor = (cfg: Pick<GateConfig, 'passScore' | 'passScoreByKind'>, kind?: string): number =>
  (kind ? cfg.passScoreByKind[kind] : undefined) ?? cfg.passScore;

export const reviewScoreFor = (cfg: Pick<GateConfig, 'passScore' | 'passScoreByKind' | 'reviewMargin'>, kind?: string) =>
  passScoreFor(cfg, kind) - cfg.reviewMargin;
