import type { ReactNode } from 'react';
import type { Snapshot } from '@clearview/shared';
import { Box, Loading, Note } from '../components/Box';

interface GateProps<T> {
  snap: Snapshot<T> | null;
  /** box title shown while loading or when the source is not configured */
  title: string;
  /** what to tell the user when the source has no config */
  setup: ReactNode;
  children: (data: T) => ReactNode;
}

/** Handles the three non-happy states every data source can be in: loading, not configured, failing. */
export function Gate<T>({ snap, title, setup, children }: GateProps<T>) {
  if (!snap) {
    return (
      <Box title={title}>
        <Loading what={title} />
      </Box>
    );
  }
  if (!snap.configured) {
    return (
      <Box title={title}>
        <div className="setup">{setup}</div>
      </Box>
    );
  }
  if (!snap.data) {
    return (
      <Box title={title}>
        <Note tone="err">{snap.error ?? 'no data yet'}</Note>
        <Note>clearview keeps trying on its own.</Note>
      </Box>
    );
  }
  return (
    <>
      {!snap.ok && <Note tone="err">{snap.error} (showing the last data received)</Note>}
      {children(snap.data)}
    </>
  );
}

/** Inline version for small panels: no surrounding Box. */
export function inlineState<T>(snap: Snapshot<T> | null, what: string, setup: ReactNode): ReactNode | null {
  if (!snap) return <Loading what={what} />;
  if (!snap.configured) return <div className="setup">{setup}</div>;
  if (!snap.data) return <Note tone="err">{snap.error ?? 'no data yet'}</Note>;
  return null;
}
