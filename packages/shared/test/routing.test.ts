import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import {
  buildFootpathGraph,
  findPathAStar,
  findDualRoutes,
  findLastSafeExit,
  type FootpathGraph,
  type FootpathSegmentInput,
  type CrosswalkLinkInput,
} from '../src/routing/index.ts';

describe('Footpath Graph & A* Routing Engine', () => {
  /**
   * Helper: creates a synthetic 2-sided street with multiple sequential segments:
   *
   * Left side:  L0 -> L1 -> L2 -> L3 -> L4 (each ~50m long, running West to East)
   * Road:       Centerline
   * Right side: R0 -> R1 -> R2 -> R3 -> R4 (parallel to Left, offset South)
   *
   * Crosswalks connecting Left and Right:
   * CW_0: connects L0 and R0 (has ramp)
   * CW_2: connects L2 and R2 (has ramp)
   * CW_4: connects L4 and R4 (has ramp)
   */
  function createTestCorridor() {
    const segments: FootpathSegmentInput[] = [
      // Left side segments
      {
        id: 'seg-L0',
        roadId: 'road-main',
        side: 'left',
        segmentIndex: 0,
        lengthM: 50,
        status: 'green',
        coordinates: [
          [77.633, 12.9752],
          [77.63345, 12.9752],
        ],
      },
      {
        id: 'seg-L1',
        roadId: 'road-main',
        side: 'left',
        segmentIndex: 1,
        lengthM: 50,
        status: 'green',
        coordinates: [
          [77.63345, 12.9752],
          [77.6339, 12.9752],
        ],
      },
      {
        id: 'seg-L2',
        roadId: 'road-main',
        side: 'left',
        segmentIndex: 2,
        lengthM: 50,
        status: 'green',
        coordinates: [
          [77.6339, 12.9752],
          [77.63435, 12.9752],
        ],
      },
      {
        id: 'seg-L3',
        roadId: 'road-main',
        side: 'left',
        segmentIndex: 3,
        lengthM: 50,
        status: 'green',
        coordinates: [
          [77.63435, 12.9752],
          [77.6348, 12.9752],
        ],
      },
      {
        id: 'seg-L4',
        roadId: 'road-main',
        side: 'left',
        segmentIndex: 4,
        lengthM: 50,
        status: 'green',
        coordinates: [
          [77.6348, 12.9752],
          [77.63525, 12.9752],
        ],
      },

      // Right side segments
      {
        id: 'seg-R0',
        roadId: 'road-main',
        side: 'right',
        segmentIndex: 0,
        lengthM: 50,
        status: 'green',
        coordinates: [
          [77.633, 12.9748],
          [77.63345, 12.9748],
        ],
      },
      {
        id: 'seg-R1',
        roadId: 'road-main',
        side: 'right',
        segmentIndex: 1,
        lengthM: 50,
        status: 'green',
        coordinates: [
          [77.63345, 12.9748],
          [77.6339, 12.9748],
        ],
      },
      {
        id: 'seg-R2',
        roadId: 'road-main',
        side: 'right',
        segmentIndex: 2,
        lengthM: 50,
        status: 'green',
        coordinates: [
          [77.6339, 12.9748],
          [77.63435, 12.9748],
        ],
      },
      {
        id: 'seg-R3',
        roadId: 'road-main',
        side: 'right',
        segmentIndex: 3,
        lengthM: 50,
        status: 'green',
        coordinates: [
          [77.63435, 12.9748],
          [77.6348, 12.9748],
        ],
      },
      {
        id: 'seg-R4',
        roadId: 'road-main',
        side: 'right',
        segmentIndex: 4,
        lengthM: 50,
        status: 'green',
        coordinates: [
          [77.6348, 12.9748],
          [77.63525, 12.9748],
        ],
      },
    ];

    const crosswalks: CrosswalkLinkInput[] = [
      {
        id: 'cw-0',
        fromSegmentId: 'seg-L0',
        toSegmentId: 'seg-R0',
        rampFlag: true,
        lengthM: 10,
        coordinates: [
          [77.63345, 12.9752],
          [77.63345, 12.9748],
        ],
      },
      {
        id: 'cw-2',
        fromSegmentId: 'seg-L2',
        toSegmentId: 'seg-R2',
        rampFlag: true,
        lengthM: 10,
        coordinates: [
          [77.63435, 12.9752],
          [77.63435, 12.9748],
        ],
      },
      {
        id: 'cw-4',
        fromSegmentId: 'seg-L4',
        toSegmentId: 'seg-R4',
        rampFlag: true,
        lengthM: 10,
        coordinates: [
          [77.63525, 12.9752],
          [77.63525, 12.9748],
        ],
      },
    ];

    return { segments, crosswalks };
  }

  function requireNode(graph: FootpathGraph, id: string) {
    const node = graph.getNode(id);
    if (!node) throw new Error(`Node ${id} not found`);
    return node;
  }

  function requireEndpoints(graph: FootpathGraph, segId: string) {
    const ep = graph.segmentEndpoints.get(segId);
    if (!ep) throw new Error(`Endpoints for ${segId} not found`);
    return ep;
  }

  function requireSegment(segments: FootpathSegmentInput[], id: string): FootpathSegmentInput {
    const seg = segments.find((s) => s.id === id);
    if (!seg) throw new Error(`Segment ${id} not found`);
    return seg;
  }

  function requireCrosswalk(crosswalks: CrosswalkLinkInput[], id: string): CrosswalkLinkInput {
    const cw = crosswalks.find((c) => c.id === id);
    if (!cw) throw new Error(`Crosswalk ${id} not found`);
    return cw;
  }

  test('builds graph with bidirectional edges and sequential junction connectivity', () => {
    const { segments, crosswalks } = createTestCorridor();
    const graph = buildFootpathGraph(segments, crosswalks);

    assert.equal(graph.segments.size, 10);
    assert.equal(graph.crosswalks.size, 3);

    // Each segment endpoint shares nodes with adjacent segments
    const endpointsL0 = requireEndpoints(graph, 'seg-L0');
    const endpointsL1 = requireEndpoints(graph, 'seg-L1');
    assert.equal(endpointsL0.endNodeId, endpointsL1.startNodeId);

    // Node degree check: shared node has outgoing edges for L0:rev, L1:fwd, and crosswalk cw-0
    const junctionNeighbors = graph.getNeighbors(endpointsL0.endNodeId);
    assert.ok(junctionNeighbors.length >= 2);
  });

  test('normal routing on all-green segments follows shortest physical path', () => {
    const { segments, crosswalks } = createTestCorridor();
    const graph = buildFootpathGraph(segments, crosswalks);

    const startEndpoints = requireEndpoints(graph, 'seg-L0');
    const targetEndpoints = requireEndpoints(graph, 'seg-L4');

    const startNode = requireNode(graph, startEndpoints.startNodeId);
    const targetNode = requireNode(graph, targetEndpoints.endNodeId);

    const route = findPathAStar(graph, startNode, targetNode, 'accessible');
    if (!route) throw new Error('Expected route to be found');

    assert.equal(route.hasRedObstacles, false);
    assert.equal(route.hasMissingRamps, false);
    assert.equal(route.accessibilityScore, 100);
    assert.equal(route.totalDistanceM, 250); // 5 segments * 50m
    assert.equal(route.segments.length, 5);
  });

  test('accessible route avoids a Red blocked segment by crossing to opposite footpath', () => {
    const { segments, crosswalks } = createTestCorridor();

    // Block Left side segment 1 (e.g. broken slabs / steps)
    const blockedSeg = requireSegment(segments, 'seg-L1');
    blockedSeg.status = 'red';

    const graph = buildFootpathGraph(segments, crosswalks);

    const startEndpoints = requireEndpoints(graph, 'seg-L0');
    const targetEndpoints = requireEndpoints(graph, 'seg-L3');

    const startNode = requireNode(graph, startEndpoints.startNodeId);
    const targetNode = requireNode(graph, targetEndpoints.endNodeId);

    // Accessible routing should detour: L0 -> CW-0 -> R1 -> R2 -> CW-2 -> L3
    const accessibleRoute = findPathAStar(graph, startNode, targetNode, 'accessible');
    if (!accessibleRoute) throw new Error('Expected accessible route');
    assert.equal(
      accessibleRoute.hasRedObstacles,
      false,
      'Accessible route must not traverse Red segment when detour exists',
    );

    // Confirm it used crosswalks to bypass obstacle
    assert.ok(accessibleRoute.crosswalks.length >= 2);

    // Standard routing takes the shorter path straight through the Red obstacle
    const standardRoute = findPathAStar(graph, startNode, targetNode, 'standard');
    if (!standardRoute) throw new Error('Expected standard route');
    assert.equal(standardRoute.hasRedObstacles, true);
    assert.ok(standardRoute.warnings.some((w) => w.type === 'blocked_segment'));
    assert.ok(
      standardRoute.totalDistanceM < accessibleRoute.totalDistanceM,
      'Standard path is physically shorter',
    );
  });

  test('yellow and grey multipliers correctly penalize difficult/unverified paths', () => {
    const { segments, crosswalks } = createTestCorridor();

    // Make Left side rough (Yellow: 2.0x cost multiplier)
    const l1 = requireSegment(segments, 'seg-L1');
    const l2 = requireSegment(segments, 'seg-L2');
    l1.status = 'yellow';
    l2.status = 'yellow';

    const graph = buildFootpathGraph(segments, crosswalks);

    const startEndpoints = requireEndpoints(graph, 'seg-L0');
    const targetEndpoints = requireEndpoints(graph, 'seg-L2');

    const startNode = requireNode(graph, startEndpoints.endNodeId);
    const targetNode = requireNode(graph, targetEndpoints.endNodeId);

    // Direct path along L1+L2 = 100m * 2.0 = 200 cost
    // Alternate path: cross to R (10m) + R1(50m) + R2(50m) + cross back (10m) = 120 cost
    const route = findPathAStar(graph, startNode, targetNode, 'accessible');
    if (!route) throw new Error('Expected route');

    // A* should choose the smoother Right path via crosswalks
    assert.ok(
      route.crosswalks.length > 0,
      'A* should cross to clear right side when left side has high roughness cost',
    );
  });

  test('penalizes crosswalks without kerb ramps in accessible mode', () => {
    const { segments, crosswalks } = createTestCorridor();

    // cw-0 lacks dropped kerb ramp
    const cw0 = requireCrosswalk(crosswalks, 'cw-0');
    cw0.rampFlag = false;

    // Block L1 so crossing is required
    const l1 = requireSegment(segments, 'seg-L1');
    l1.status = 'red';

    const graph = buildFootpathGraph(segments, crosswalks);

    const startEndpoints = requireEndpoints(graph, 'seg-L0');
    const targetEndpoints = requireEndpoints(graph, 'seg-R2');

    const startNode = requireNode(graph, startEndpoints.startNodeId);
    const targetNode = requireNode(graph, targetEndpoints.endNodeId);

    const accessibleRoute = findPathAStar(graph, startNode, targetNode, 'accessible');
    if (!accessibleRoute) throw new Error('Expected accessible route');

    // Standard mode takes cw-0 without penalty
    const standardRoute = findPathAStar(graph, startNode, targetNode, 'standard');
    if (!standardRoute) throw new Error('Expected standard route');
    assert.ok(standardRoute.warnings.some((w) => w.type === 'missing_kerb_ramp'));
  });

  test('fallback routing still returns finite best-effort path when user is trapped', () => {
    const { segments } = createTestCorridor();

    // Isolate road: only Left footpath, no crosswalks, and segment L2 is Red
    const leftOnlySegments = segments.filter((s) => s.side === 'left');
    const l2 = requireSegment(leftOnlySegments, 'seg-L2');
    l2.status = 'red';

    const graph = buildFootpathGraph(leftOnlySegments, []);

    const startEndpoints = requireEndpoints(graph, 'seg-L0');
    const targetEndpoints = requireEndpoints(graph, 'seg-L4');

    const startNode = requireNode(graph, startEndpoints.startNodeId);
    const targetNode = requireNode(graph, targetEndpoints.endNodeId);

    // Router must NOT fail; it returns the route with finite redMultiplier and emits warnings
    const route = findPathAStar(graph, startNode, targetNode, 'accessible');
    if (!route)
      throw new Error('Router must not return null when trapped, returns best-effort route');
    assert.equal(route.hasRedObstacles, true);
    assert.ok(route.totalCost >= 500); // Carries red penalty
    assert.ok(route.accessibilityScore < 60);
  });

  test('findDualRoutes generates accessible and standard routes with comparative summary', () => {
    const { segments, crosswalks } = createTestCorridor();
    const l1 = requireSegment(segments, 'seg-L1');
    l1.status = 'red';

    const graph = buildFootpathGraph(segments, crosswalks);

    const startCoord: [number, number] = [77.633, 12.9752];
    const endCoord: [number, number] = [77.6348, 12.9752];

    const dualResult = findDualRoutes(graph, startCoord, endCoord);

    if (!dualResult.accessibleRoute || !dualResult.standardRoute) {
      throw new Error('Expected both routes to be found');
    }

    assert.equal(dualResult.recommendation, 'accessible');
    assert.equal(dualResult.accessibleRoute.hasRedObstacles, false);
    assert.equal(dualResult.standardRoute.hasRedObstacles, true);
    assert.match(dualResult.summary, /Accessible route detours/);
  });

  test('findLastSafeExit finds closest ramp before an upcoming blocked segment', () => {
    const { segments, crosswalks } = createTestCorridor();
    const graph = buildFootpathGraph(segments, crosswalks);

    // User is currently at seg-L0, walking towards blocked seg-L3
    const userCoord: [number, number] = [77.6332, 12.9752]; // On seg-L0
    const blockedSegmentId = 'seg-L3';

    const exitResult = findLastSafeExit(graph, userCoord, blockedSegmentId);

    assert.equal(exitResult.found, true);
    // cw-2 is on seg-L2, which is the last safe exit BEFORE seg-L3
    assert.equal(exitResult.exitCrosswalk?.id, 'cw-2');
    assert.equal(exitResult.fromSegmentId, 'seg-L2');
    assert.equal(exitResult.toSegmentId, 'seg-R2');
    assert.equal(exitResult.hasAccessibleRamp, true);
    assert.ok((exitResult.distanceFromUserM ?? 0) > 0);
    assert.match(exitResult.warningMessage ?? '', /Last safe exit in/);
  });

  test('findLastSafeExit reports not found when no crosswalk exists before the obstacle', () => {
    const { segments } = createTestCorridor();
    // No crosswalks provided
    const graph = buildFootpathGraph(segments, []);

    const userCoord: [number, number] = [77.6332, 12.9752];
    const blockedSegmentId = 'seg-L2';

    const exitResult = findLastSafeExit(graph, userCoord, blockedSegmentId);
    assert.equal(exitResult.found, false);
    assert.match(exitResult.reason ?? '', /No crosswalk exits exist/);
  });
});
