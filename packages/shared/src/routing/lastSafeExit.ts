import { haversineDistanceM, type FootpathGraph } from './footpathGraph.ts';
import type { LastSafeExitResult, CrosswalkLinkInput } from './types.ts';

/**
 * Given a user's current geographical coordinate and an upcoming blocked segment
 * on the same footpath side, finds the nearest accessible crosswalk / kerb ramp
 * strictly BEFORE the obstacle to safely cross to the opposite side.
 */
export function findLastSafeExit(
  graph: FootpathGraph,
  userCoord: [number, number],
  blockedSegmentId: string,
  userHeadingDegrees?: number,
): LastSafeExitResult {
  const blockedSegment = graph.getSegment(blockedSegmentId);
  if (!blockedSegment) {
    return {
      found: false,
      reason: `Blocked segment '${blockedSegmentId}' was not found in the footpath graph.`,
    };
  }

  // Find user's current position in the graph
  const nearestSegmentMatch = graph.findNearestSegment(userCoord);
  const userSegment = nearestSegmentMatch?.segment;

  const targetRoadId = blockedSegment.roadId;
  const targetSide = blockedSegment.side;

  // Gather all segments on the same road and same side
  const roadSegments = Array.from(graph.segments.values())
    .filter((s) => s.roadId === targetRoadId && s.side === targetSide)
    .sort((a, b) => a.segmentIndex - b.segmentIndex);

  if (roadSegments.length === 0) {
    return {
      found: false,
      reason: `No segments found on road ${targetRoadId} side ${targetSide}.`,
    };
  }

  // Determine direction of travel towards the blocked segment
  const blockedIndex = blockedSegment.segmentIndex;
  let userIndex =
    userSegment && userSegment.roadId === targetRoadId && userSegment.side === targetSide
      ? userSegment.segmentIndex
      : -1;

  if (userIndex === -1) {
    // Determine closest segment index on this road side to the user
    let closestIndex = roadSegments[0]!.segmentIndex;
    let minDist = Infinity;
    for (const seg of roadSegments) {
      for (const pt of seg.coordinates) {
        const d = haversineDistanceM(userCoord, pt);
        if (d < minDist) {
          minDist = d;
          closestIndex = seg.segmentIndex;
        }
      }
    }
    userIndex = closestIndex;
  }

  // Check travel direction:
  // If userIndex <= blockedIndex, user is moving in ascending index order (0 -> blockedIndex)
  // If userIndex > blockedIndex, user is moving in descending index order (N -> blockedIndex)
  const isAscending = userIndex <= blockedIndex;

  // Segments strictly between user and the obstacle (inclusive of user segment, exclusive of blocked segment)
  const candidateSegments = roadSegments.filter((seg) => {
    if (isAscending) {
      return seg.segmentIndex >= userIndex && seg.segmentIndex < blockedIndex;
    }
    return seg.segmentIndex <= userIndex && seg.segmentIndex > blockedIndex;
  });

  // If user is already AT the blocked segment or past it
  if (candidateSegments.length === 0 && userIndex === blockedIndex) {
    // Fallback: look for any crosswalk on directly adjacent previous segment
    const adjacentSeg = roadSegments.find(
      (s) => s.segmentIndex === (isAscending ? blockedIndex - 1 : blockedIndex + 1),
    );
    if (adjacentSeg) {
      candidateSegments.push(adjacentSeg);
    }
  }

  // Map of candidate crosswalks
  interface CandidateExit {
    crosswalk: CrosswalkLinkInput;
    fromSegmentId: string;
    toSegmentId: string;
    exitCoord: [number, number];
    distFromUserM: number;
    distToObstacleM: number;
    hasRamp: boolean;
  }

  const candidateExits: CandidateExit[] = [];
  const blockedMidCoord = blockedSegment.coordinates[
    Math.floor(blockedSegment.coordinates.length / 2)
  ] ||
    blockedSegment.coordinates[0] || [0, 0];

  for (const seg of candidateSegments) {
    // Find all crosswalks connected to this segment
    for (const cw of graph.crosswalks.values()) {
      let otherSegmentId: string | null = null;
      let fromSegId: string | null = null;

      if (cw.fromSegmentId === seg.id) {
        fromSegId = seg.id;
        otherSegmentId = cw.toSegmentId;
      } else if (cw.toSegmentId === seg.id) {
        fromSegId = seg.id;
        otherSegmentId = cw.fromSegmentId;
      }

      if (!otherSegmentId || !fromSegId) continue;

      const otherSegment = graph.getSegment(otherSegmentId);
      // Crossing should lead to opposite side or cross-street to safely evade blockage
      if (
        otherSegment &&
        (otherSegment.side !== targetSide || otherSegment.roadId !== targetRoadId)
      ) {
        const exitCoord =
          cw.coordinates && cw.coordinates.length > 0
            ? cw.coordinates[0]!
            : seg.coordinates[seg.coordinates.length - 1]!;

        const distFromUserM = Math.round(haversineDistanceM(userCoord, exitCoord));
        const distToObstacleM = Math.round(haversineDistanceM(exitCoord, blockedMidCoord));

        candidateExits.push({
          crosswalk: cw,
          fromSegmentId: fromSegId,
          toSegmentId: otherSegmentId,
          exitCoord,
          distFromUserM,
          distToObstacleM,
          hasRamp: Boolean(cw.rampFlag),
        });
      }
    }
  }

  if (candidateExits.length === 0) {
    // If no crosswalk directly on candidate segments, check intersection connections
    return {
      found: false,
      reason: `No crosswalk exits exist on ${targetSide} footpath between current location and blocked segment #${blockedSegmentId}.`,
    };
  }

  // The "Last Safe Exit" is the crosswalk closest to the obstacle before reaching it,
  // with strong preference for accessible kerb ramps (hasRamp = true).
  candidateExits.sort((a, b) => {
    // First prioritize accessible ramp
    if (a.hasRamp && !b.hasRamp) return -1;
    if (!a.hasRamp && b.hasRamp) return 1;

    // Next, pick the exit closest to the obstacle (the final exit opportunity)
    return a.distToObstacleM - b.distToObstacleM;
  });

  const bestExit = candidateExits[0]!;
  const oppositeSide = targetSide === 'left' ? 'right' : 'left';

  const rampNote = bestExit.hasRamp
    ? 'Accessible kerb ramp available.'
    : 'Warning: Kerb ramp not confirmed at this crossing.';

  const warningMessage = `Last safe exit in ${bestExit.distFromUserM} m: cross to ${oppositeSide} footpath before blocked segment #${blockedSegmentId}. ${rampNote}`;

  return {
    found: true,
    exitCrosswalk: bestExit.crosswalk,
    fromSegmentId: bestExit.fromSegmentId,
    toSegmentId: bestExit.toSegmentId,
    exitCoordinate: bestExit.exitCoord,
    distanceFromUserM: bestExit.distFromUserM,
    distanceToObstacleM: bestExit.distToObstacleM,
    hasAccessibleRamp: bestExit.hasRamp,
    warningMessage,
  };
}
