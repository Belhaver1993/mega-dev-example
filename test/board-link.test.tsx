import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { countStatuses } from '../src/digest/count.js';

const base = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };

describe('board link', () => {
  it('links both nights on disk with their counts', async () => {
    const res = await createApp({ ...base, runsDir: 'runs' }).request('/');
    const html = await res.text();
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('href="/digest/2026-10-28"');
    const c27 = countStatuses('runs', '2026-10-27');
    const c28 = countStatuses('runs', '2026-10-28');
    expect(c27).not.toBeNull();
    expect(c28).not.toBeNull();
    expect(html).toContain(`ok ${c27!.ok} · retry ${c27!.retry} · fail ${c27!.fail}`);
    expect(html).toContain(`ok ${c28!.ok} · retry ${c28!.retry} · fail ${c28!.fail}`);
  });

  it('counts lines per status and skips bad lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-'));
    writeFileSync(
      join(dir, '2026-01-01.jsonl'),
      [
        '{"status":"ok"}',
        '{"status":"retry"}',
        '{"status":"retry"}',
        '{"status":"fail"}',
        'not json',
        '{"status":"weird"}',
        '',
      ].join('\n'),
    );
    expect(countStatuses(dir, '2026-01-01')).toEqual({ ok: 1, retry: 2, fail: 1 });
    expect(countStatuses(dir, '2026-01-02')).toBeNull();
  });

  it('an empty night is linked with zero counts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-'));
    writeFileSync(join(dir, '2026-02-02.jsonl'), '');
    const html = await (await createApp({ ...base, runsDir: dir }).request('/')).text();
    expect(html).toContain('href="/digest/2026-02-02"');
    expect(html).toContain('ok 0 · retry 0 · fail 0');
  });
});
