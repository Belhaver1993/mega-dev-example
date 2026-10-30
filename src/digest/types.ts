export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in a night's run log. `owner` is null when the log has none: the row stays,
// the view shows `—`. Times keep the offset from the log (never converted to UTC).
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  rows: DigestRow[];
  // Lines that did not parse. Counted, never thrown.
  badLines: number;
};

// Reads runs/<night>.jsonl. Returns null when the night has no file.
export type ReadNight = (runsDir: string, night: string) => Night | null;

export declare function readNight(runsDir: string, night: string): Night | null;
