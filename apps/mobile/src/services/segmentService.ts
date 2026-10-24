import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type {
  FootpathSegmentFeature,
  FootpathSegmentCollection,
  FootpathSegmentRow,
  SegmentStateRow,
  ObservationRow,
} from '../types';
import { segmentRowToFeature } from '../utils/geometry';

/**
 * Pilot area coordinates for Indiranagar, Bengaluru.
 * Center: 12.975 N, 77.638 E
 */
export const PILOT_CENTER: [number, number] = [77.638, 12.975]; // [lng, lat] for MapLibre
export const PILOT_BBOX = {
  south: 12.9714,
  west: 77.633,
  north: 12.98,
  east: 77.6425,
};

/**
 * High-fidelity fallback sample segments for Indiranagar 100 Feet Road & 12th Main
 * to ensure rich visual testing and offline resilience.
 */
const SAMPLE_PILOT_SEGMENTS: FootpathSegmentFeature[] = [
  // 100 Feet Road — West Footpath (Segment 1, Clear)
  {
    type: 'Feature',
    id: 'pilot-100ft-w1',
    geometry: {
      type: 'LineString',
      coordinates: [
        [77.6375, 12.974],
        [77.6376, 12.975],
        [77.6377, 12.976],
      ],
    },
    properties: {
      id: 'pilot-100ft-w1',
      roadId: 'road-100ft',
      side: 'left',
      segmentIndex: 1,
      lengthM: 220,
      status: 'green',
      difficultyScore: 10,
      lastVerifiedAt: '2026-10-24T18:00:00Z',
      activeObstacles: [],
    },
  },
  // 100 Feet Road — West Footpath (Segment 2, Rough: Broken tiles & tree roots)
  {
    type: 'Feature',
    id: 'pilot-100ft-w2',
    geometry: {
      type: 'LineString',
      coordinates: [
        [77.6377, 12.976],
        [77.6378, 12.977],
      ],
    },
    properties: {
      id: 'pilot-100ft-w2',
      roadId: 'road-100ft',
      side: 'left',
      segmentIndex: 2,
      lengthM: 110,
      status: 'yellow',
      difficultyScore: 55,
      lastVerifiedAt: '2026-10-23T14:30:00Z',
      activeObstacles: ['broken_footpath'],
    },
  },
  // 100 Feet Road — West Footpath (Segment 3, Blocked: Steps & Construction Rubble)
  {
    type: 'Feature',
    id: 'pilot-100ft-w3',
    geometry: {
      type: 'LineString',
      coordinates: [
        [77.6378, 12.977],
        [77.6379, 12.9785],
      ],
    },
    properties: {
      id: 'pilot-100ft-w3',
      roadId: 'road-100ft',
      side: 'left',
      segmentIndex: 3,
      lengthM: 165,
      status: 'red',
      difficultyScore: 95,
      lastVerifiedAt: '2026-10-24T11:00:00Z',
      activeObstacles: ['steps', 'rubble'],
    },
  },
  // 100 Feet Road — East Footpath (Segment 1, Clear with Tactile Paving)
  {
    type: 'Feature',
    id: 'pilot-100ft-e1',
    geometry: {
      type: 'LineString',
      coordinates: [
        [77.6379, 12.974],
        [77.638, 12.975],
        [77.6381, 12.976],
      ],
    },
    properties: {
      id: 'pilot-100ft-e1',
      roadId: 'road-100ft',
      side: 'right',
      segmentIndex: 1,
      lengthM: 220,
      status: 'green',
      difficultyScore: 15,
      lastVerifiedAt: '2026-10-24T16:20:00Z',
      activeObstacles: [],
    },
  },
  // 100 Feet Road — East Footpath (Segment 2, Blocked: Parked Two-Wheelers & Vendor Cart)
  {
    type: 'Feature',
    id: 'pilot-100ft-e2',
    geometry: {
      type: 'LineString',
      coordinates: [
        [77.6381, 12.976],
        [77.6382, 12.977],
      ],
    },
    properties: {
      id: 'pilot-100ft-e2',
      roadId: 'road-100ft',
      side: 'right',
      segmentIndex: 2,
      lengthM: 110,
      status: 'red',
      difficultyScore: 85,
      lastVerifiedAt: '2026-10-24T19:45:00Z',
      activeObstacles: ['parked_vehicle', 'vendor_cart'],
    },
  },
  // 100 Feet Road — East Footpath (Segment 3, Unverified / Grey)
  {
    type: 'Feature',
    id: 'pilot-100ft-e3',
    geometry: {
      type: 'LineString',
      coordinates: [
        [77.6382, 12.977],
        [77.6383, 12.9785],
      ],
    },
    properties: {
      id: 'pilot-100ft-e3',
      roadId: 'road-100ft',
      side: 'right',
      segmentIndex: 3,
      lengthM: 165,
      status: 'grey',
      difficultyScore: 25,
      lastVerifiedAt: null,
      activeObstacles: [],
    },
  },
  // 12th Main Road (Intersection cross branch — Green & Yellow)
  {
    type: 'Feature',
    id: 'pilot-12thmain-s1',
    geometry: {
      type: 'LineString',
      coordinates: [
        [77.6345, 12.975],
        [77.636, 12.975],
        [77.6376, 12.975],
      ],
    },
    properties: {
      id: 'pilot-12thmain-s1',
      roadId: 'road-12thmain',
      side: 'left',
      segmentIndex: 1,
      lengthM: 340,
      status: 'green',
      difficultyScore: 20,
      lastVerifiedAt: '2026-10-24T10:15:00Z',
      activeObstacles: [],
    },
  },
  {
    type: 'Feature',
    id: 'pilot-12thmain-s2',
    geometry: {
      type: 'LineString',
      coordinates: [
        [77.6376, 12.975],
        [77.6395, 12.975],
        [77.641, 12.975],
      ],
    },
    properties: {
      id: 'pilot-12thmain-s2',
      roadId: 'road-12thmain',
      side: 'right',
      segmentIndex: 2,
      lengthM: 375,
      status: 'yellow',
      difficultyScore: 60,
      lastVerifiedAt: '2026-10-22T09:00:00Z',
      activeObstacles: ['missing_kerb_ramp', 'pole_fixed_obstacle'],
    },
  },
  // Indiranagar Metro access lane (Grey — no evidence)
  {
    type: 'Feature',
    id: 'pilot-metro-access',
    geometry: {
      type: 'LineString',
      coordinates: [
        [77.638, 12.9755],
        [77.639, 12.9765],
        [77.6395, 12.9772],
      ],
    },
    properties: {
      id: 'pilot-metro-access',
      roadId: 'road-metro',
      side: 'left',
      segmentIndex: 1,
      lengthM: 250,
      status: 'grey',
      difficultyScore: 25,
      lastVerifiedAt: null,
      activeObstacles: [],
    },
  },
];

