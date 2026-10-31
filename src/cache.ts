import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RUBRIC_VERSION } from './rubric.ts';
import type { Dims } from './score.ts';

/** Judge answers cached by (rubric version, judge id, inputs): re-running with new thresholds costs nothing. */
export class AnswerCache {
  private data: Record<string, Dims>;
  hits = 0;
  misses = 0;

  constructor(private file: string, fresh = false) {
    this.data = !fresh && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  }

  static key(...parts: string[]) {
    return crypto.createHash('sha1').update([RUBRIC_VERSION, ...parts].join('\u0000')).digest('hex');
  }

  async get(key: string, fn: () => Promise<Dims>): Promise<Dims> {
    if (this.data[key]) {
      this.hits++;
      return this.data[key];
    }
    this.misses++;
    const v = await fn();
    this.data[key] = v;
    return v;
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data));
  }
}
