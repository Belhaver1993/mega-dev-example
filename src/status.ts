import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { countStatuses } from './digest/count.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// Counts are null when the night's file can't be read.
export type NightSummary = { night: string; ok: number | null; retry: number | null; fail: number | null };

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => {
      const c = countStatuses(config.runsDir, night);
      return { night, ok: c?.ok ?? null, retry: c?.retry ?? null, fail: c?.fail ?? null };
    }),
  };
}
