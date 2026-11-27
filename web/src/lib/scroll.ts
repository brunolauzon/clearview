/**
 * Scrolls a sideways-scrolling row just far enough that `item` is in sight. Only the row moves,
 * never the page (which `scrollIntoView` would also do).
 */
export function revealInRow(row: HTMLElement | null, item: HTMLElement | null | undefined, margin = 24): void {
  if (!row || !item) return;
  const box = row.getBoundingClientRect();
  const target = item.getBoundingClientRect();
  if (target.left < box.left + margin) row.scrollLeft -= box.left + margin - target.left;
  else if (target.right > box.right - margin) row.scrollLeft += target.right - (box.right - margin);
}
