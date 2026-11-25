import type { ReactNode } from 'react';
import type { Snapshot } from '@clearview/shared';
import { Box, Note } from '../components/Box';

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
        <Note>connecting…</Note>
      </Box>
    );
  }
  if (!snap.configured) {
    return (
      <Box title={title}>
        <Note>{setup}</Note>
      </Box>
    );
  }
  if (!snap.data) {
    return (
      <Box title={title}>
        <Note tone="err">⚠ {snap.error ?? 'no data yet'}</Note>
      </Box>
    );
  }
  return (
    <>
      {!snap.ok && <Note tone="err">⚠ {snap.error} (showing last good data)</Note>}
      {children(snap.data)}
    </>
  );
}

/** Inline version for small panels: no surrounding Box. */
export function inlineState<T>(snap: Snapshot<T> | null, setup: string): ReactNode | null {
  if (!snap) return <Note>connecting…</Note>;
  if (!snap.configured) return <Note>{setup}</Note>;
  if (!snap.data) return <Note tone="err">⚠ {snap.error ?? 'no data yet'}</Note>;
  return null;
}
