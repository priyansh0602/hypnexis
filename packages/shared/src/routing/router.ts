import { haversineDistanceM, type FootpathGraph } from './footpathGraph.ts';
import type {
  RoutingNode,
  RoutingEdge,
  RouteResult,
  DualRouteResult,
  RouteWarning,
  RouterOptions,
  FootpathSegmentInput,
  CrosswalkLinkInput,
} from './types.ts';

interface PriorityQueueItem {
  nodeId: string;
  cost: number;
  priority: number; // cost + heuristic
}

/**
 * High-performance binary min-heap for A* pathfinding.
 */
class MinHeap {
  private readonly heap: PriorityQueueItem[] = [];

  public get size(): number {
    return this.heap.length;
  }

  public push(item: PriorityQueueItem): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  public pop(): PriorityQueueItem | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0 && bottom !== undefined) {
      this.heap[0] = bottom;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    const element = this.heap[index];
    if (!element) return;

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.heap[parentIndex];
      if (!parent || element.priority >= parent.priority) break;
      this.heap[index] = parent;
      this.heap[parentIndex] = element;
      index = parentIndex;
    }
  }

  private sinkDown(index: number): void {
    const length = this.heap.length;
    const element = this.heap[index];
    if (!element) return;

    while (true) {
      const leftChildIndex = 2 * index + 1;
      const rightChildIndex = 2 * index + 2;
      let swapIndex: number | null = null;

      if (leftChildIndex < length) {
        const leftChild = this.heap[leftChildIndex];
        if (leftChild && leftChild.priority < element.priority) {
          swapIndex = leftChildIndex;
        }
      }

      if (rightChildIndex < length) {
        const rightChild = this.heap[rightChildIndex];
        const comparePriority =
          swapIndex === null ? element.priority : (this.heap[swapIndex]?.priority ?? Infinity);

        if (rightChild && rightChild.priority < comparePriority) {
          swapIndex = rightChildIndex;
        }
      }

      if (swapIndex === null) break;

      const swapElement = this.heap[swapIndex];
      if (swapElement) {
        this.heap[index] = swapElement;
        this.heap[swapIndex] = element;
      }
      index = swapIndex;
    }
  }
}

export interface InternalRouterOptions {
  profile: {
    widthMetres: number;
    clearanceMarginMetres: number;
  };
  walkingSpeedMetresPerSecond: number;
  greenMultiplier: number;
  yellowMultiplier: number;
  greyMultiplier: number;
  redMultiplier: number;
  missingRampFixedPenaltyM: number;
  missingRampMultiplier: number;
}

const DEFAULT_OPTIONS: InternalRouterOptions = {
  profile: {
    widthMetres: 0.9,
    clearanceMarginMetres: 0.15,
  },
  walkingSpeedMetresPerSecond: 1.0, // ~3.6 km/h
  greenMultiplier: 1.0,
  yellowMultiplier: 2.0,
  greyMultiplier: 1.8,
  redMultiplier: 50.0,
  missingRampFixedPenaltyM: 200.0,
  missingRampMultiplier: 15.0,
};

export function resolveOptions(userOptions?: RouterOptions): InternalRouterOptions {
  return {
    profile: userOptions?.profile ?? DEFAULT_OPTIONS.profile,
    walkingSpeedMetresPerSecond:
      userOptions?.walkingSpeedMetresPerSecond ?? DEFAULT_OPTIONS.walkingSpeedMetresPerSecond,
    greenMultiplier: userOptions?.greenMultiplier ?? DEFAULT_OPTIONS.greenMultiplier,
    yellowMultiplier: userOptions?.yellowMultiplier ?? DEFAULT_OPTIONS.yellowMultiplier,
    greyMultiplier: userOptions?.greyMultiplier ?? DEFAULT_OPTIONS.greyMultiplier,
    redMultiplier: userOptions?.redMultiplier ?? DEFAULT_OPTIONS.redMultiplier,
    missingRampFixedPenaltyM:
      userOptions?.missingRampFixedPenaltyM ?? DEFAULT_OPTIONS.missingRampFixedPenaltyM,
    missingRampMultiplier:
      userOptions?.missingRampMultiplier ?? DEFAULT_OPTIONS.missingRampMultiplier,
  };
}

/**
 * Calculates edge traversal cost for A* based on wheelchair profile and routing mode.
 */
export function computeEdgeCost(
  edge: RoutingEdge,
  mode: 'accessible' | 'standard',
  options: InternalRouterOptions,
): number {
  const baseDistance = edge.distanceM;

  if (mode === 'standard') {
    // Standard shortest distance path across roads/pavements
    return baseDistance;
  }

  // Accessible Mode
  if (edge.kind === 'footpath') {
    switch (edge.status) {
      case 'green':
        return baseDistance * options.greenMultiplier;
      case 'yellow':
        return baseDistance * options.yellowMultiplier;
      case 'grey':
        return baseDistance * options.greyMultiplier;
      case 'red':
        // Very high penalty, but finite so trapped wheelchair users still get a path
        return baseDistance * options.redMultiplier + 500.0;
      default:
        return baseDistance * options.greyMultiplier;
    }
  }

  // Crosswalk Edge
  if (edge.kind === 'crosswalk') {
    if (edge.rampFlag) {
      // Ramp exists: normal crossing cost
      return baseDistance * options.greenMultiplier;
    }

    // Missing kerb ramp penalty scaled by wheelchair width profile
    const profileFactor = options.profile.widthMetres / 0.9;
    return (
      baseDistance * options.missingRampMultiplier +
      options.missingRampFixedPenaltyM * profileFactor
    );
  }

  return baseDistance;
}

