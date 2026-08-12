import type { Key } from '../types/keyboard';
import type { PerKeyColors } from '../models/LightingCodec';

/**
 * A per-key RGB color profile that paints a flag across the keyboard.
 *
 * Colors are deliberately saturated rather than true-to-print: RGB keycaps
 * wash pastels out badly, so the palettes here are neon interpretations.
 */
export interface ColorProfile {
  id: string;
  label: string;
  group: 'Pride' | 'National';
  /** Colors shown left-to-right in the UI preview swatch. */
  swatch: string[];
  build: (keys: Key[]) => PerKeyColors;
}

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb {
  const normalized = hex.replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

/** Keys within this many pixels of vertical offset are treated as the same physical row. */
const ROW_TOLERANCE_PX = 15;

/**
 * Groups keys into physical rows based on their vertical position, top to bottom.
 */
function groupKeysByRow(keys: Key[]): Key[][] {
  const sorted = [...keys].sort((a, b) => a.rect[1] - b.rect[1]);
  const rows: Key[][] = [];

  for (const key of sorted) {
    const top = key.rect[1];
    const currentRow = rows[rows.length - 1];
    if (currentRow && Math.abs(currentRow[0].rect[1] - top) <= ROW_TOLERANCE_PX) {
      currentRow.push(key);
    } else {
      rows.push([key]);
    }
  }

  return rows;
}

/** Bounding box of every key, in the KB.ini image pixel space. */
function boundsOf(keys: Key[]) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const key of keys) {
    left = Math.min(left, key.rect[0]);
    top = Math.min(top, key.rect[1]);
    right = Math.max(right, key.rect[2]);
    bottom = Math.max(bottom, key.rect[3]);
  }
  return { left, top, right, bottom, width: right - left || 1, height: bottom - top || 1 };
}

function centerOf(key: Key) {
  return {
    x: (key.rect[0] + key.rect[2]) / 2,
    y: (key.rect[1] + key.rect[3]) / 2,
  };
}

/**
 * Builds per-key colors that paint horizontal stripes across the keyboard's
 * physical rows, first stripe at the top.
 */
export function buildStripedPerKeyColors(keys: Key[], stripes: string[]): PerKeyColors {
  const rows = groupKeysByRow(keys);
  const numRows = rows.length;
  const numStripes = stripes.length;
  const colors: PerKeyColors = {};

  rows.forEach((rowKeys, rowIndex) => {
    // Sample at the row's centre rather than its top edge. When a flag has
    // more stripes than the board has rows some stripes are unavoidably lost,
    // and centre-sampling drops from the middle instead of lopping off the
    // final stripe - which keeps the outermost colors, and with them most of
    // the flag's recognisability.
    const stripeIndex = Math.min(
      numStripes - 1,
      Math.floor(((rowIndex + 0.5) / numRows) * numStripes),
    );
    const color = hexToRgb(stripes[stripeIndex]);
    for (const key of rowKeys) {
      colors[key.bIndex] = color;
    }
  });

  return colors;
}

/** Convenience wrapper so profiles can be declared as plain stripe lists. */
function stripes(colors: string[]) {
  return (keys: Key[]) => buildStripedPerKeyColors(keys, colors);
}

/**
 * Japan: a red disc centred on a white field. Distances are measured in units
 * of board height so the disc stays round on a keyboard that is much wider
 * than it is tall, instead of smearing into a wide ellipse.
 */
function buildJapanFlag(keys: Key[]): PerKeyColors {
  const RED = hexToRgb('#FF0018');
  const WHITE = hexToRgb('#FFFFFF');
  // The real flag's disc radius is 0.3 of the hoist, but a keyboard is ~3.5:1
  // rather than 3:2, so a true-scale disc lands on only a handful of keys and
  // reads as a dot. Enlarged until it covers roughly four rows.
  const DISC_RADIUS = 0.45;

  const { left, top, height, width } = boundsOf(keys);
  const cx = left + width / 2;
  const cy = top + height / 2;

  const colors: PerKeyColors = {};
  for (const key of keys) {
    const { x, y } = centerOf(key);
    const dx = (x - cx) / height;
    const dy = (y - cy) / height;
    colors[key.bIndex] = Math.sqrt(dx * dx + dy * dy) <= DISC_RADIUS ? RED : WHITE;
  }

  return colors;
}

/**
 * USA: alternating red/white rows with a blue canton over the top-left. The
 * stars are not representable at key resolution, so the canton is left solid.
 */
