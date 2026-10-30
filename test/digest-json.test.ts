import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { Night } from '../src/digest/types.js';

const tempDirs: string[] = [];

function configFor(runsDir: string): RigConfig {
  return { adapter: 'test', installed: '2026-10-01', beatEverySeconds: 60, runsDir };
}

function tempRuns(night: string, content: string): RigConfig {
  const dir = mkdtempSync(join(tmpdir(), 'rig-json-'));
  tempDirs.push(dir);
  writeFileSync(join(dir, `${night}.jsonl`), content);
  return configFor(dir);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('GET /api/digest/:night', () => {
  it('returns the 5 jobs of 2026-10-28 in order', async () => {
    const res = await createApp(configFor('runs')).request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.night).toBe('2026-10-28');
    expect(body.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('404s for a night with no file', async () => {
    const res = await createApp(configFor('runs')).request('/api/digest/2020-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('404s for an invalid night', async () => {
    const res = await createApp(configFor('runs')).request('/api/digest/nope');
    expect(res.status).toBe(404);
  });

  it('returns no rows for an empty night', async () => {
    const res = await createApp(tempRuns('2026-10-30', '')).request('/api/digest/2026-10-30');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-10-30', rows: [], badLines: 0 });
  });

  it('counts a bad line', async () => {
    const good = '{"at":"2026-10-30T01:00:00+01:00","job":"a/b","status":"ok","owner":"x"}\n';
    const res = await createApp(tempRuns('2026-10-30', `${good}not json\n`)).request(
      '/api/digest/2026-10-30',
    );
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
  });
});
