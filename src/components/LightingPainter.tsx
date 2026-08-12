import { useState, useEffect, useRef, useCallback } from 'react';
import type { KeyboardDevice } from '../models/KeyboardDevice';
import type { Key } from '../types/keyboard';
import type { PerKeyColors } from '../models/LightingCodec';
import { ColorWheel } from './ColorWheel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  listCustomProfiles,
  saveCustomProfile,
  deleteCustomProfile,
  createProfile,
  toPerKeyColors,
  parseProfile,
  downloadProfile,
  type CustomLightingProfile,
} from '../utils/customLightingProfiles';

interface LightingPainterProps {
  device: KeyboardDevice;
  /** Writes colors to the hardware; owns mode switching and error reporting. */
  onApplyColors: (colors: PerKeyColors) => Promise<void>;
  onNotify: (message: string) => void;
}

const PAINT_PRESETS = [
  { name: 'Red', r: 255, g: 0, b: 0 },
  { name: 'Orange', r: 255, g: 109, b: 0 },
  { name: 'Yellow', r: 255, g: 255, b: 0 },
  { name: 'Green', r: 0, g: 255, b: 47 },
  { name: 'Cyan', r: 0, g: 194, b: 255 },
  { name: 'Blue', r: 0, g: 64, b: 255 },
  { name: 'Purple', r: 178, g: 0, b: 255 },
  { name: 'Pink', r: 255, g: 79, b: 163 },
  { name: 'White', r: 255, g: 255, b: 255 },
  { name: 'Off', r: 0, g: 0, b: 0 },
];

/** Debounce before pushing a painted change to the keyboard. */
const APPLY_DEBOUNCE_MS = 250;

