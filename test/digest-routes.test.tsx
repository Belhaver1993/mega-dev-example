import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Both digest routes, one temp runs dir. `runs/` is only read, for the consistency test.
const base = { adapter: 'test', installed: '2026-10-01T00:00:00+01:00', beatEverySeconds: 60 };
const tmp = mkdtempSync(join(tmpdir(), 'rig-routes-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const good = '{"at":"2026-02-01T01:00:00+01:00","job":"a/b","status":"ok","owner":"x"}';
writeFileSync(join(tmp, '2026-02-01.jsonl'), `${good}\n`);
writeFileSync(join(tmp, '2026-02-02.jsonl'), '');
writeFileSync(join(tmp, '2026-02-03.jsonl'), `${good}\nnot json\n`);

const app = createApp({ ...base, runsDir: tmp });

describe.each([
  ['page', '/digest/'],
  ['json', '/api/digest/'],
])('digest %s route', (kind, prefix) => {
  const get = (night: string) => app.request(prefix + night);

  it('200 for a normal night', async () => {
    const res = await get('2026-02-01');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('a/b');
  });

  it('404 for a night with no file', async () => {
    const res = await get('2026-02-09');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain(kind === 'json' ? 'not found' : 'No run log');
  });

  it('empty night', async () => {
    const res = await get('2026-02-02');
    expect(res.status).toBe(200);
    if (kind === 'json') {
      expect(await res.json()).toEqual({ night: '2026-02-02', rows: [], badLines: 0 });
    } else {
      expect(await res.text()).toContain('nothing ran');
    }
  });

  it('night with a bad line', async () => {
    const res = await get('2026-02-03');
    expect(res.status).toBe(200);
    if (kind === 'json') {
      const body = (await res.json()) as Night;
      expect(body.badLines).toBe(1);
      expect(body.rows).toHaveLength(1);
    } else {
      const html = await res.text();
      expect(html).toContain('1 line in the log could not be read');
      expect(html).toContain('a/b');
    }
  });
});

describe('page and JSON agree', () => {
  it('2026-10-28 lists the same jobs in the same order', async () => {
    const real = createApp({ ...base, runsDir: 'runs' });
    const json = (await (await real.request('/api/digest/2026-10-28')).json()) as Night;
    const html = await (await real.request('/digest/2026-10-28')).text();
    const jobs = json.rows.map((r) => r.job);
    expect(jobs.length).toBeGreaterThan(0);
    const cells = [...html.matchAll(/<tr[^>]*><td>([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(cells).toEqual(jobs);
  });
});