function buildUsaFlag(keys: Key[]): PerKeyColors {
  const RED = hexToRgb('#FF0018');
  const WHITE = hexToRgb('#FFFFFF');
  const BLUE = hexToRgb('#0033FF');
  // Real flag: canton spans 2/5 of the width and 7/13 of the height.
  const CANTON_WIDTH = 0.4;
  const CANTON_HEIGHT = 7 / 13;

  const { left, top, width, height } = boundsOf(keys);
  const cantonRight = left + width * CANTON_WIDTH;
  const cantonBottom = top + height * CANTON_HEIGHT;

  const rows = groupKeysByRow(keys);
  const colors: PerKeyColors = {};

  rows.forEach((rowKeys, rowIndex) => {
    const stripeColor = rowIndex % 2 === 0 ? RED : WHITE;
    for (const key of rowKeys) {
      const { x, y } = centerOf(key);
      const inCanton = x <= cantonRight && y <= cantonBottom;
      colors[key.bIndex] = inCanton ? BLUE : stripeColor;
    }
  });

  return colors;
}

/**
 * Intersex: a purple circle on a yellow field.
 *
 * The flag's circle is an unfilled ring, but a ring thin enough to be one is
 * narrower than the gap between key rows - rendered as a band it breaks into
 * scattered dots rather than reading as a circle. Filled is the legible
 * compromise at this resolution.
 */
function buildIntersexFlag(keys: Key[]): PerKeyColors {
  const YELLOW = hexToRgb('#FFD800');
  const PURPLE = hexToRgb('#A000FF');
  const CIRCLE_RADIUS = 0.4;

  const { left, top, width, height } = boundsOf(keys);
  const cx = left + width / 2;
  const cy = top + height / 2;

  const colors: PerKeyColors = {};
  for (const key of keys) {
    const { x, y } = centerOf(key);
    const dist = Math.sqrt(((x - cx) / height) ** 2 + ((y - cy) / height) ** 2);
    colors[key.bIndex] = dist <= CIRCLE_RADIUS ? PURPLE : YELLOW;
  }

  return colors;
}

/**
 * Brazil: green field, yellow rhombus, blue disc. The celestial globe's white
 * band and stars are far below what 70-odd keys can resolve, so the disc is
 * left solid.
 */
function buildBrazilFlag(keys: Key[]): PerKeyColors {
  const GREEN = hexToRgb('#00E05A');
  const YELLOW = hexToRgb('#FFDF00');
  const BLUE = hexToRgb('#0033FF');
  // Flag is 20x14 units: rhombus vertices sit 1.7 units in from each edge,
  // and the globe's radius is 3.5 units.
  const RHOMBUS_X = 8.3 / 10;
  const RHOMBUS_Y = 5.3 / 7;
  const GLOBE_RADIUS = 3.5 / 14;

  const { left, top, width, height } = boundsOf(keys);
  const cx = left + width / 2;
  const cy = top + height / 2;

  const colors: PerKeyColors = {};
  for (const key of keys) {
    const { x, y } = centerOf(key);
    // Rhombus uses each axis' own half-extent so it stretches with the board;
    // the globe is measured in height units so it stays round.
    const nx = (x - cx) / (width / 2);
    const ny = (y - cy) / (height / 2);
    const inRhombus = Math.abs(nx) / RHOMBUS_X + Math.abs(ny) / RHOMBUS_Y <= 1;
    const inGlobe = Math.sqrt(((x - cx) / height) ** 2 + ((y - cy) / height) ** 2) <= GLOBE_RADIUS;

    colors[key.bIndex] = inGlobe ? BLUE : inRhombus ? YELLOW : GREEN;
  }

  return colors;
}

