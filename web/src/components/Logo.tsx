// "clearview" in square blocks, like the usage meters. Drawn rather than typed, so it looks the same
// with every font. Seven rows per letter: two for ascenders and the dot, five below them.
const GLYPHS: Record<string, string[]> = {
  c: ['.....', '.....', '.####', '#....', '#....', '#....', '.####'],
  l: ['#.', '#.', '#.', '#.', '#.', '#.', '.#'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.####'],
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  r: ['....', '....', '#.##', '##..', '#...', '#...', '#...'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  i: ['#', '.', '#', '#', '#', '#', '#'],
  w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
};

const ROWS = 7;
/** from one block to the next; the block itself is one unit smaller, which leaves the gap */
const STEP = 5;
const BLOCK = STEP - 1;

function draw(word: string): { path: string; columns: number } {
  let path = '';
  let left = 0;
  for (const letter of word) {
    const rows = GLYPHS[letter]!;
    rows.forEach((row, y) => {
      [...row].forEach((pixel, x) => {
        if (pixel === '#') path += `M${(left + x) * STEP} ${y * STEP}h${BLOCK}v${BLOCK}h-${BLOCK}z`;
      });
    });
    left += rows[0]!.length + 1; // one empty column between letters
  }
  return { path, columns: left - 1 };
}

const { path, columns } = draw('clearview');

export function Logo() {
  return (
    <svg className="logo" viewBox={`0 0 ${columns * STEP - 1} ${ROWS * STEP - 1}`} role="img" aria-label="clearview">
      <path d={path} />
    </svg>
  );
}
