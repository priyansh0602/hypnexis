import type { FootpathSegmentFeature, FootpathSegmentRow } from '../types';

/**
 * Robustly parses PostGIS geometry output into GeoJSON LineString coordinates [[lng, lat], ...]
 * Handles:
 * - Standard GeoJSON object: { type: 'LineString', coordinates: [...] }
 * - Stringified GeoJSON: "{\"type\":\"LineString\",\"coordinates\":[...]}"
 * - WKT string: "LINESTRING(77.633 12.971, 77.634 12.972)"
 * - EWKT string: "SRID=4326;LINESTRING(77.633 12.971, 77.634 12.972)"
 * - Coordinate array: [[77.633, 12.971], ...]
 */
export function parseLineStringCoordinates(geometry: unknown): [number, number][] {
  if (!geometry) return [];

  // Case 1: Coordinate array directly
  if (Array.isArray(geometry) && geometry.length >= 2 && typeof geometry[0]?.[0] === 'number') {
    return geometry as [number, number][];
  }

  // Case 2: Object with coordinates (GeoJSON geometry)
  if (typeof geometry === 'object' && geometry !== null && 'coordinates' in geometry) {
    const coords = (geometry as { coordinates: unknown }).coordinates;
    if (Array.isArray(coords)) {
      return coords as [number, number][];
    }
  }

  // Case 3: String
  if (typeof geometry === 'string') {
    const trimmed = geometry.trim();

    // 3a. JSON string
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed) as { coordinates?: unknown };
        if (parsed.coordinates && Array.isArray(parsed.coordinates)) {
          return parsed.coordinates as [number, number][];
        }
      } catch {
        // Fall through to WKT parsing
      }
    }

    // 3b. WKT / EWKT string e.g. "SRID=4326;LINESTRING(77.63 12.97, ...)"
    const match = trimmed.match(/LINESTRING\s*\(([^)]+)\)/i);
    if (match && match[1]) {
      const coordPairs = match[1].split(',');
      const result: [number, number][] = [];
      for (const pair of coordPairs) {
        const parts = pair.trim().split(/\s+/);
        if (parts.length >= 2) {
          const lng = parseFloat(parts[0] || '0');
          const lat = parseFloat(parts[1] || '0');
          if (!Number.isNaN(lng) && !Number.isNaN(lat)) {
            result.push([lng, lat]);
          }
        }
      }
      if (result.length >= 2) return result;
    }
  }

  return [];
}

/**
 * Converts a database row to a GeoJSON Feature
 */
export function segmentRowToFeature(row: FootpathSegmentRow): FootpathSegmentFeature | null {
  const coordinates = parseLineStringCoordinates(row.geometry);
  if (coordinates.length < 2) return null;

  const side: 'left' | 'right' = row.side === 'L' || row.side === 'left' ? 'left' : 'right';

  return {
    type: 'Feature',
    id: row.id,
    geometry: {
      type: 'LineString',
      coordinates,
    },
    properties: {
      id: row.id,
      roadId: row.road_id,
      side,
      segmentIndex: row.segment_index,
      lengthM: Math.round(row.length_m * 10) / 10,
      status: row.status,
      difficultyScore: row.difficulty_score,
      lastVerifiedAt: row.last_verified_at,
    },
  };
}

/**
 * Computes midpoint of a LineString for camera focusing
 */
export function getLineMidpoint(coordinates: [number, number][]): [number, number] {
  if (coordinates.length === 0) return [77.638, 12.975];
  if (coordinates.length === 1) return coordinates[0]!;

  const midIndex = Math.floor(coordinates.length / 2);
  return coordinates[midIndex] || [77.638, 12.975];
}

/**
 * Formats distance in metres or kilometres
 */
export function formatDistance(metres: number): string {
  if (metres < 1000) {
    return `${Math.round(metres)} m`;
  }
  return `${(metres / 1000).toFixed(2)} km`;
}

/**
 * Formats timestamp nicely
 */
export function formatTimestamp(isoString: string | null): string {
  if (!isoString) return 'Unverified';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return 'Unverified';
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Unverified';
  }
}