/**
 * Fetches footpath segments from Supabase backend.
 * Merges with segment_state for live status and obstacles.
 */
export async function fetchFootpathSegments(): Promise<FootpathSegmentCollection> {
  if (!isSupabaseConfigured) {
    return {
      type: 'FeatureCollection',
      features: SAMPLE_PILOT_SEGMENTS,
    };
  }

  try {
    const { data: segmentRows, error: segmentError } = await supabase
      .from('footpath_segments')
      .select(
        'id, road_id, side, segment_index, geometry, length_m, status, difficulty_score, last_verified_at',
      )
      .limit(500);

    if (segmentError || !segmentRows || segmentRows.length === 0) {
      console.warn(
        '[AccessPath] Supabase query returned no rows or error, falling back to pilot set:',
        segmentError?.message,
      );
      return {
        type: 'FeatureCollection',
        features: SAMPLE_PILOT_SEGMENTS,
      };
    }

    // Fetch segment_state map
    const { data: stateRows } = await supabase
      .from('segment_state')
      .select('segment_id, status, difficulty_score, last_verified_at, active_obstacles');

    const stateMap = new Map<string, SegmentStateRow>();
    if (stateRows) {
      for (const st of stateRows as SegmentStateRow[]) {
        stateMap.set(st.segment_id, st);
      }
    }

    const features: FootpathSegmentFeature[] = [];

    for (const row of segmentRows as FootpathSegmentRow[]) {
      const feat = segmentRowToFeature(row);
      if (!feat) continue;

      const state = stateMap.get(row.id);
      if (state) {
        feat.properties.status = state.status;
        feat.properties.difficultyScore = state.difficulty_score;
        feat.properties.lastVerifiedAt = state.last_verified_at;
        feat.properties.activeObstacles = Array.isArray(state.active_obstacles)
          ? ((state.active_obstacles as unknown as string[]).map((o) =>
              typeof o === 'string' ? o : (o as { code?: string })?.code || 'unknown',
            ) as any)
          : [];
      }

      features.push(feat);
    }

    if (features.length === 0) {
      return {
        type: 'FeatureCollection',
        features: SAMPLE_PILOT_SEGMENTS,
      };
    }

    return {
      type: 'FeatureCollection',
      features,
    };
  } catch (err) {
    console.warn('[AccessPath] Error loading segments from Supabase, using pilot sample:', err);
    return {
      type: 'FeatureCollection',
      features: SAMPLE_PILOT_SEGMENTS,
    };
  }
}