export function LightingPainter({ device, onApplyColors, onNotify }: LightingPainterProps) {
  const [painted, setPainted] = useState<PerKeyColors>({});
  const [brush, setBrush] = useState({ r: 0, g: 194, b: 255 });
  const [profiles, setProfiles] = useState<CustomLightingProfile[]>([]);
  const [profileName, setProfileName] = useState('');
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });

  const isPaintingRef = useRef(false);
  const applyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Skips the hardware write on the very first render so opening advanced mode
  // doesn't immediately blank the keyboard with an empty palette.
  const hasPaintedRef = useRef(false);

  useEffect(() => {
    setProfiles(listCustomProfiles());
  }, []);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImgSize({ width: img.width, height: img.height });
    img.src = device.config.imageUrl;
  }, [device.config.imageUrl]);

  // Painting is a drag gesture, so release has to be caught anywhere on screen
  useEffect(() => {
    const stop = () => { isPaintingRef.current = false; };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, []);

  // Push painted colors to the hardware, debounced so a drag across the board
  // doesn't queue a separate 7-buffer write per key.
  useEffect(() => {
    if (!hasPaintedRef.current) return;

    if (applyTimeoutRef.current) clearTimeout(applyTimeoutRef.current);
    applyTimeoutRef.current = setTimeout(() => {
      void onApplyColors(painted);
    }, APPLY_DEBOUNCE_MS);

    return () => {
      if (applyTimeoutRef.current) clearTimeout(applyTimeoutRef.current);
    };
  }, [painted, onApplyColors]);

  const paintKey = useCallback((bIndex: number) => {
    hasPaintedRef.current = true;
    setPainted(prev => ({ ...prev, [bIndex]: { ...brush } }));
  }, [brush]);

  const fillAll = () => {
    hasPaintedRef.current = true;
    const next: PerKeyColors = {};
    for (const key of device.config.keys) next[key.bIndex] = { ...brush };
    setPainted(next);
  };

  const clearAll = () => {
    hasPaintedRef.current = true;
    const next: PerKeyColors = {};
    for (const key of device.config.keys) next[key.bIndex] = { r: 0, g: 0, b: 0 };
    setPainted(next);
  };

  const handleSave = () => {
    const name = profileName.trim();
    if (!name) {
      onNotify('Give the profile a name first.');
      return;
    }
    if (Object.keys(painted).length === 0) {
      onNotify('Paint at least one key before saving.');
      return;
    }

    const profile = createProfile(name, painted, {
      pid: device.config.pid,
      name: device.config.name,
    });
    setProfiles(saveCustomProfile(profile));
    setProfileName('');
    onNotify(`Saved “${name}”.`);
  };

  const handleLoad = (profile: CustomLightingProfile) => {
    hasPaintedRef.current = true;
    setPainted(toPerKeyColors(profile));
    setProfileName(profile.name);
  };

  const handleDelete = (profile: CustomLightingProfile) => {
    setProfiles(deleteCustomProfile(profile.id));
  };

  const handleImportFile = async (file: File) => {
    const result = parseProfile(await file.text());
    if (!result.ok) {
      onNotify(result.error);
      return;
    }

    // bIndex values are layout-specific, so a profile from another model will
    // land on the wrong keys - worth saying, but not worth blocking.
    if (result.profile.pid && result.profile.pid !== device.config.pid) {
      onNotify(
        `Imported from a different keyboard (${result.profile.keyboardName ?? result.profile.pid}); colors may not line up.`,
      );
    }

    setProfiles(saveCustomProfile(result.profile));
    handleLoad(result.profile);
  };

  const renderKey = (key: Key) => {
    const [left, top, right, bottom] = key.rect;
    const color = painted[key.bIndex];
    const fill = color ? `rgb(${color.r}, ${color.g}, ${color.b})` : 'rgba(120, 120, 120, 0.25)';

    return (
      <rect
        key={key.bIndex}
        x={left}
        y={top}
        width={right - left}
        height={bottom - top}
        fill={fill}
        stroke="rgba(255,255,255,0.45)"
        strokeWidth={1}
        className="cursor-crosshair"
        onPointerDown={(e) => {
          e.preventDefault();
          isPaintingRef.current = true;
          paintKey(key.bIndex);
        }}
        onPointerEnter={() => {
          if (isPaintingRef.current) paintKey(key.bIndex);
        }}
      />
    );
  };

  const brushCss = `rgb(${brush.r}, ${brush.g}, ${brush.b})`;

  return (
    <div className="space-y-4">
      {/* Painting surface */}
      <div className="rounded-lg border border-border bg-black/80 p-3 touch-none">
        {imgSize.width > 0 ? (
          <svg
            viewBox={`0 0 ${imgSize.width} ${imgSize.height}`}
            className="w-full h-auto select-none"
            style={{ maxHeight: '320px' }}
          >
            {device.config.keys.map(renderKey)}
          </svg>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading keyboard…</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Click a key to paint it, or drag across several. Changes apply to the keyboard automatically.
      </p>

      {/* Brush */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Brush</span>
          <span
            className="h-5 w-8 rounded border border-border"
            style={{ backgroundColor: brushCss }}
            aria-label={`Current brush color ${brushCss}`}
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Brush colors">
          {PAINT_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => setBrush({ r: preset.r, g: preset.g, b: preset.b })}
              className="w-7 h-7 rounded border-2 border-border hover:border-primary transition-colors"
              style={{ backgroundColor: `rgb(${preset.r}, ${preset.g}, ${preset.b})` }}
              title={preset.name}
              aria-label={`Brush ${preset.name}`}
            />
          ))}
        </div>
        <ColorWheel color={brush} onChange={setBrush} size={160} />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fillAll}>Fill all</Button>
          <Button variant="outline" size="sm" onClick={clearAll}>Clear all</Button>
        </div>
      </div>

      {/* Save / import / export */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex gap-2">
          <Input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="Profile name"
            aria-label="Profile name"
          />
          <Button size="sm" onClick={handleSave}>Save</Button>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            Import…
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = ''; // let the same file be picked again
            }}
          />
        </div>

        {profiles.length > 0 && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground block">Saved Profiles</span>
            <ul className="flex flex-col gap-2">
              {profiles.map((profile) => (
                <li
                  key={profile.id}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <span className="flex-1 min-w-0">
                    <span className="text-sm text-foreground block truncate">{profile.name}</span>
                    {profile.pid !== device.config.pid && (
                      <span className="text-xs text-muted-foreground">
                        from {profile.keyboardName ?? profile.pid ?? 'another keyboard'}
                      </span>
                    )}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => handleLoad(profile)}>Load</Button>
                  <Button variant="outline" size="sm" onClick={() => downloadProfile(profile)}>Export</Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(profile)}>Delete</Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
