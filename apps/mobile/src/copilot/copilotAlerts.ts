import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import type { FootpathSide } from '@accesspath/shared';
import type { CopilotAlert } from './types.ts';

let lastAlertTime = 0;
let lastAlertMessage = '';
const ALERT_COOLDOWN_MS = 6000; // 6 second debounce to prevent audio spam

export interface AlertOptions {
  force?: boolean;
  rate?: number; // TTS speech rate, default 1.05
}

/**
 * Dispatches Text-To-Speech (TTS) audio guidance and tactical Haptic vibration.
 */
export async function announceAlert(
  alert: CopilotAlert,
  options: AlertOptions = {},
): Promise<boolean> {
  const now = Date.now();
  if (
    !options.force &&
    alert.message === lastAlertMessage &&
    now - lastAlertTime < ALERT_COOLDOWN_MS
  ) {
    return false; // Silenced by cooldown
  }

  lastAlertTime = now;
  lastAlertMessage = alert.message;

  // Tactical Haptics based on alert severity
  try {
    if (alert.type === 'blockage_ahead' || alert.type === 'last_safe_exit') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (alert.type === 'narrow_path') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else if (alert.type === 'all_clear') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  } catch {
    // Haptics gracefully no-op if unsupported on simulator / platform
  }

  // Voice synthesis
  try {
    const isSpeaking = await Speech.isSpeakingAsync();
    if (isSpeaking) {
      await Speech.stop();
    }

    Speech.speak(alert.message, {
      language: 'en-IN',
      pitch: 1.0,
      rate: options.rate ?? 1.05,
    });
    return true;
  } catch {
    // TTS gracefully no-op if unavailable
    return false;
  }
}

/**
 * Triggers high-priority "Last Safe Exit" alert when a Red barrier is detected 30-50m ahead.
 */
export async function triggerLastSafeExitAlert(
  distanceToObstacleM: number,
  distanceToRampM: number,
  rampSide: FootpathSide,
  hasRamp: boolean,
): Promise<CopilotAlert> {
  const roundedObstacleDist = Math.max(5, Math.round(distanceToObstacleM));
  const roundedRampDist = Math.max(1, Math.round(distanceToRampM));

  const rampDescription = hasRamp
    ? `Ramp available ${roundedRampDist} meters ahead on your ${rampSide} to cross over.`
    : `Crossing available ${roundedRampDist} meters ahead on your ${rampSide}, but has no kerb ramp.`;

  const message = `Footpath blocked ${roundedObstacleDist} meters ahead. ${rampDescription}`;

  const alert: CopilotAlert = {
    id: `alert-lse-${Date.now()}`,
    type: 'last_safe_exit',
    message,
    distanceM: roundedObstacleDist,
    rampDistanceM: roundedRampDist,
    rampSide,
    timestamp: Date.now(),
    spoken: false,
  };

  const spoken = await announceAlert(alert);
  alert.spoken = spoken;
  return alert;
}

/**
 * Triggers alert when path width is narrow (0.9m - 1.05m).
 */
export async function triggerNarrowPathAlert(
  clearWidthM: number,
  distanceM: number,
): Promise<CopilotAlert> {
  const roundedDist = Math.max(2, Math.round(distanceM));
  const message = `Caution: narrow footpath ${clearWidthM.toFixed(1)} meters wide, ${roundedDist} meters ahead.`;

  const alert: CopilotAlert = {
    id: `alert-narrow-${Date.now()}`,
    type: 'narrow_path',
    message,
    distanceM: roundedDist,
    timestamp: Date.now(),
    spoken: false,
  };

  const spoken = await announceAlert(alert);
  alert.spoken = spoken;
  return alert;
}

/**
 * Triggers "all-clear" announcement if a previously blocked segment is seen unobstructed.
 */
export async function triggerAllClearAlert(segmentId?: string): Promise<CopilotAlert> {
  const message = 'Path clear ahead. Footpath unobstructed for wheelchair passage.';

  const alert: CopilotAlert = {
    id: `alert-clear-${Date.now()}`,
    type: 'all_clear',
    message,
    distanceM: 0,
    timestamp: Date.now(),
    spoken: false,
  };

  const spoken = await announceAlert(alert);
  alert.spoken = spoken;
  return alert;
}

/**
 * Immediately stops any ongoing speech synthesis.
 */
export async function stopSpeaking(): Promise<void> {
  try {
    await Speech.stop();
  } catch {
    // Ignore error
  }
}
