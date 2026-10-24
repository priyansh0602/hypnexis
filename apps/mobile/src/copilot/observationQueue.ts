import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase.ts';
import type { FootpathSegmentInput } from '@accesspath/shared';
import type { PendingObservation } from './types.ts';

const STORAGE_KEY = '@accesspath_pending_observations';

/**
 * Calculates Haversine distance in metres between two coordinates [lng, lat].
 */
function haversineM(c1: [number, number], c2: [number, number]): number {
  const [lon1, lat1] = c1;
  const [lon2, lat2] = c2;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Matches user's current GPS coordinate and compass heading to the closest
 * Left or Right footpath segment in the local corridor.
 */
export function matchUserToFootpathSegment(
  userCoord: [number, number],
  headingDegrees: number,
  segments: FootpathSegmentInput[],
  maxDistanceThresholdM = 35.0,
): FootpathSegmentInput | null {
  let closestSegment: FootpathSegmentInput | null = null;
  let minDistance = Infinity;

  for (const seg of segments) {
    if (!seg.coordinates || seg.coordinates.length === 0) continue;

    for (const pt of seg.coordinates) {
      const d = haversineM(userCoord, pt);
      if (d < minDistance) {
        minDistance = d;
        closestSegment = seg;
      }
    }
  }

  if (minDistance > maxDistanceThresholdM) {
    return null; // User is too far from known footpath segments
  }

  return closestSegment;
}

/**
 * Retrieves all pending offline observations from persistent storage.
 */
export async function getPendingObservations(): Promise<PendingObservation[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persists the updated queue of observations to local storage.
 */
async function savePendingObservations(queue: PendingObservation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Enqueues an on-device observation into the offline-first queue.
 */
export async function enqueueObservation(
  item: Omit<PendingObservation, 'id' | 'createdAt' | 'syncAttempts'>,
): Promise<PendingObservation> {
  const queue = await getPendingObservations();

  const newObs: PendingObservation = {
    ...item,
    id: `obs-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
    syncAttempts: 0,
  };

  queue.push(newObs);
  await savePendingObservations(queue);
  return newObs;
}

export interface FlushResult {
  syncedCount: number;
  failedCount: number;
  remainingQueueSize: number;
}

/**
 * Flushes pending observations to Supabase `observations` table when network is available.
 * Complies with the schema:
 * - If `is_clear = true`, `obstacle_type = null`.
 * - If `is_clear = false`, `obstacle_type` is the primary detected obstacle code.
 */
export async function flushObservationQueue(): Promise<FlushResult> {
  const queue = await getPendingObservations();
  if (queue.length === 0) {
    return { syncedCount: 0, failedCount: 0, remainingQueueSize: 0 };
  }

  const remaining: PendingObservation[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  for (const obs of queue) {
    try {
      const isClear = obs.status === 'green' && obs.obstacleTypes.length === 0;
      const primaryObstacle = isClear ? null : (obs.obstacleTypes[0] ?? 'other');

      const payload = {
        segment_id: obs.segmentId,
        obstacle_type: primaryObstacle,
        confidence: 0.9,
        source: 'copilot_in_situ',
        photo_url: obs.thumbnailBase64 ?? null,
        captured_at: obs.createdAt,
        heading_degrees: obs.headingDegrees,
        camera_side: obs.side ?? null,
        projection_confidence: 0.85,
        geom: `SRID=4326;POINT(${obs.userCoordinates[0]} ${obs.userCoordinates[1]})`,
        is_clear: isClear,
        metadata: {
          all_detected_obstacles: obs.obstacleTypes,
          severity: obs.severity,
          sync_attempts: obs.syncAttempts + 1,
        },
      };

      const { error } = await supabase.from('observations').insert([payload]);

      if (error) {
        throw new Error(error.message);
      }

      syncedCount++;
    } catch (err: unknown) {
      failedCount++;
      const errorMessage = err instanceof Error ? err.message : String(err);
      remaining.push({
        ...obs,
        syncAttempts: obs.syncAttempts + 1,
        lastSyncError: errorMessage,
      });
    }
  }

  await savePendingObservations(remaining);

  return {
    syncedCount,
    failedCount,
    remainingQueueSize: remaining.length,
  };
}

/**
 * Emits and queues an "all-clear" observation if a previously blocked segment
 * is seen unobstructed by the copilot camera.
 */
export async function recordAllClearObservation(
  segment: FootpathSegmentInput,
  userCoord: [number, number],
  headingDegrees: number,
): Promise<PendingObservation> {
  return enqueueObservation({
    segmentId: segment.id,
    roadId: segment.roadId,
    side: segment.side,
    status: 'green',
    obstacleTypes: [],
    severity: 0,
    userCoordinates: userCoord,
    headingDegrees,
  });
}
