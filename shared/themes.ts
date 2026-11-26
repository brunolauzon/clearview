// Colour themes. Unlike types.ts this module exists at runtime: the server imports it (by relative
// path, so it is bundled) to validate theme names, and the web app paints from it. Main colours
// follow each scheme's published palette; a few secondary shades are chosen to fit this UI.

export interface Palette {
  /** page background */
  bg: string;
  /** raised or hovered surfaces: row hover, inputs */
  bgAlt: string;
  /** body text */
  fg: string;
  /** emphasised values */
  strong: string;
  /** secondary text */
  dim: string;
  /** barely-there text and chips */
  faint: string;
  border: string;
  /** headings, selection, highlights */
  accent: string;
  ok: string;
  warn: string;
  err: string;
  info: string;
}

export interface Theme {
  id: string;
  name: string;
  light: boolean;
  colors: Palette;
}

const theme = (id: string, name: string, colors: Palette, light = false): Theme => ({ id, name, light, colors });

export const THEMES: Theme[] = [
  // the built-in look; must match the :root values in web/src/theme.css (a test checks this)
  theme('clearview', 'Clearview', {
    bg: '#0d0d0f', bgAlt: '#17171b', fg: '#d7d7dc', strong: '#ffffff', dim: '#8a8a96', faint: '#4a4a54', border: '#35353d',
    accent: '#d97757', ok: '#62d08a', warn: '#e8b64c', err: '#f2616b', info: '#7aa7ff',
  }),
  theme('dracula', 'Dracula', {
    // dim is lighter than Dracula's comment colour (#6272a4), which is too faint for small hint text
    bg: '#282a36', bgAlt: '#343746', fg: '#f8f8f2', strong: '#ffffff', dim: '#8591be', faint: '#565970', border: '#44475a',
    accent: '#bd93f9', ok: '#50fa7b', warn: '#f1fa8c', err: '#ff5555', info: '#8be9fd',
  }),
  theme('nord', 'Nord', {
    bg: '#2e3440', bgAlt: '#3b4252', fg: '#d8dee9', strong: '#eceff4', dim: '#8f9bb3', faint: '#4c566a', border: '#434c5e',
    accent: '#88c0d0', ok: '#a3be8c', warn: '#ebcb8b', err: '#bf616a', info: '#81a1c1',
  }),
  theme('gruvbox', 'Gruvbox', {
    bg: '#282828', bgAlt: '#32302f', fg: '#ebdbb2', strong: '#fbf1c7', dim: '#a89984', faint: '#665c54', border: '#504945',
    accent: '#fe8019', ok: '#b8bb26', warn: '#fabd2f', err: '#fb4934', info: '#83a598',
  }),
  theme('tokyo-night', 'Tokyo Night', {
    bg: '#1a1b26', bgAlt: '#24283b', fg: '#c0caf5', strong: '#ffffff', dim: '#737aa2', faint: '#414868', border: '#3b4261',
    accent: '#7aa2f7', ok: '#9ece6a', warn: '#e0af68', err: '#f7768e', info: '#7dcfff',
  }),
  theme('catppuccin-mocha', 'Catppuccin Mocha', {
    bg: '#1e1e2e', bgAlt: '#313244', fg: '#cdd6f4', strong: '#ffffff', dim: '#9399b2', faint: '#585b70', border: '#45475a',
    accent: '#cba6f7', ok: '#a6e3a1', warn: '#f9e2af', err: '#f38ba8', info: '#89b4fa',
  }),
  theme('one-dark', 'One Dark', {
    bg: '#282c34', bgAlt: '#2c313c', fg: '#abb2bf', strong: '#ffffff', dim: '#7f848e', faint: '#4b5263', border: '#3e4451',
    accent: '#61afef', ok: '#98c379', warn: '#e5c07b', err: '#e06c75', info: '#56b6c2',
  }),
  theme('monokai', 'Monokai', {
    bg: '#272822', bgAlt: '#3e3d32', fg: '#f8f8f2', strong: '#ffffff', dim: '#a59f85', faint: '#75715e', border: '#49483e',
    accent: '#fd971f', ok: '#a6e22e', warn: '#e6db74', err: '#f92672', info: '#66d9ef',
  }),
  theme('solarized-dark', 'Solarized Dark', {
    bg: '#002b36', bgAlt: '#073642', fg: '#93a1a1', strong: '#eee8d5', dim: '#657b83', faint: '#586e75', border: '#1d4a55',
    accent: '#268bd2', ok: '#859900', warn: '#b58900', err: '#dc322f', info: '#2aa198',
  }),
  theme(
    'solarized-light',
    'Solarized Light',
    {
      bg: '#fdf6e3', bgAlt: '#eee8d5', fg: '#586e75', strong: '#073642', dim: '#839496', faint: '#c5c0ac', border: '#d9d2bd',
      accent: '#268bd2', ok: '#859900', warn: '#b58900', err: '#dc322f', info: '#2aa198',
    },
    true,
  ),
  theme(
    'catppuccin-latte',
    'Catppuccin Latte',
    {
      bg: '#eff1f5', bgAlt: '#e6e9ef', fg: '#4c4f69', strong: '#11111b', dim: '#7c7f93', faint: '#bcc0cc', border: '#ccd0da',
      accent: '#8839ef', ok: '#40a02b', warn: '#df8e1d', err: '#d20f39', info: '#1e66f5',
    },
    true,
  ),
];

export const DEFAULT_THEME_ID = 'clearview';

export const THEME_IDS: string[] = THEMES.map((t) => t.id);
