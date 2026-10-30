import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, RunStatus } from './types.js';

// One parsed log line. Everything after `parseLine` trusts this shape.
type LogLine = {
  at: string;
  instant: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

// ISO 8601 with an explicit offset (Z or ±hh:mm). The offset is what we keep for display.
const AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const NIGHT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

// Parses one JSONL line. Returns null for anything that is not a valid log entry.
function parseLine(text: string): LogLine | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;

  const { at, job, status, owner, error } = raw;
  if (typeof at !== 'string' || !AT_PATTERN.test(at)) return null;
  const instant = Date.parse(at);
  if (Number.isNaN(instant)) return null;
  if (typeof job !== 'string' || job.length === 0) return null;
  if (!isStatus(status)) return null;
  // A missing owner is the same as `null`: the row stays, the view shows `—`.
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;

  return {
    at,
    instant,
    job,
    status,
    owner: owner ?? null,
    error: error ?? null,
  };
}

type Acc = {
  row: DigestRow;
  firstInstant: number;
  lastInstant: number;
  lastErrorInstant: number;
};

function toRows(lines: readonly LogLine[]): DigestRow[] {
  const byJob = new Map<string, Acc>();

  for (const line of lines) {
    const acc = byJob.get(line.job);
    if (!acc) {
      byJob.set(line.job, {
        row: {
          job: line.job,
          owner: line.owner,
          runs: 1,
          retries: line.status === 'retry' ? 1 : 0,
          lastStatus: line.status,
          lastError: line.error,
          firstAt: line.at,
          lastAt: line.at,
        },
        firstInstant: line.instant,
        lastInstant: line.instant,
        lastErrorInstant: line.error === null ? -Infinity : line.instant,
      });
      continue;
    }

    const { row } = acc;
    row.runs += 1;
    if (line.status === 'retry') row.retries += 1;
    if (line.instant < acc.firstInstant) {
      acc.firstInstant = line.instant;
      row.firstAt = line.at;
    }
    // Ties go to the later line in the file.
    if (line.instant >= acc.lastInstant) {
      acc.lastInstant = line.instant;
      row.lastAt = line.at;
      row.lastStatus = line.status;
      if (line.owner !== null) row.owner = line.owner;
    } else if (row.owner === null && line.owner !== null) {
      row.owner = line.owner;
    }
    // The most recent error of the night, so a job that retried and then recovered still says why.
    if (line.error !== null && line.instant >= acc.lastErrorInstant) {
      acc.lastErrorInstant = line.instant;
      row.lastError = line.error;
    }
  }

  return [...byJob.values()]
    .map((acc) => acc.row)
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
}

// Reads runs/<night>.jsonl. Returns null when the night has no file.
// `night` must be a YYYY-MM-DD date, so it can never point outside `runsDir`.
export function readNight(runsDir: string, night: string): Night | null {
  if (!NIGHT_PATTERN.test(night)) return null;
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;

  const lines: LogLine[] = [];
  let badLines = 0;
  for (const text of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (text.trim() === '') continue;
    const line = parseLine(text);
    if (line) lines.push(line);
    else badLines += 1;
  }

  return { night, rows: toRows(lines), badLines };
}