export const colorProfiles: ColorProfile[] = [
  {
    id: 'trans-neon',
    label: 'Transgender (Neon)',
    group: 'Pride',
    swatch: ['#00C2FF', '#FF4FA3', '#FFFFFF', '#FF4FA3', '#00C2FF'],
    build: stripes(['#00C2FF', '#FF4FA3', '#FFFFFF', '#FF4FA3', '#00C2FF']),
  },
  {
    // Fully saturated channels - the most vibrant the LEDs can render, at the
    // cost of the flag's softer pink reading as magenta.
    id: 'trans-saturated',
    label: 'Transgender (Vivid)',
    group: 'Pride',
    swatch: ['#00FFFF', '#FF0090', '#FFFFFF', '#FF0090', '#00FFFF'],
    build: stripes(['#00FFFF', '#FF0090', '#FFFFFF', '#FF0090', '#00FFFF']),
  },
  {
    id: 'rainbow-neon',
    label: 'Rainbow Pride',
    group: 'Pride',
    swatch: ['#FF0018', '#FF6D00', '#FFFF00', '#00FF2F', '#00A2FF', '#B200FF'],
    build: stripes(['#FF0018', '#FF6D00', '#FFFF00', '#00FF2F', '#00A2FF', '#B200FF']),
  },
  {
    id: 'bisexual-neon',
    label: 'Bisexual',
    group: 'Pride',
    swatch: ['#FF0080', '#FF0080', '#B026FF', '#0040FF', '#0040FF'],
    build: stripes(['#FF0080', '#FF0080', '#B026FF', '#0040FF', '#0040FF']),
  },
  {
    id: 'pansexual-neon',
    label: 'Pansexual',
    group: 'Pride',
    swatch: ['#FF1B8D', '#FFD800', '#00C2FF'],
    build: stripes(['#FF1B8D', '#FFD800', '#00C2FF']),
  },
  {
    id: 'lesbian-neon',
    label: 'Lesbian',
    group: 'Pride',
    swatch: ['#FF4E00', '#FF9B55', '#FFFFFF', '#FF6FBF', '#D6006E'],
    build: stripes(['#FF4E00', '#FF9B55', '#FFFFFF', '#FF6FBF', '#D6006E']),
  },
  {
    id: 'nonbinary-neon',
    label: 'Non-binary',
    group: 'Pride',
    swatch: ['#FFFF00', '#FFFFFF', '#B026FF', '#000000'],
    build: stripes(['#FFFF00', '#FFFFFF', '#B026FF', '#000000']),
  },
  {
    id: 'genderfluid-neon',
    label: 'Genderfluid',
    group: 'Pride',
    swatch: ['#FF4FA3', '#FFFFFF', '#C400FF', '#000000', '#0040FF'],
    build: stripes(['#FF4FA3', '#FFFFFF', '#C400FF', '#000000', '#0040FF']),
  },
  {
    id: 'asexual-neon',
    label: 'Asexual',
    group: 'Pride',
    swatch: ['#000000', '#808080', '#FFFFFF', '#A000FF'],
    build: stripes(['#000000', '#808080', '#FFFFFF', '#A000FF']),
  },
  {
    id: 'aromantic-neon',
    label: 'Aromantic',
    group: 'Pride',
    swatch: ['#00FF40', '#7FFF6A', '#FFFFFF', '#808080', '#000000'],
    build: stripes(['#00FF40', '#7FFF6A', '#FFFFFF', '#808080', '#000000']),
  },
  {
    id: 'genderqueer-neon',
    label: 'Genderqueer',
    group: 'Pride',
    swatch: ['#C400FF', '#FFFFFF', '#00FF40'],
    build: stripes(['#C400FF', '#FFFFFF', '#00FF40']),
  },
  {
    id: 'polysexual-neon',
    label: 'Polysexual',
    group: 'Pride',
    swatch: ['#FF1B8D', '#00FF40', '#00A2FF'],
    build: stripes(['#FF1B8D', '#00FF40', '#00A2FF']),
  },
  {
    id: 'omnisexual-neon',
    label: 'Omnisexual',
    group: 'Pride',
    swatch: ['#FF9ACE', '#FF00BF', '#1A0033', '#8000FF', '#5C7CFF'],
    build: stripes(['#FF9ACE', '#FF00BF', '#1A0033', '#8000FF', '#5C7CFF']),
  },
  {
    id: 'abrosexual-neon',
    label: 'Abrosexual',
    group: 'Pride',
    swatch: ['#00D976', '#7FEBB0', '#FFFFFF', '#FF8FC4', '#FF0080'],
    build: stripes(['#00D976', '#7FEBB0', '#FFFFFF', '#FF8FC4', '#FF0080']),
  },
  {
    id: 'agender-neon',
    label: 'Agender',
    group: 'Pride',
    swatch: ['#000000', '#808080', '#FFFFFF', '#00FF40', '#FFFFFF', '#808080', '#000000'],
    build: stripes(['#000000', '#808080', '#FFFFFF', '#00FF40', '#FFFFFF', '#808080', '#000000']),
  },
  {
    id: 'aroace-neon',
    label: 'Aroace',
    group: 'Pride',
    swatch: ['#FF8C00', '#FFD800', '#FFFFFF', '#00C2FF', '#0040FF'],
    build: stripes(['#FF8C00', '#FFD800', '#FFFFFF', '#00C2FF', '#0040FF']),
  },
  {
    id: 'intersex',
    label: 'Intersex',
    group: 'Pride',
    swatch: ['#FFD800', '#A000FF', '#FFD800'],
    build: buildIntersexFlag,
  },
  {
    id: 'usa',
    label: 'United States',
    group: 'National',
    swatch: ['#0033FF', '#FF0018', '#FFFFFF', '#FF0018', '#FFFFFF'],
    build: buildUsaFlag,
  },
  {
    id: 'japan',
    label: 'Japan',
    group: 'National',
    swatch: ['#FFFFFF', '#FF0018', '#FFFFFF'],
    build: buildJapanFlag,
  },
  {
    id: 'brazil',
    label: 'Brazil',
    group: 'National',
    swatch: ['#00E05A', '#FFDF00', '#0033FF', '#FFDF00', '#00E05A'],
    build: buildBrazilFlag,
  },
];

/** Profile groups in display order, for the grouped dropdown. */
export const colorProfileGroups: ColorProfile['group'][] = ['Pride', 'National'];
