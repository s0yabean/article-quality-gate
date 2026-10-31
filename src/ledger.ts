import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Fingerprint of an article's published words. Shared by the scorer (which records it)
 * and the gate (which recomputes it), so any edit after scoring shows up as "not re-scored".
 * Reader and kind are stored next to it, not inside it, so the gate can say which one changed.
 */
export function articleHash({ title, description, body }: { title: string; description: string; body: string }): string {
  return crypto.createHash('sha1').update([title, description, body].join('\u0000')).digest('hex').slice(0, 16);
}

export type LedgerEntry = {
  score: number;
  pass: boolean;
  hash: string;
  audience: string;
  kind: string;
  rubric: string;
  judge: string;
  judgedAt: string;
  substance: number;
  delivery: number;
  fit: number;
  /** Structural gates that failed. Any entry here blocks the article whatever its score. */
  structural: string[];
};

export type Ledger = {
  note?: string;
  rubric?: string;
  passScore?: number;
  entries: Record<string, LedgerEntry>;
};

export function readLedger(file: string): Ledger {
  if (!fs.existsSync(file)) return { entries: {} };
  const l = JSON.parse(fs.readFileSync(file, 'utf8')) as Ledger;
  return { ...l, entries: l.entries ?? {} };
}

export function writeLedger(file: string, ledger: Ledger) {
  const sorted = Object.fromEntries(Object.entries(ledger.entries).sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        note: 'Written by `article-gate score`. Checked by `article-gate check` before a build or commit. Do not edit by hand.',
        rubric: ledger.rubric,
        passScore: ledger.passScore,
        entries: sorted,
      },
      null,
      2,
    ) + '\n',
  );
}
