import type { DigestRow, Night } from '../digest/types.js';

const MISSING = '—';

// A row is flagged when it retried 3 or more times, or its last status is `fail`.
// The mark is text, so it does not depend on colour.
function marks(row: DigestRow): string[] {
  const found: string[] = [];
  if (row.retries >= 3) found.push('retries ≥ 3');
  if (row.lastStatus === 'fail') found.push('fail');
  return found;
}

export function DigestTable(props: { rows: readonly DigestRow[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>job</th>
          <th>owner</th>
          <th>runs</th>
          <th>retries</th>
          <th>last status</th>
          <th>last error</th>
          <th>first</th>
          <th>last</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr class={marks(row).length > 0 ? 'warn' : undefined}>
            <td>{row.job}</td>
            <td>{row.owner ?? MISSING}</td>
            <td>{row.runs}</td>
            <td>{row.retries}</td>
            <td>
              {row.lastStatus}
              {marks(row).length > 0 ? ` (${marks(row).join(', ')})` : ''}
            </td>
            <td>{row.lastError ?? MISSING}</td>
            <td>{row.firstAt}</td>
            <td>{row.lastAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DigestPage(props: { night: Night }) {
  const { night } = props;
  return (
    <>
      <h1>digest · {night.night}</h1>
      {night.badLines > 0 ? (
        <p class="mute">
          {night.badLines} {night.badLines === 1 ? 'line' : 'lines'} in the log could not be read.
        </p>
      ) : null}
      {night.rows.length === 0 ? <p>nothing ran</p> : <DigestTable rows={night.rows} />}
    </>
  );
}

export function DigestNotFound(props: { night: string }) {
  return (
    <>
      <h1>digest · {props.night}</h1>
      <p>No run log for this night.</p>
    </>
  );
}
