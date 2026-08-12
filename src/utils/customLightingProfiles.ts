import { z } from 'zod';
import type { PerKeyColors } from '../models/LightingCodec';

const STORAGE_KEY = 'kludgeknight_custom_lighting';
const EXPORT_KIND = 'kludgeknight-lighting-profile';
const EXPORT_VERSION = 1;

/** One key's color, stored as [bIndex, r, g, b] to keep exports compact. */
const KeyColorSchema = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().min(0).max(255),
  z.number().int().min(0).max(255),
  z.number().int().min(0).max(255),
]);

const CustomLightingProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** PID of the keyboard the profile was painted on, for import warnings. */
  pid: z.string().optional(),
  keyboardName: z.string().optional(),
  colors: z.array(KeyColorSchema),
  updatedAt: z.string(),
});

const ProfileListSchema = z.array(CustomLightingProfileSchema);

const ExportSchema = z.object({
  kind: z.literal(EXPORT_KIND),
  version: z.number(),
  profile: CustomLightingProfileSchema,
});

export type CustomLightingProfile = z.infer<typeof CustomLightingProfileSchema>;

/** Converts stored tuples into the map the lighting codec expects. */
export function toPerKeyColors(profile: CustomLightingProfile): PerKeyColors {
  const colors: PerKeyColors = {};
  for (const [bIndex, r, g, b] of profile.colors) {
    colors[bIndex] = { r, g, b };
  }
  return colors;
}

/** Converts a painted map into the compact stored form. */
export function fromPerKeyColors(colors: PerKeyColors): CustomLightingProfile['colors'] {
  return Object.entries(colors).map(([bIndex, color]) => [
    Number(bIndex),
    color.r,
    color.g,
    color.b,
  ]);
}

export function listCustomProfiles(): CustomLightingProfile[] {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return [];

    const result = ProfileListSchema.safeParse(JSON.parse(json));
    if (!result.success) {
      console.warn('Invalid custom lighting profiles:', z.prettifyError(result.error));
      return [];
    }
    return result.data;
  } catch (error) {
    console.error('Failed to load custom lighting profiles:', error);
    return [];
  }
}

/** Inserts or replaces a profile, newest first. */
export function saveCustomProfile(profile: CustomLightingProfile): CustomLightingProfile[] {
  const existing = listCustomProfiles().filter(p => p.id !== profile.id);
  const updated = [profile, ...existing];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save custom lighting profile:', error);
  }
  return updated;
}

export function deleteCustomProfile(id: string): CustomLightingProfile[] {
  const updated = listCustomProfiles().filter(p => p.id !== id);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to delete custom lighting profile:', error);
  }
  return updated;
}

export function createProfile(
  name: string,
  colors: PerKeyColors,
  device: { pid?: string; name?: string },
): CustomLightingProfile {
  return {
    id: crypto.randomUUID(),
    name,
    pid: device.pid,
    keyboardName: device.name,
    colors: fromPerKeyColors(colors),
    updatedAt: new Date().toISOString(),
  };
}

/** Serializes a profile as the JSON written to an exported file. */
export function serializeProfile(profile: CustomLightingProfile): string {
  return JSON.stringify({ kind: EXPORT_KIND, version: EXPORT_VERSION, profile }, null, 2);
}

/**
 * Parses an imported file. Accepts both the wrapped export envelope and a bare
 * profile object, since hand-edited files often drop the wrapper.
 */
export function parseProfile(
  json: string,
): { ok: true; profile: CustomLightingProfile } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'That file isn’t valid JSON.' };
  }

  const wrapped = ExportSchema.safeParse(data);
  if (wrapped.success) {
    return { ok: true, profile: wrapped.data.profile };
  }

  const bare = CustomLightingProfileSchema.safeParse(data);
  if (bare.success) {
    return { ok: true, profile: bare.data };
  }

  return { ok: false, error: 'That file isn’t a Kludge Knight lighting profile.' };
}

/** Triggers a browser download of the profile as a .json file. */
export function downloadProfile(profile: CustomLightingProfile): void {
  const blob = new Blob([serializeProfile(profile)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const safeName = profile.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'profile';
  link.href = url;
  link.download = `kludgeknight-${safeName}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
