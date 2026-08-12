import { useState, useEffect, useRef } from 'react';
import { useToast } from '../hooks/useToast';
import type { KeyboardDevice } from '../models/KeyboardDevice';
import type { LightingMode } from '../types/keyboard';
import type { StandardLightingSettings } from '../models/LightingCodec';
import { Slider } from '@/components/ui/slider';
import { LightingNotSupportedError, RGBNotSupportedError } from '../errors/KludgeKnightErrors';
import { ERROR_MESSAGES } from '../constants/errorMessages';
import { ColorWheel } from './ColorWheel';
import { Badge } from '@/components/ui/badge';
import { transFlagProfiles, buildStripedPerKeyColors, type ColorProfile } from '../utils/transFlagColorProfiles';

const SPEED_LABELS = ['Very Slow', 'Slow', 'Normal', 'Fast', 'Very Fast'];
const SLEEP_LABELS = ['5 min', '10 min', '20 min', '30 min', 'Off'];

interface LightingControlsProps {
  device: KeyboardDevice;
  initialSettings: StandardLightingSettings | null;
}

export function LightingControls({ device, initialSettings }: LightingControlsProps) {
  const toast = useToast();
  const [settings, setSettings] = useState<StandardLightingSettings | null>(initialSettings);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedModeRef = useRef<HTMLButtonElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showTopShadow, setShowTopShadow] = useState(false);
  const [showBottomShadow, setShowBottomShadow] = useState(false);
  const [activeColorProfileId, setActiveColorProfileId] = useState<string | null>(null);
  const [applyingColorProfileId, setApplyingColorProfileId] = useState<string | null>(null);

  const isDemo = !!device.isDemo;
  const selectedModeIndex = settings?.modeIndex ?? null;
  const customRgbMode = device.config.rgb
    ? device.config.lightingModes.find(m => m.name.toLowerCase().includes('custom'))
    : undefined;

  // Scroll to initially selected mode after layout and update shadows
  useEffect(() => {
    selectedModeRef.current?.scrollIntoView({ block: 'center' });

    // Check if scrollable and update shadows
    const container = scrollContainerRef.current;
    if (container) {
      const isScrollable = container.scrollHeight > container.clientHeight;
      setShowBottomShadow(isScrollable);
    }
  }, []);

  // Handle scroll to update shadows
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const scrollTop = target.scrollTop;
    const scrollHeight = target.scrollHeight;
    const clientHeight = target.clientHeight;

    // Only show shadows if content is scrollable
    const isScrollable = scrollHeight > clientHeight;

    // Show top shadow if scrolled down from top
    setShowTopShadow(isScrollable && scrollTop > 0);

    // Show bottom shadow if not at bottom (with 1px tolerance)
    setShowBottomShadow(isScrollable && scrollTop + clientHeight < scrollHeight - 1);
  };

  // Apply settings changes to device with debouncing
  useEffect(() => {
    if (!settings) {
      return;
    }

    // Debounce updates to avoid spamming device during slider drags
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    updateTimeoutRef.current = setTimeout(async () => {
      try {
        await device.setLighting(settings);
      } catch (error) {
        console.error('Failed to update lighting:', error);

        // Provide specific error message based on error type
        let errorMessage: string = ERROR_MESSAGES.LIGHTING_UPDATE_FAILED;
        if (error instanceof LightingNotSupportedError) {
          errorMessage = ERROR_MESSAGES.LIGHTING_NOT_SUPPORTED;
        } else if (error instanceof RGBNotSupportedError) {
          errorMessage = ERROR_MESSAGES.RGB_NOT_SUPPORTED;
        }

        toast.showError(errorMessage);
        // UI stays at user's setting - don't revert
      }
    }, 150); // 150ms debounce

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [settings, device, toast]);

  if (!device || !device.config.lightEnabled || !settings) {
    return null;
  }

  const speed = [settings.speed];
  const brightness = [settings.brightness];
  const color = settings.color;
  const randomColor = settings.randomColor;
  const sleep = [settings.sleep];

  const setSelectedModeIndex = (modeIndex: number) => {
    if (settings) setSettings({ ...settings, modeIndex });
  };

  const setSpeed = (newSpeed: number[]) => {
    if (settings) setSettings({ ...settings, speed: newSpeed[0] });
  };

  const setBrightness = (newBrightness: number[]) => {
    if (settings) setSettings({ ...settings, brightness: newBrightness[0] });
  };

  const setColor = (newColor: { r: number; g: number; b: number }) => {
    if (settings) setSettings({ ...settings, color: newColor });
  };

  const setRandomColor = (newRandomColor: boolean) => {
    if (settings) setSettings({ ...settings, randomColor: newRandomColor });
  };

  const setSleep = (newSleep: number[]) => {
    if (settings) setSettings({ ...settings, sleep: newSleep[0] });
  };

  const applyColorProfile = async (profile: ColorProfile) => {
    if (!settings || !customRgbMode) return;

    setApplyingColorProfileId(profile.id);
    try {
      if (settings.modeIndex !== customRgbMode.index) {
        const newSettings = { ...settings, modeIndex: customRgbMode.index };
        await device.setLighting(newSettings);
        setSettings(newSettings);
      }

      const colors = buildStripedPerKeyColors(device.config.keys, profile.stripes);
      await device.setPerKeyColors(colors);
      setActiveColorProfileId(profile.id);
    } catch (error) {
      console.error('Failed to apply color profile:', error);

      let errorMessage: string = ERROR_MESSAGES.LIGHTING_UPDATE_FAILED;
      if (error instanceof RGBNotSupportedError) {
        errorMessage = ERROR_MESSAGES.RGB_NOT_SUPPORTED;
      } else if (error instanceof LightingNotSupportedError) {
        errorMessage = ERROR_MESSAGES.LIGHTING_NOT_SUPPORTED;
      }
      toast.showError(errorMessage);
    } finally {
      setApplyingColorProfileId(null);
    }
  };

  const currentMode = device.config.lightingModes.find(m => m.index === selectedModeIndex);
  const flags = currentMode?.flags;
  const isOffMode = currentMode?.name.toLowerCase().includes('off') || false;

  const colorHex = `#${color.r.toString(16).padStart(2, '0')}${color.g.toString(16).padStart(2, '0')}${color.b.toString(16).padStart(2, '0')}`;

  return (
    <div className="flex justify-center">
      <div className="flex flex-wrap gap-8 justify-center">
        {/* Left column - Mode selector */}
        <div className="space-y-3 w-full sm:w-[300px]">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-foreground">Lighting Modes</h3>
          <span className="text-xs text-muted-foreground">
            {device.config.rgb ? 'RGB' : 'Single-color'}
          </span>
          {isDemo && (
            <Badge variant="outline" className="text-xs text-primary border-primary">
              DEMO
            </Badge>
          )}
        </div>
        <div className="relative border border-border rounded-lg overflow-hidden">
          {/* Top shadow overlay */}
          {showTopShadow && (
            <div
              className="absolute top-0 left-0 right-0 h-4 pointer-events-none z-10 bg-gradient-to-b from-foreground/10 to-transparent"
            />
          )}

          {/* Bottom shadow overlay */}
          {showBottomShadow && (
            <div
              className="absolute bottom-0 left-0 right-0 h-4 pointer-events-none z-10 bg-gradient-to-t from-foreground/10 to-transparent"
            />
          )}

          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="max-h-[300px] overflow-y-auto"
            role="listbox"
            aria-label="Lighting modes"
          >
            {device.config.lightingModes.map((mode: LightingMode) => (
              <button
                key={mode.index}
                ref={mode.index === selectedModeIndex ? selectedModeRef : null}
                onClick={() => setSelectedModeIndex(mode.index)}
                role="option"
                aria-selected={mode.index === selectedModeIndex}
                className={`w-full px-4 py-3 text-left text-sm transition-colors border-b border-border last:border-b-0 ${
                  mode.index === selectedModeIndex
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'bg-background text-foreground hover:bg-accent'
                }`}
              >
                {mode.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right column - Controls */}
      <div className="space-y-6 w-full sm:w-auto sm:max-w-md">
        {/* Color profiles - striped per-key presets (e.g. trans pride flag) */}
        {device.config.rgb && (
          <div className="space-y-3">
            <span className="text-sm font-medium text-foreground block">Color Profiles</span>
            {customRgbMode ? (
              <div className="flex flex-col gap-2">
                {transFlagProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => applyColorProfile(profile)}
                    disabled={applyingColorProfileId !== null}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                      activeColorProfileId === profile.id
                        ? 'border-primary bg-accent'
                        : 'border-border bg-background hover:bg-accent'
                    }`}
                    aria-pressed={activeColorProfileId === profile.id}
                  >
                    <span className="flex h-6 w-14 rounded overflow-hidden border border-border shrink-0">
                      {profile.stripes.map((stripe, i) => (
                        <span key={i} className="flex-1" style={{ backgroundColor: stripe }} />
                      ))}
                    </span>
                    <span className="text-sm text-foreground">
                      {applyingColorProfileId === profile.id ? 'Applying…' : profile.label}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                This keyboard doesn&apos;t expose a per-key custom color mode.
              </p>
            )}
          </div>
        )}

        {/* Sleep timer */}
        {!isOffMode && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="sleep-timer" className="text-sm font-medium text-foreground">Sleep Timer</label>
              <span className="text-sm text-muted-foreground">{SLEEP_LABELS[sleep[0] - 1]}</span>
            </div>
            <Slider
              id="sleep-timer"
              value={sleep}
              onValueChange={setSleep}
              min={1}
              max={5}
              step={1}
              aria-label="Sleep timer"
            />
          </div>
        )}

        {/* Speed slider */}
        {flags?.speed && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="speed-slider" className="text-sm font-medium text-foreground">Speed</label>
              <span className="text-sm text-muted-foreground">{SPEED_LABELS[speed[0] - 1]}</span>
            </div>
            <Slider
              id="speed-slider"
              value={speed}
              onValueChange={setSpeed}
              min={1}
              max={5}
              step={1}
              aria-label="Lighting speed"
            />
          </div>
        )}

        {/* Brightness slider */}
        {flags?.brightness && (
          <div className="space-y-3">
            <label htmlFor="brightness-slider" className="text-sm font-medium text-foreground">Brightness</label>
            <Slider
              id="brightness-slider"
              value={brightness}
              onValueChange={setBrightness}
              min={0}
              max={5}
              step={1}
              aria-label="Lighting brightness"
            />
          </div>
        )}

        {/* Color mode selector */}
        {flags?.random && (
          <div className="space-y-3">
            <span id="color-mode-label" className="text-sm font-medium text-foreground block">Color</span>
            <div className="inline-flex bg-muted border border-border rounded-lg p-0.5" role="group" aria-labelledby="color-mode-label">
              <button
                onClick={() => setRandomColor(false)}
                aria-pressed={!randomColor}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  !randomColor
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                Custom
              </button>
              <button
                onClick={() => setRandomColor(true)}
                aria-pressed={randomColor}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  randomColor
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                Random
              </button>
            </div>
          </div>
        )}

        {/* Color picker */}
        {flags?.colorPicker && (
          <div className={`space-y-3 transition-opacity ${randomColor ? 'opacity-40 pointer-events-none' : ''}`} aria-disabled={randomColor}>
            <span id="color-picker-label" className="text-sm font-medium text-foreground">Color</span>
            <div className="flex flex-col items-start gap-3">
              <ColorWheel color={color} onChange={setColor} size={200} />
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="color-picker-label">
                {[
                  { name: 'White', r: 255, g: 255, b: 255 },
                  { name: 'Red', r: 255, g: 0, b: 0 },
                  { name: 'Orange', r: 255, g: 165, b: 0 },
                  { name: 'Yellow', r: 255, g: 255, b: 0 },
                  { name: 'Green', r: 0, g: 255, b: 0 },
                  { name: 'Cyan', r: 0, g: 255, b: 255 },
                  { name: 'Blue', r: 0, g: 0, b: 255 },
                  { name: 'Magenta', r: 255, g: 0, b: 255 },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => setColor({ r: preset.r, g: preset.g, b: preset.b })}
                    className="w-8 h-8 rounded border-2 border-border hover:border-primary transition-colors"
                    style={{ backgroundColor: `rgb(${preset.r}, ${preset.g}, ${preset.b})` }}
                    title={preset.name}
                    aria-label={`Set color to ${preset.name}`}
                  />
                ))}
              </div>
              <span className="text-sm font-mono text-muted-foreground" aria-live="polite">{colorHex.toUpperCase()}</span>
            </div>
          </div>
        )}

        {/* Empty state message if no controls */}
        {!flags?.speed && !flags?.brightness && !flags?.colorPicker && !flags?.random && isOffMode && (
          <div className="text-sm text-muted-foreground italic">
            No additional controls available for this mode.
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
