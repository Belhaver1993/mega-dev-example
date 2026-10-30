import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const base = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };
const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('digest page', () => {
  it('renders 2026-10-28 with jobs and — for missing values', async () => {
    const res = await createApp({ ...base, runsDir: 'runs' }).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('rig/rotate-logs');
    expect(html).toContain('lane/sync');
    expect(html).toContain('<td>—</td>');
  });

  it('returns 404 in the layout for a night with no file', async () => {
    const res = await createApp({ ...base, runsDir: 'runs' }).request('/digest/2020-01-01');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('<header>');
  });

  it('returns 404 for an invalid night', async () => {
    const res = await createApp({ ...base, runsDir: 'runs' }).request('/digest/nope');
    expect(res.status).toBe(404);
  });

  it('says nothing ran for an empty night', async () => {
    writeFileSync(join(tmp, '2026-01-01.jsonl'), '');
    const res = await createApp({ ...base, runsDir: tmp }).request('/digest/2026-01-01');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('notes bad lines and marks a flagged row with text', async () => {
    const lines = [
      '{"at":"2026-01-02T01:00:00+01:00","job":"a/b","status":"retry"}',
      '{"at":"2026-01-02T01:05:00+01:00","job":"a/b","status":"retry"}',
      '{"at":"2026-01-02T01:10:00+01:00","job":"a/b","status":"retry"}',
      '{"at":"2026-01-02T01:15:00+01:00","job":"a/b","status":"fail","error":"boom"}',
      'not json',
    ];
    writeFileSync(join(tmp, '2026-01-02.jsonl'), lines.join('\n'));
    const res = await createApp({ ...base, runsDir: tmp }).request('/digest/2026-01-02');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line in the log could not be read');
    expect(html).toContain('class="warn"');
    expect(html).toContain('retries ≥ 3, fail');
    expect(html).toContain('2026-01-02T01:00:00+01:00');
  });
});
