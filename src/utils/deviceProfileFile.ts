import { z } from 'zod';
import type { FirmwareCode } from '../types/keycode';
import type { StandardLightingSettings } from '../models/LightingCodec';
import type { KeyboardDevice } from '../models/KeyboardDevice';
import { DeviceProfileSchema, type DeviceProfile } from './profileStorage';

const EXPORT_KIND = 'kludgeknight-device-profile';
const EXPORT_VERSION = 1;

const ExportSchema = z.object({
  kind: z.literal(EXPORT_KIND),
  version: z.number(),
  pid: z.string().optional(),
  keyboardName: z.string().optional(),
  profile: DeviceProfileSchema,
});

export interface ImportedDeviceProfile {
  mappings: Map<number, FirmwareCode>;
  lightingSettings: StandardLightingSettings | null;
  /** PID the file was exported from, for import mismatch warnings. */
  pid?: string;
  keyboardName?: string;
}

/** Serializes a device's current mappings and lighting as the JSON written to an exported file. */
export function serializeDeviceProfile(device: KeyboardDevice): string {
  const profile: DeviceProfile = {
    version: 2,
    mappings: Array.from(device.mappings.entries()),
  };
  if (device.lightingSettings) {
    profile.lightingSettings = device.lightingSettings;
  }

  return JSON.stringify(
    {
      kind: EXPORT_KIND,
      version: EXPORT_VERSION,
      pid: device.config.pid,
      keyboardName: device.config.name,
      profile,
    },
    null,
    2,
  );
}

/** Parses an imported settings file. */
export function parseDeviceProfile(
  json: string,
): { ok: true; data: ImportedDeviceProfile } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'That file isn’t valid JSON.' };
  }

  const result = ExportSchema.safeParse(data);
  if (!result.success) {
    return { ok: false, error: 'That file isn’t a Kludge Knight settings export.' };
  }

  const { profile, pid, keyboardName } = result.data;
  return {
    ok: true,
    data: {
      mappings: new Map((profile.mappings ?? []) as Array<[number, FirmwareCode]>),
      lightingSettings: (profile.lightingSettings as StandardLightingSettings | undefined) ?? null,
      pid,
      keyboardName,
    },
  };
}

/** Triggers a browser download of the device's settings as a .json file. */
export function downloadDeviceProfile(device: KeyboardDevice): void {
  const blob = new Blob([serializeDeviceProfile(device)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const safeName = device.config.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'keyboard';
  link.href = url;
  link.download = `kludgeknight-${safeName}-settings.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
