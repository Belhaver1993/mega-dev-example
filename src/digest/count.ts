import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunStatus } from './types.js';

export type StatusCounts = Record<RunStatus, number>;

const NIGHT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Counts log lines per status for runs/<night>.jsonl. Returns null when the night has no file.
// Lines that are not JSON objects with a known status are skipped.
export function countStatuses(runsDir: string, night: string): StatusCounts | null {
  if (!NIGHT_PATTERN.test(night)) return null;
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;

  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  for (const text of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (text.trim() === '') continue;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      continue;
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue;
    const status = (raw as Record<string, unknown>).status;
    if (status === 'ok' || status === 'retry' || status === 'fail') counts[status] += 1;
  }
  return counts;
}
