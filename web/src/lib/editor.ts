/** Which edit form is open. `index`/`name` null means "add new". */
export type Editor =
  | { kind: 'link'; index: number | null }
  | { kind: 'group'; index: number | null }
  | { kind: 'shortcut'; key: string | null }
  | { kind: 'container'; name: string | null };
