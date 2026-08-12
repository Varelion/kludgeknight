import type { Key } from '../types/keyboard';
import type { PerKeyColors } from '../models/LightingCodec';

/**
 * A striped per-key RGB color profile (top stripe first).
 */
export interface ColorProfile {
  id: string;
  label: string;
  /** Hex colors, ordered from the top stripe to the bottom stripe. */
  stripes: string[];
}

/**
 * A few variations on the transgender pride flag (designed by Monica Helms),
 * mapped onto the keyboard's physical rows top-to-bottom.
 */
export const transFlagProfiles: ColorProfile[] = [
  {
    id: 'trans-pride-classic',
    label: 'Trans Pride — Classic',
    stripes: ['#5BCEFA', '#F5A9B8', '#FFFFFF', '#F5A9B8', '#5BCEFA'],
  },
  {
    id: 'trans-pride-pastel',
    label: 'Trans Pride — Pastel',
    stripes: ['#A8DEF5', '#FBD1DE', '#FFFFFF', '#FBD1DE', '#A8DEF5'],
  },
  {
    id: 'trans-pride-neon',
    label: 'Trans Pride — Neon',
    stripes: ['#00C2FF', '#FF4FA3', '#FFFFFF', '#FF4FA3', '#00C2FF'],
  },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
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

/**
 * Builds per-key RGB colors that paint a striped profile across the keyboard's
 * physical rows (e.g. the transgender pride flag's horizontal stripes).
 */
export function buildStripedPerKeyColors(keys: Key[], stripes: string[]): PerKeyColors {
  const rows = groupKeysByRow(keys);
  const numRows = rows.length;
  const numStripes = stripes.length;
  const colors: PerKeyColors = {};

  rows.forEach((rowKeys, rowIndex) => {
    const stripeIndex = Math.min(numStripes - 1, Math.floor((rowIndex / numRows) * numStripes));
    const color = hexToRgb(stripes[stripeIndex]);
    for (const key of rowKeys) {
      colors[key.bIndex] = color;
    }
  });

  return colors;
}