/**
 * Executes A* algorithm to find optimal path from startNode to targetNode.
 */
export function findPathAStar(
  graph: FootpathGraph,
  startNode: RoutingNode,
  targetNode: RoutingNode,
  mode: 'accessible' | 'standard',
  userOptions?: RouterOptions,
): RouteResult | null {
  const options = resolveOptions(userOptions);

  if (startNode.id === targetNode.id) {
    return {
      mode,
      pathNodeIds: [startNode.id],
      pathEdgeIds: [],
      segments: [],
      crosswalks: [],
      coordinates: [startNode.coordinates],
      totalDistanceM: 0,
      totalCost: 0,
      estimatedTimeSeconds: 0,
      accessibilityScore: 100,
      hasRedObstacles: false,
      hasMissingRamps: false,
      hasGreySegments: false,
      warnings: [],
    };
  }

  const openSet = new MinHeap();
  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, { prevNodeId: string; edge: RoutingEdge }>();
  const visited = new Set<string>();

  gScore.set(startNode.id, 0);

  const initialHeuristic = haversineDistanceM(startNode.coordinates, targetNode.coordinates);
  openSet.push({
    nodeId: startNode.id,
    cost: 0,
    priority: initialHeuristic,
  });

  while (openSet.size > 0) {
    const current = openSet.pop();
    if (!current) break;

    const currentId = current.nodeId;

    if (currentId === targetNode.id) {
      // Goal reached! Reconstruct route
      return reconstructRoute(graph, cameFrom, targetNode.id, mode, options);
    }

    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const neighbors = graph.getNeighbors(currentId);
    const currentG = gScore.get(currentId) ?? Infinity;

    for (const edge of neighbors) {
      const neighborId = edge.to;
      if (visited.has(neighborId)) continue;

      const edgeCost = computeEdgeCost(edge, mode, options);
      const tentativeG = currentG + edgeCost;
      const existingG = gScore.get(neighborId) ?? Infinity;

      if (tentativeG < existingG) {
        gScore.set(neighborId, tentativeG);
        cameFrom.set(neighborId, { prevNodeId: currentId, edge });

        const neighborNode = graph.getNode(neighborId);
        const h = neighborNode
          ? haversineDistanceM(neighborNode.coordinates, targetNode.coordinates)
          : 0;

        openSet.push({
          nodeId: neighborId,
          cost: tentativeG,
          priority: tentativeG + h,
        });
      }
    }
  }

  return null; // No path found
}

