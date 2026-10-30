import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';
import type { ReadNight } from '../src/digest/types.js';

// The implementation must match the signature section 2 builds against.
const reader: ReadNight = readNight;

const tempDirs: string[] = [];

function nightDir(night: string, lines: readonly string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  tempDirs.push(dir);
  writeFileSync(join(dir, `${night}.jsonl`), lines.join('\n'));
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = reader('runs', '2026-10-28');

  it('gives 5 jobs, sorted by job, and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries per job and keeps the log offsets', () => {
    const byJob = new Map(night?.rows.map((r) => [r.job, r]));
    expect(byJob.get('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(byJob.get('lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
    expect(byJob.get('notes/backup')).toMatchObject({
      owner: 'lane-07',
      runs: 1,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
  });

  it('keeps the row of a job with a null owner', () => {
    const row = night?.rows.find((r) => r.job === 'digest/render');
    expect(row).toMatchObject({ owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null });
  });
});

describe('readNight edge cases', () => {
  it('returns null when the night has no file', () => {
    const dir = nightDir('2026-01-01', []);
    expect(readNight(dir, '2026-01-02')).toBeNull();
  });

  it('returns null for a night that is not a date', () => {
    const dir = nightDir('2026-01-01', []);
    expect(readNight(dir, '../2026-01-01')).toBeNull();
  });

  it('returns no rows for an empty file', () => {
    const dir = nightDir('2026-01-01', []);
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('keeps a null owner', () => {
    const dir = nightDir('2026-01-01', ['{"at":"2026-01-01T23:00:00+01:00","job":"a","status":"ok","owner":null}']);
    expect(readNight(dir, '2026-01-01')?.rows).toEqual([
      {
        job: 'a',
        owner: null,
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-01-01T23:00:00+01:00',
        lastAt: '2026-01-01T23:00:00+01:00',
      },
    ]);
  });

  it('counts lines with bad JSON or bad fields, and still reads the rest', () => {
    const dir = nightDir('2026-01-01', [
      '{"at":"2026-01-01T23:00:00+01:00","job":"a","status":"ok","owner":"rook"}',
      '{"at":"2026-01-01T23:',
      '[1,2,3]',
      '{"at":"2026-01-01T23:00:00+01:00","job":"a","status":"done","owner":"rook"}',
      '{"at":"not a time","job":"a","status":"ok","owner":"rook"}',
      '{"at":"2026-01-01T23:00:00","job":"a","status":"ok","owner":"rook"}',
      '{"at":"2026-01-01T23:00:00+01:00","status":"ok","owner":"rook"}',
      '{"at":"2026-01-01T23:00:00+01:00","job":"a","status":"ok","owner":7}',
      '{"at":"2026-01-01T23:00:00+01:00","job":"a","status":"fail","owner":"rook","error":{}}',
      '',
    ]);
    const night = readNight(dir, '2026-01-01');
    expect(night?.badLines).toBe(8);
    expect(night?.rows).toHaveLength(1);
    expect(night?.rows[0]).toMatchObject({ job: 'a', runs: 1 });
  });

  it('orders first and last by instant, not by offset or file order', () => {
    const dir = nightDir('2026-01-01', [
      // 22:30Z
      '{"at":"2026-01-01T23:30:00+01:00","job":"a","status":"fail","owner":"rook","error":"late"}',
      // 22:15Z: earlier instant, larger local hour in another offset
      '{"at":"2026-01-02T00:15:00+02:00","job":"a","status":"retry","owner":"rook","error":"early"}',
      // 22:00Z
      '{"at":"2026-01-01T22:00:00Z","job":"a","status":"ok","owner":"rook"}',
    ]);
    expect(readNight(dir, '2026-01-01')?.rows[0]).toMatchObject({
      runs: 3,
      retries: 1,
      firstAt: '2026-01-01T22:00:00Z',
      lastAt: '2026-01-01T23:30:00+01:00',
      lastStatus: 'fail',
      lastError: 'late',
    });
  });
});
