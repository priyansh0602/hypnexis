import type {
  FootpathSegmentInput,
  CrosswalkLinkInput,
  RoutingNode,
  RoutingEdge,
} from './types.ts';

const EARTH_RADIUS_M = 6371000;
const DEFAULT_SNAP_THRESHOLD_M = 2.0;

/**
 * Calculates great-circle Haversine distance between two coordinates in metres.
 */
export function haversineDistanceM(coord1: [number, number], coord2: [number, number]): number {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;

  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Computes total cumulative length of a LineString coordinate sequence in metres.
 */
export function lineStringDistanceM(coordinates: [number, number][]): number {
  if (coordinates.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const c1 = coordinates[i];
    const c2 = coordinates[i + 1];
    if (c1 && c2) {
      total += haversineDistanceM(c1, c2);
    }
  }
  return total;
}

export class FootpathGraph {
  public readonly nodes: Map<string, RoutingNode> = new Map();
  public readonly adjacency: Map<string, RoutingEdge[]> = new Map();
  public readonly edges: Map<string, RoutingEdge> = new Map();
  public readonly segments: Map<string, FootpathSegmentInput> = new Map();
  public readonly crosswalks: Map<string, CrosswalkLinkInput> = new Map();
  public readonly segmentEndpoints: Map<string, { startNodeId: string; endNodeId: string }> =
    new Map();

  public addNode(node: RoutingNode): void {
    if (!this.nodes.has(node.id)) {
      this.nodes.set(node.id, node);
      this.adjacency.set(node.id, []);
    }
  }

  public addEdge(edge: RoutingEdge): void {
    this.edges.set(edge.id, edge);
    const list = this.adjacency.get(edge.from);
    if (list) {
      list.push(edge);
    } else {
      this.adjacency.set(edge.from, [edge]);
    }
  }

  public getNeighbors(nodeId: string): RoutingEdge[] {
    return this.adjacency.get(nodeId) || [];
  }

  public getNode(nodeId: string): RoutingNode | undefined {
    return this.nodes.get(nodeId);
  }

  public getEdge(edgeId: string): RoutingEdge | undefined {
    return this.edges.get(edgeId);
  }

  public getSegment(segmentId: string): FootpathSegmentInput | undefined {
    return this.segments.get(segmentId);
  }

  public getCrosswalk(crosswalkId: string): CrosswalkLinkInput | undefined {
    return this.crosswalks.get(crosswalkId);
  }

  /**
   * Finds the closest routing node to a given geographical coordinate.
   */
  public findNearestNode(coord: [number, number]): { node: RoutingNode; distanceM: number } | null {
    let closestNode: RoutingNode | null = null;
    let minDistance = Infinity;

    for (const node of this.nodes.values()) {
      const dist = haversineDistanceM(coord, node.coordinates);
      if (dist < minDistance) {
        minDistance = dist;
        closestNode = node;
      }
    }

    return closestNode ? { node: closestNode, distanceM: minDistance } : null;
  }

  /**
   * Finds the closest segment to a given coordinate.
   */
  public findNearestSegment(
    coord: [number, number],
  ): { segment: FootpathSegmentInput; distanceM: number } | null {
    let closest: FootpathSegmentInput | null = null;
    let minDist = Infinity;

    for (const segment of this.segments.values()) {
      for (const pt of segment.coordinates) {
        const d = haversineDistanceM(coord, pt);
        if (d < minDist) {
          minDist = d;
          closest = segment;
        }
      }
    }

    return closest ? { segment: closest, distanceM: minDist } : null;
  }
}

/**
 * Builds a topologically connected FootpathGraph from footpath segments and crosswalk links.
 */
export function buildFootpathGraph(
  segments: FootpathSegmentInput[],
  crosswalks: CrosswalkLinkInput[] = [],
  snapThresholdM = DEFAULT_SNAP_THRESHOLD_M,
): FootpathGraph {
  const graph = new FootpathGraph();

  // Sort segments by roadId, side, segmentIndex for deterministic adjacency
  const sortedSegments = [...segments].sort((a, b) => {
    if (a.roadId !== b.roadId) return a.roadId.localeCompare(b.roadId);
    if (a.side !== b.side) return a.side.localeCompare(b.side);
    return a.segmentIndex - b.segmentIndex;
  });

  // Track existing junction nodes spatially to snap nearby endpoints together
  const spatialNodes: Array<{ id: string; coord: [number, number] }> = [];

  function getOrCreateNode(idHint: string, coord: [number, number], segmentId: string): string {
    // Check if an existing node is within snap threshold
    for (const existing of spatialNodes) {
      if (haversineDistanceM(coord, existing.coord) <= snapThresholdM) {
        return existing.id;
      }
    }

    const nodeId = idHint;
    graph.addNode({
      id: nodeId,
      coordinates: coord,
      segmentId,
      isJunction: false,
    });
    spatialNodes.push({ id: nodeId, coord });
    return nodeId;
  }

  // First pass: create nodes and edges for footpath segments
  for (let i = 0; i < sortedSegments.length; i++) {
    const seg = sortedSegments[i];
    if (!seg || seg.coordinates.length < 2) continue;

    graph.segments.set(seg.id, seg);

    const firstCoord = seg.coordinates[0];
    const lastCoord = seg.coordinates[seg.coordinates.length - 1];
    if (!firstCoord || !lastCoord) continue;

    // Check if previous segment was same road and side and directly adjacent
    const prevSeg = i > 0 ? sortedSegments[i - 1] : undefined;
    let startNodeId: string;

    if (
      prevSeg &&
      prevSeg.roadId === seg.roadId &&
      prevSeg.side === seg.side &&
      prevSeg.segmentIndex === seg.segmentIndex - 1
    ) {
      // Connect to the end node of previous segment
      const prevEndpoints = graph.segmentEndpoints.get(prevSeg.id);
      startNodeId = prevEndpoints
        ? prevEndpoints.endNodeId
        : getOrCreateNode(`${seg.id}:start`, firstCoord, seg.id);
    } else {
      startNodeId = getOrCreateNode(`${seg.id}:start`, firstCoord, seg.id);
    }

    const endNodeId = getOrCreateNode(`${seg.id}:end`, lastCoord, seg.id);

    graph.segmentEndpoints.set(seg.id, { startNodeId, endNodeId });

    const distanceM = seg.lengthM > 0 ? seg.lengthM : lineStringDistanceM(seg.coordinates);

    // Forward edge
    graph.addEdge({
      id: `${seg.id}:fwd`,
      from: startNodeId,
      to: endNodeId,
      distanceM,
      kind: 'footpath',
      segmentId: seg.id,
      roadId: seg.roadId,
      side: seg.side,
      status: seg.status,
      difficultyScore: seg.difficultyScore ?? 25,
      coordinates: seg.coordinates,
    });

    // Backward edge (footpaths are bidirectional)
    graph.addEdge({
      id: `${seg.id}:rev`,
      from: endNodeId,
      to: startNodeId,
      distanceM,
      kind: 'footpath',
      segmentId: seg.id,
      roadId: seg.roadId,
      side: seg.side,
      status: seg.status,
      difficultyScore: seg.difficultyScore ?? 25,
      coordinates: [...seg.coordinates].reverse(),
    });
  }

  // Second pass: connect crosswalk links
  for (const cw of crosswalks) {
    graph.crosswalks.set(cw.id, cw);

    const fromEndpoints = graph.segmentEndpoints.get(cw.fromSegmentId);
    const toEndpoints = graph.segmentEndpoints.get(cw.toSegmentId);

    if (!fromEndpoints || !toEndpoints) {
      // One of the connected segments is not in this graph partition
      continue;
    }

    // Determine the closest pair of endpoints between the two segments
    const fromNodes = [
      graph.getNode(fromEndpoints.startNodeId),
      graph.getNode(fromEndpoints.endNodeId),
    ].filter(Boolean) as RoutingNode[];

    const toNodes = [
      graph.getNode(toEndpoints.startNodeId),
      graph.getNode(toEndpoints.endNodeId),
    ].filter(Boolean) as RoutingNode[];

    let bestPair: { fromNode: RoutingNode; toNode: RoutingNode; dist: number } | null = null;

    if (cw.coordinates && cw.coordinates.length >= 2) {
      const cwStart = cw.coordinates[0]!;
      const cwEnd = cw.coordinates[cw.coordinates.length - 1]!;

      let bestFrom = fromNodes[0]!;
      let minFromDist = Infinity;
      for (const fn of fromNodes) {
        const d = Math.min(
          haversineDistanceM(fn.coordinates, cwStart),
          haversineDistanceM(fn.coordinates, cwEnd),
        );
        if (d < minFromDist) {
          minFromDist = d;
          bestFrom = fn;
        }
      }

      let bestTo = toNodes[0]!;
      let minToDist = Infinity;
      for (const tn of toNodes) {
        const d = Math.min(
          haversineDistanceM(tn.coordinates, cwStart),
          haversineDistanceM(tn.coordinates, cwEnd),
        );
        if (d < minToDist) {
          minToDist = d;
          bestTo = tn;
        }
      }

      bestPair = {
        fromNode: bestFrom,
        toNode: bestTo,
        dist: haversineDistanceM(bestFrom.coordinates, bestTo.coordinates),
      };
    } else {
      let minDist = Infinity;
      for (const fn of fromNodes) {
        for (const tn of toNodes) {
          const d = haversineDistanceM(fn.coordinates, tn.coordinates);
          if (d < minDist) {
            minDist = d;
            bestPair = { fromNode: fn, toNode: tn, dist: d };
          }
        }
      }
    }

    if (!bestPair) continue;

    const crosswalkDistM =
      cw.lengthM && cw.lengthM > 0
        ? cw.lengthM
        : cw.coordinates && cw.coordinates.length >= 2
          ? lineStringDistanceM(cw.coordinates)
          : Math.max(3.0, bestPair.dist); // Realistic road crossing width

    const lineCoords: [number, number][] =
      cw.coordinates && cw.coordinates.length >= 2
        ? cw.coordinates
        : [bestPair.fromNode.coordinates, bestPair.toNode.coordinates];

    // Forward crosswalk edge
    graph.addEdge({
      id: `${cw.id}:fwd`,
      from: bestPair.fromNode.id,
      to: bestPair.toNode.id,
      distanceM: crosswalkDistM,
      kind: 'crosswalk',
      rampFlag: cw.rampFlag,
      coordinates: lineCoords,
    });

    // Backward crosswalk edge
    graph.addEdge({
      id: `${cw.id}:rev`,
      from: bestPair.toNode.id,
      to: bestPair.fromNode.id,
      distanceM: crosswalkDistM,
      kind: 'crosswalk',
      rampFlag: cw.rampFlag,
      coordinates: [...lineCoords].reverse(),
    });
  }

  return graph;
}
