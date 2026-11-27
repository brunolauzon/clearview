/** What every view with a filterable, selectable list receives. */
export interface ListProps {
  filter: string;
  sel: number;
  onSelect: (index: number) => void;
  onClearFilter: () => void;
}