/**
 * Fetches observations (proof photos, obstacle labels, attribution) for a segment
 */
export async function fetchSegmentObservations(segmentId: string): Promise<ObservationRow[]> {
  if (!isSupabaseConfigured) {
    // Generate realistic sample observations for demonstration
    if (segmentId === 'pilot-100ft-w2') {
      return [
        {
          id: 'obs-sample-1',
          segment_id: segmentId,
          obstacle_type: 'broken_footpath',
          confidence: 0.92,
          source: 'harvester',
          reporter_id: null,
          photo_url:
            'https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=600&auto=format&fit=crop&q=80',
          attribution: {
            provider: 'Mapillary',
            creator: 'bengaluru_walker_99',
            license: 'CC-BY-SA 4.0',
            captured_at: '2026-10-23T14:30:00Z',
          },
          captured_at: '2026-10-23T14:30:00Z',
          heading_degrees: 182,
          camera_side: 'L',
          projection_confidence: 0.88,
          is_clear: false,
          metadata: { width_estimate_m: 0.85 },
          created_at: '2026-10-23T14:35:00Z',
        },
      ];
    }
    if (segmentId === 'pilot-100ft-w3') {
      return [
        {
          id: 'obs-sample-2',
          segment_id: segmentId,
          obstacle_type: 'steps',
          confidence: 0.98,
          source: 'user',
          reporter_id: 'user-wheelchair-advocate',
          photo_url:
            'https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?w=600&auto=format&fit=crop&q=80',
          attribution: {
            provider: 'User Report',
            creator: 'AccessWheelchair Pilot Volunteer',
            license: 'Open AccessPath Evidence',
            captured_at: '2026-10-24T11:00:00Z',
          },
          captured_at: '2026-10-24T11:00:00Z',
          heading_degrees: 350,
          camera_side: 'L',
          projection_confidence: 0.95,
          is_clear: false,
          metadata: { step_count: 4, height_cm: 65 },
          created_at: '2026-10-24T11:05:00Z',
        },
        {
          id: 'obs-sample-3',
          segment_id: segmentId,
          obstacle_type: 'rubble',
          confidence: 0.85,
          source: 'camera',
          reporter_id: null,
          photo_url: null,
          attribution: {
            provider: 'KartaView',
            creator: 'osm_pilot_bot',
            license: 'ODbL 1.0',
            captured_at: '2026-10-24T09:15:00Z',
          },
          captured_at: '2026-10-24T09:15:00Z',
          heading_degrees: 352,
          camera_side: 'L',
          projection_confidence: 0.81,
          is_clear: false,
          metadata: {},
          created_at: '2026-10-24T09:20:00Z',
        },
      ];
    }
    if (segmentId === 'pilot-100ft-e2') {
      return [
        {
          id: 'obs-sample-4',
          segment_id: segmentId,
          obstacle_type: 'parked_vehicle',
          confidence: 0.89,
          source: 'harvester',
          reporter_id: null,
          photo_url:
            'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=600&auto=format&fit=crop&q=80',
          attribution: {
            provider: 'Mapillary',
            creator: 'indiranagar_mapper',
            license: 'CC-BY-SA 4.0',
            captured_at: '2026-10-24T19:45:00Z',
          },
          captured_at: '2026-10-24T19:45:00Z',
          heading_degrees: 5,
          camera_side: 'R',
          projection_confidence: 0.91,
          is_clear: false,
          metadata: { vehicle_type: 'two_wheeler' },
          created_at: '2026-10-24T19:50:00Z',
        },
      ];
    }
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('observations')
      .select('*')
      .eq('segment_id', segmentId)
      .order('captured_at', { ascending: false })
      .limit(10);

    if (error || !data) {
      console.warn('[AccessPath] Error loading observations for segment:', error?.message);
      return [];
    }

    return data as ObservationRow[];
  } catch (err) {
    console.warn('[AccessPath] Failed to fetch segment observations:', err);
    return [];
  }
}

/**
 * Subscribes to realtime updates on segment_state
 */
export function subscribeToSegmentStateUpdates(
  onUpdate: (state: SegmentStateRow) => void,
): () => void {
  if (!isSupabaseConfigured) {
    return () => {};
  }

  const channel = supabase
    .channel('realtime:segment_state')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'segment_state',
      },
      (payload) => {
        if (payload.new && typeof payload.new === 'object') {
          onUpdate(payload.new as SegmentStateRow);
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