function reconstructRoute(
  graph: FootpathGraph,
  cameFrom: Map<string, { prevNodeId: string; edge: RoutingEdge }>,
  targetNodeId: string,
  mode: 'accessible' | 'standard',
  options: InternalRouterOptions,
): RouteResult {
  const pathNodeIds: string[] = [targetNodeId];
  const pathEdges: RoutingEdge[] = [];

  let curr = targetNodeId;
  while (cameFrom.has(curr)) {
    const step = cameFrom.get(curr)!;
    pathEdges.unshift(step.edge);
    pathNodeIds.unshift(step.prevNodeId);
    curr = step.prevNodeId;
  }

  let totalDistanceM = 0;
  let totalCost = 0;
  let hasRedObstacles = false;
  let hasMissingRamps = false;
  let hasGreySegments = false;

  const segmentsTraversed: FootpathSegmentInput[] = [];
  const crosswalksTraversed: CrosswalkLinkInput[] = [];
  const coordinates: [number, number][] = [];
  const warnings: RouteWarning[] = [];

  for (const edge of pathEdges) {
    totalDistanceM += edge.distanceM;
    totalCost += computeEdgeCost(edge, mode, options);

    // Append coordinates
    for (const pt of edge.coordinates) {
      const last = coordinates[coordinates.length - 1];
      if (!last || last[0] !== pt[0] || last[1] !== pt[1]) {
        coordinates.push(pt);
      }
    }

    const midCoord: [number, number] = edge.coordinates[
      Math.floor(edge.coordinates.length / 2)
    ] || [0, 0];

    if (edge.kind === 'footpath') {
      if (edge.segmentId) {
        const seg = graph.getSegment(edge.segmentId);
        if (seg) segmentsTraversed.push(seg);
      }

      if (edge.status === 'red') {
        hasRedObstacles = true;
        warnings.push({
          type: 'blocked_segment',
          segmentId: edge.segmentId,
          location: midCoord,
          message: `Blocked segment on footpath ${edge.segmentId ?? ''}. Inaccessible for wheelchairs.`,
          severity: 'high',
        });
      } else if (edge.status === 'yellow') {
        warnings.push({
          type: 'rough_surface',
          segmentId: edge.segmentId,
          location: midCoord,
          message: `Rough surface or narrow width on segment ${edge.segmentId ?? ''}.`,
          severity: 'medium',
        });
      } else if (edge.status === 'grey') {
        hasGreySegments = true;
        warnings.push({
          type: 'unverified_area',
          segmentId: edge.segmentId,
          location: midCoord,
          message: `Unverified segment ${edge.segmentId ?? ''}. Lacks recent accessibility audit.`,
          severity: 'low',
        });
      }
    } else if (edge.kind === 'crosswalk') {
      const baseCwId = edge.id.replace(/:fwd$|:rev$/, '');
      const cw = graph.getCrosswalk(baseCwId);
      if (cw) crosswalksTraversed.push(cw);

      if (!edge.rampFlag) {
        hasMissingRamps = true;
        warnings.push({
          type: 'missing_kerb_ramp',
          crosswalkId: baseCwId,
          location: midCoord,
          message: `Crosswalk has no dropped kerb ramp. Steps prevent wheelchair transition.`,
          severity: 'high',
        });
      }
    }
  }

  // Calculate accessibility score (0 to 100)
  let score = 100;
  if (hasRedObstacles) score -= 50;
  if (hasMissingRamps) score -= 30;
  if (hasGreySegments) score -= 10;
  score = Math.max(0, Math.min(100, score));

  const estimatedTimeSeconds = Math.round(totalDistanceM / options.walkingSpeedMetresPerSecond);

  return {
    mode,
    pathNodeIds,
    pathEdgeIds: pathEdges.map((e) => e.id),
    segments: segmentsTraversed,
    crosswalks: crosswalksTraversed,
    coordinates,
    totalDistanceM: Math.round(totalDistanceM * 10) / 10,
    totalCost: Math.round(totalCost * 10) / 10,
    estimatedTimeSeconds,
    accessibilityScore: score,
    hasRedObstacles,
    hasMissingRamps,
    hasGreySegments,
    warnings,
  };
}

/**
 * Computes both the Accessible Route (barrier-optimized) and the Standard Route
 * (shortest path across roads/pavements with warning annotations).
 */
export function findDualRoutes(
  graph: FootpathGraph,
  startCoord: [number, number],
  endCoord: [number, number],
  options?: RouterOptions,
): DualRouteResult {
  const startMatch = graph.findNearestNode(startCoord);
  const endMatch = graph.findNearestNode(endCoord);

  if (!startMatch || !endMatch) {
    return {
      accessibleRoute: null,
      standardRoute: null,
      recommendation: 'neither',
      summary: 'Start or end coordinate is too far from the footpath network.',
    };
  }

  const startNode = startMatch.node;
  const targetNode = endMatch.node;

  const accessibleRoute = findPathAStar(graph, startNode, targetNode, 'accessible', options);

  const standardRoute = findPathAStar(graph, startNode, targetNode, 'standard', options);

  if (!accessibleRoute && !standardRoute) {
    return {
      accessibleRoute: null,
      standardRoute: null,
      recommendation: 'neither',
      summary: 'No route could be found between the selected locations.',
    };
  }

  // Produce clear comparison summary
  let recommendation: 'accessible' | 'standard' | 'neither' = 'accessible';
  let summary = '';

  if (accessibleRoute && standardRoute) {
    const distDiffM =
      Math.round((accessibleRoute.totalDistanceM - standardRoute.totalDistanceM) * 10) / 10;

    if (!standardRoute.hasRedObstacles && !standardRoute.hasMissingRamps) {
      recommendation = 'standard';
      summary = `The shortest route (${standardRoute.totalDistanceM} m) is fully wheelchair accessible with zero barrier penalties.`;
    } else if (!accessibleRoute.hasRedObstacles && !accessibleRoute.hasMissingRamps) {
      recommendation = 'accessible';
      summary = `Accessible route detours ${distDiffM} m to completely avoid ${standardRoute.warnings.length} obstacle(s) on the standard path.`;
    } else {
      recommendation = 'accessible';
      summary = `Caution: Obstacles present on both paths. Accessible route minimises barrier severity (Score: ${accessibleRoute.accessibilityScore}/100 vs ${standardRoute.accessibilityScore}/100).`;
    }
  } else if (accessibleRoute) {
    recommendation = 'accessible';
    summary = `Accessible route found (${accessibleRoute.totalDistanceM} m).`;
  } else if (standardRoute) {
    recommendation = 'standard';
    summary = `Standard route found (${standardRoute.totalDistanceM} m) with ${standardRoute.warnings.length} warning(s).`;
  }

  return {
    accessibleRoute,
    standardRoute,
    recommendation,
    summary,
  };
}
