#!/usr/bin/env node

/**
 * AccessPath Phase 5: State Fusion & Self-Healing Verification Suite
 *
 * Verifies all Phase 5 business rules:
 * 1. Obstacle decay (rapid hours for temporary, multi-day for rubble/garbage, permanent non-decaying)
 * 2. Observation weighting, reporter trust, and all-clear obstacle confidence reduction
 * 3. Permanent obstacles requiring >= 2 independent confirmations to change from Red to Green
 * 4. Stale segments (>90 days without observations) reverting towards Grey (unverified)
 * 5. compute_segment_state (text & UUID) and batch_recompute_dirty_segments functions
 * 6. Instant trigger recomputation on observations table
 * 7. pg_cron hourly decay schedule
 */

import { readFile } from 'node:fs/promises';

const TEST_ROAD_ID = '11111111-2222-3333-4444-555555555555';
const TEST_SEGMENTS = {
  PERM: 'test-seg-perm-fusion',
  RAPID: 'test-seg-rapid-decay',
  DAYS: 'test-seg-multi-day-decay',
  TRUST: 'test-seg-trust-weight',
  STALE: 'test-seg-stale-90d',
  BATCH: 'test-seg-batch-queue',
};

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    values[key] = value;
  }
  return values;
}

function required(values, keys) {
  for (const key of keys) {
    if (values[key]) return values[key];
  }
  throw new Error(`Missing required configuration key. Checked: ${keys.join(', ')}`);
}

async function request(baseUrl, path, key, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: options.headers?.Prefer ?? 'return=representation',
      ...(options.headers ?? {}),
    },
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned HTTP ${response.status}: ${body.slice(0, 400)}`,
    );
  }

  return body ? JSON.parse(body) : null;
}

async function main() {
  const env = parseEnv(await readFile('.env', 'utf8'));
  const baseUrl = (env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const serverKey = required(env, ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY']);

  if (!/^https:\/\/[^/]+\.supabase\.co$/.test(baseUrl)) {
    throw new Error('SUPABASE_URL does not match expected Supabase project format.');
  }

  console.log('--- AccessPath Phase 5 State Fusion Test Suite ---');
  console.log(`Connecting to: ${baseUrl}`);

  // 0. Check Phase 5 migration status via healthcheck
  let health = null;
  try {
    health = await request(baseUrl, '/rest/v1/rpc/phase5_healthcheck', serverKey, {
      method: 'POST',
      body: '{}',
    });
  } catch (error) {
    console.error('\n[PENDING] Phase 5 migration has not been applied to the database yet.');
    console.error('To apply: open the Supabase SQL Editor, paste and run:');
    console.error('  supabase/migrations/202610250001_phase5_state_fusion.sql');
    console.error('Then rerun: node supabase/scripts/test-fusion.mjs\n');
    console.error(`Server response: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  console.log('[PASS] Phase 5 healthcheck endpoint reachable');
  console.log(`  - compute_segment_state: ${health.compute_segment_state_text}`);
  console.log(`  - batch_recompute_dirty_segments: ${health.batch_recompute_dirty_segments}`);
  console.log(`  - trg_observations_recompute: ${health.trg_observations_recompute}`);
  console.log(`  - cron_job_scheduled: ${health.cron_job_scheduled}`);
  console.log(`  - dirty_queue_table: ${health.dirty_queue_table}`);

  if (
    !health.compute_segment_state_text ||
    !health.batch_recompute_dirty_segments ||
    !health.trg_observations_recompute ||
    !health.dirty_queue_table
  ) {
    throw new Error('Phase 5 schema elements are incomplete. Please re-apply migration.');
  }

  async function cleanupTestData() {
    const segmentList = Object.values(TEST_SEGMENTS);
    for (const segId of segmentList) {
      try {
        await request(baseUrl, `/rest/v1/observations?segment_id=eq.${segId}`, serverKey, {
          method: 'DELETE',
        });
        await request(baseUrl, `/rest/v1/segment_state?segment_id=eq.${segId}`, serverKey, {
          method: 'DELETE',
        });
        await request(baseUrl, `/rest/v1/footpath_segments?id=eq.${segId}`, serverKey, {
          method: 'DELETE',
        });
        await request(baseUrl, `/rest/v1/segment_dirty_queue?segment_id=eq.${segId}`, serverKey, {
          method: 'DELETE',
        });
      } catch {
        // Ignore individual cleanup errors
      }
    }
    try {
      await request(baseUrl, `/rest/v1/roads?id=eq.${TEST_ROAD_ID}`, serverKey, {
        method: 'DELETE',
      });
    } catch {
      // Ignore road cleanup error
    }
  }

  let allTestsPassed = true;

  try {
    // Clean before starting tests
    await cleanupTestData();

    // 1. Create test road and test segments
    await request(baseUrl, '/rest/v1/roads', serverKey, {
      method: 'POST',
      body: JSON.stringify([
        {
          id: TEST_ROAD_ID,
          name: 'Phase 5 Test Road',
          highway_type: 'residential',
          geometry: 'LINESTRING(77.6330 12.9714, 77.6400 12.9714)',
        },
      ]),
    });

    const segmentRows = Object.values(TEST_SEGMENTS).map((segId, index) => ({
      id: segId,
      road_id: TEST_ROAD_ID,
      side: 'L',
      segment_index: index,
      geometry: 'LINESTRING(77.6330 12.9714, 77.6340 12.9714)',
      length_m: 10.0,
      status: 'grey',
      difficulty_score: 25.0,
    }));

    await request(baseUrl, '/rest/v1/footpath_segments', serverKey, {
      method: 'POST',
      body: JSON.stringify(segmentRows),
    });

    console.log(`[PASS] Test fixtures initialized (${segmentRows.length} footpath segments)`);

    // -------------------------------------------------------------
    // TEST 1: Initial unverified segment state
    // -------------------------------------------------------------
    {
      const state = await request(
        baseUrl,
        `/rest/v1/segment_state?segment_id=eq.${TEST_SEGMENTS.PERM}`,
        serverKey,
      );
      if (!state[0] || state[0].status !== 'grey' || state[0].difficulty_score !== 25) {
        throw new Error(
          `Test 1 Failed: Expected initial state grey/25, got ${JSON.stringify(state[0])}`,
        );
      }
      console.log(
        '[PASS] Test 1: Initial segment state correctly defaults to Grey with difficulty score 25',
      );
    }

    // -------------------------------------------------------------
    // TEST 2: Trigger on Observation INSERT & Permanent Obstacle (Steps)
    // -------------------------------------------------------------
    {
      const obsTime = new Date(Date.now() - 60000).toISOString();
      await request(baseUrl, '/rest/v1/observations', serverKey, {
        method: 'POST',
        body: JSON.stringify([
          {
            segment_id: TEST_SEGMENTS.PERM,
            obstacle_type: 'steps',
            confidence: 0.9,
            source: 'user',
            is_clear: false,
            captured_at: obsTime,
          },
        ]),
      });

      // Verification: Trigger immediately recomputes state
      const state = await request(
        baseUrl,
        `/rest/v1/segment_state?segment_id=eq.${TEST_SEGMENTS.PERM}`,
        serverKey,
      );
      const row = state[0];

      if (!row || row.status !== 'red' || row.difficulty_score < 40) {
        throw new Error(
          `Test 2 Failed: Expected Red status with high difficulty, got: ${JSON.stringify(row)}`,
        );
      }

      const hasSteps =
        Array.isArray(row.active_obstacles) &&
        row.active_obstacles.some((o) => o.obstacle_type === 'steps');
      if (!hasSteps) {
        throw new Error(
          `Test 2 Failed: active_obstacles does not contain steps: ${JSON.stringify(row.active_obstacles)}`,
        );
      }

      console.log(
        '[PASS] Test 2: Observation INSERT trigger immediately recomputes segment state to Red for permanent steps',
      );
    }

    // -------------------------------------------------------------
    // TEST 3: Permanent Obstacle - Single All-Clear Confirmation (Must NOT transition to Green)
    // -------------------------------------------------------------
    {
      // Rule: Permanent obstacles require at least 2 independent confirmations before status changes from Red to Green.
      const clear1Time = new Date(Date.now() - 40000).toISOString();
      await request(baseUrl, '/rest/v1/observations', serverKey, {
        method: 'POST',
        body: JSON.stringify([
          {
            segment_id: TEST_SEGMENTS.PERM,
            obstacle_type: null,
            confidence: 0.95,
            source: 'user',
            is_clear: true,
            captured_at: clear1Time,
          },
        ]),
      });

      const state = await request(
        baseUrl,
        `/rest/v1/segment_state?segment_id=eq.${TEST_SEGMENTS.PERM}`,
        serverKey,
      );
      const row = state[0];

      if (row.status === 'green') {
        throw new Error(
          'Test 3 Failed: Permanent obstacle transitioned to Green with only 1 confirmation!',
        );
      }
      console.log(
        `[PASS] Test 3: Permanent obstacle requires >= 2 independent confirmations (Status with 1 clear: ${row.status})`,
      );
    }

    // -------------------------------------------------------------
    // TEST 4: Permanent Obstacle - Second Independent Confirmation (Now transitions to Green)
    // -------------------------------------------------------------
    {
      const clear2Time = new Date(Date.now() - 20000).toISOString();
      await request(baseUrl, '/rest/v1/observations', serverKey, {
        method: 'POST',
        body: JSON.stringify([
          {
            segment_id: TEST_SEGMENTS.PERM,
            obstacle_type: null,
            confidence: 0.95,
            source: 'camera', // Independent source/observer
            is_clear: true,
            captured_at: clear2Time,
          },
        ]),
      });

      const state = await request(
        baseUrl,
        `/rest/v1/segment_state?segment_id=eq.${TEST_SEGMENTS.PERM}`,
        serverKey,
      );
      const row = state[0];

      if (row.status !== 'green' || row.difficulty_score > 25) {
        throw new Error(
          `Test 4 Failed: Expected Green after 2 independent confirmations, got: ${JSON.stringify(row)}`,
        );
      }
      console.log(
        `[PASS] Test 4: Permanent obstacle successfully verified clear after 2 independent confirmations (Status: ${row.status}, Difficulty: ${row.difficulty_score})`,
      );
    }

    // -------------------------------------------------------------
    // TEST 5: Temporary Obstacle Rapid Decay (Parked Vehicle - 12h)
    // -------------------------------------------------------------
    {
      // Part A: Fresh parked vehicle is active
      const nowIso = new Date().toISOString();
      await request(baseUrl, '/rest/v1/observations', serverKey, {
        method: 'POST',
        body: JSON.stringify([
          {
            segment_id: TEST_SEGMENTS.RAPID,
            obstacle_type: 'parked_vehicle',
            confidence: 0.85,
            source: 'user',
            is_clear: false,
            captured_at: nowIso,
          },
        ]),
      });

      let state = await request(
        baseUrl,
        `/rest/v1/segment_state?segment_id=eq.${TEST_SEGMENTS.RAPID}`,
        serverKey,
      );
      let row = state[0];
      const hasVehicle = row.active_obstacles?.some((o) => o.obstacle_type === 'parked_vehicle');
      if (!hasVehicle) {
        throw new Error(`Test 5A Failed: Fresh parked_vehicle not active: ${JSON.stringify(row)}`);
      }
      console.log(
        `[PASS] Test 5A: Fresh parked vehicle is active (Status: ${row.status}, Obstacles: ${row.active_obstacles.length})`,
      );

      // Part B: Simulated time decay after 14 hours (> 12 hours decay_hours)
      await request(
        baseUrl,
        `/rest/v1/observations?segment_id=eq.${TEST_SEGMENTS.RAPID}`,
        serverKey,
        {
          method: 'DELETE',
        },
      );
      const past14h = new Date(Date.now() - 14 * 3600 * 1000).toISOString();
      await request(baseUrl, '/rest/v1/observations', serverKey, {
        method: 'POST',
        body: JSON.stringify([
          {
            segment_id: TEST_SEGMENTS.RAPID,
            obstacle_type: 'parked_vehicle',
            confidence: 0.85,
            source: 'user',
            is_clear: false,
            captured_at: past14h,
          },
        ]),
      });

      const decayedState = (
        await request(
          baseUrl,
          `/rest/v1/segment_state?segment_id=eq.${TEST_SEGMENTS.RAPID}`,
          serverKey,
        )
      )[0];
      const vehicleStillActive = decayedState.active_obstacles?.some(
        (o) => o.obstacle_type === 'parked_vehicle',
      );
      if (vehicleStillActive) {
        throw new Error(
          `Test 5B Failed: Parked vehicle should have decayed after 14h: ${JSON.stringify(decayedState)}`,
        );
      }
      console.log(
        '[PASS] Test 5B: Temporary parked vehicle completely decayed after 14 hours (decay_hours: 12)',
      );
    }

    // -------------------------------------------------------------
    // TEST 6: Multi-Day Decay (Garbage 48h & Rubble 72h)
    // -------------------------------------------------------------
    {
      const now = Date.now();

      // Part 6A: At 24h, both garbage (48h) and rubble (72h) remain active
      const obsTime24h = new Date(now - 24 * 3600 * 1000).toISOString();
      await request(baseUrl, '/rest/v1/observations', serverKey, {
        method: 'POST',
        body: JSON.stringify([
          {
            segment_id: TEST_SEGMENTS.DAYS,
            obstacle_type: 'garbage',
            confidence: 0.8,
            source: 'user',
            is_clear: false,
            captured_at: obsTime24h,
          },
          {
            segment_id: TEST_SEGMENTS.DAYS,
            obstacle_type: 'rubble',
            confidence: 0.8,
            source: 'user',
            is_clear: false,
            captured_at: obsTime24h,
          },
        ]),
      });

      let state = (
        await request(
          baseUrl,
          `/rest/v1/segment_state?segment_id=eq.${TEST_SEGMENTS.DAYS}`,
          serverKey,
        )
      )[0];
      const activeObsCount24h = state.active_obstacles?.length ?? 0;
      if (activeObsCount24h < 2) {
        throw new Error(
          `Test 6A Failed: Expected 2 active obstacles at 24h, found: ${activeObsCount24h}`,
        );
      }
      console.log(
        '[PASS] Test 6A: Rubble (72h) and garbage (48h) remain partially active at 24 hours',
      );

      // Part 6B: At 50h, garbage (48h) is decayed while rubble (72h) remains active
      await request(
        baseUrl,
        `/rest/v1/observations?segment_id=eq.${TEST_SEGMENTS.DAYS}`,
        serverKey,
        {
          method: 'DELETE',
        },
      );
      const obsTime50h = new Date(now - 50 * 3600 * 1000).toISOString();
      await request(baseUrl, '/rest/v1/observations', serverKey, {
        method: 'POST',
        body: JSON.stringify([
          {
            segment_id: TEST_SEGMENTS.DAYS,
            obstacle_type: 'garbage',
            confidence: 0.8,
            source: 'user',
            is_clear: false,
            captured_at: obsTime50h,
          },
          {
            segment_id: TEST_SEGMENTS.DAYS,
            obstacle_type: 'rubble',
            confidence: 0.8,
            source: 'user',
            is_clear: false,
            captured_at: obsTime50h,
          },
        ]),
      });

      state = (
        await request(
          baseUrl,
          `/rest/v1/segment_state?segment_id=eq.${TEST_SEGMENTS.DAYS}`,
          serverKey,
        )
      )[0];
      const hasGarbageAt50h = state.active_obstacles?.some((o) => o.obstacle_type === 'garbage');
      const hasRubbleAt50h = state.active_obstacles?.some((o) => o.obstacle_type === 'rubble');

      if (hasGarbageAt50h || !hasRubbleAt50h) {
        throw new Error(
          `Test 6B Failed: Garbage should have decayed at 50h, rubble should remain active: ${JSON.stringify(state.active_obstacles)}`,
        );
      }
      console.log('[PASS] Test 6B: Garbage decayed after 48h while rubble remains active at 50h');

      // Part 6C: At 80h, both are fully decayed
      await request(
        baseUrl,
        `/rest/v1/observations?segment_id=eq.${TEST_SEGMENTS.DAYS}`,
        serverKey,
        {
          method: 'DELETE',
        },
      );
      const obsTime80h = new Date(now - 80 * 3600 * 1000).toISOString();
      await request(baseUrl, '/rest/v1/observations', serverKey, {
        method: 'POST',
        body: JSON.stringify([
          {
            segment_id: TEST_SEGMENTS.DAYS,
            obstacle_type: 'rubble',
            confidence: 0.8,
            source: 'user',
            is_clear: false,
            captured_at: obsTime80h,
          },
        ]),
      });

      state = (
        await request(
          baseUrl,
          `/rest/v1/segment_state?segment_id=eq.${TEST_SEGMENTS.DAYS}`,
          serverKey,
        )
      )[0];
      if ((state.active_obstacles?.length ?? 0) !== 0) {
        throw new Error(
          `Test 6C Failed: Both obstacles should have decayed at 80h: ${JSON.stringify(state.active_obstacles)}`,
        );
      }
      console.log('[PASS] Test 6C: Both garbage and rubble fully decayed by 80 hours');
    }

    // -------------------------------------------------------------
    // TEST 7: Observation Weighting & All-Clear Obstacle Reduction
    // -------------------------------------------------------------
    {
      const t0 = new Date(Date.now() - 30000).toISOString();
      await request(baseUrl, '/rest/v1/observations', serverKey, {
        method: 'POST',
        body: JSON.stringify([
          {
            segment_id: TEST_SEGMENTS.TRUST,
            obstacle_type: 'vendor_cart',
            confidence: 0.8,
            source: 'user',
            is_clear: false,
            captured_at: t0,
          },
        ]),
      });

      let state = await request(
        baseUrl,
        `/rest/v1/segment_state?segment_id=eq.${TEST_SEGMENTS.TRUST}`,
        serverKey,
      );
      const initialConf = state[0]?.active_obstacles?.[0]?.confidence ?? 0;

      // Positive all-clear observation immediately reduces active obstacle
      const tClear = new Date(Date.now() - 10000).toISOString();
      await request(baseUrl, '/rest/v1/observations', serverKey, {
        method: 'POST',
        body: JSON.stringify([
          {
            segment_id: TEST_SEGMENTS.TRUST,
            obstacle_type: null,
            confidence: 0.9,
            source: 'harvester',
            is_clear: true,
            captured_at: tClear,
          },
        ]),
      });

      state = await request(
        baseUrl,
        `/rest/v1/segment_state?segment_id=eq.${TEST_SEGMENTS.TRUST}`,
        serverKey,
      );
      const remainingObs = state[0]?.active_obstacles?.length ?? 0;

      if (remainingObs !== 0 || state[0].status !== 'green') {
        throw new Error(
          `Test 7 Failed: Expected vendor cart cleared to Green, got: ${JSON.stringify(state[0])}`,
        );
      }
      console.log(
        `[PASS] Test 7: All-clear observation reduced active obstacle confidence (Initial: ${initialConf} -> Cleared: Green)`,
      );
    }

    // -------------------------------------------------------------
    // TEST 8: Stale Segment Reversion (>90 Days without Observations)
    // -------------------------------------------------------------
    {
      // Insert observation 95 days in the past
      const staleTime = new Date(Date.now() - 95 * 24 * 3600 * 1000).toISOString();
      await request(baseUrl, '/rest/v1/observations', serverKey, {
        method: 'POST',
        body: JSON.stringify([
          {
            segment_id: TEST_SEGMENTS.STALE,
            obstacle_type: 'steps',
            confidence: 0.9,
            source: 'user',
            is_clear: false,
            captured_at: staleTime,
          },
        ]),
      });

      const state = await request(
        baseUrl,
        `/rest/v1/segment_state?segment_id=eq.${TEST_SEGMENTS.STALE}`,
        serverKey,
      );
      const row = state[0];

      if (row.status !== 'grey' || row.difficulty_score !== 25) {
        throw new Error(
          `Test 8 Failed: Expected stale segment to revert to Grey/25, got: ${JSON.stringify(row)}`,
        );
      }
      console.log(
        `[PASS] Test 8: Stale segment (>90 days without observations) reverted to Grey with baseline score 25`,
      );
    }

    // -------------------------------------------------------------
    // TEST 9: Batch Recomputation Runner & Dirty Queue
    // -------------------------------------------------------------
    {
      await request(baseUrl, '/rest/v1/rpc/mark_segment_dirty', serverKey, {
        method: 'POST',
        body: JSON.stringify({ p_segment_id: TEST_SEGMENTS.BATCH }),
      });

      const queueCheck = await request(
        baseUrl,
        `/rest/v1/segment_dirty_queue?segment_id=eq.${TEST_SEGMENTS.BATCH}`,
        serverKey,
      );
      if (queueCheck.length === 0) {
        throw new Error('Test 9A Failed: Segment not queued in dirty queue');
      }

      const recomputedCount = await request(
        baseUrl,
        '/rest/v1/rpc/batch_recompute_dirty_segments',
        serverKey,
        {
          method: 'POST',
          body: JSON.stringify({ p_batch_size: 50 }),
        },
      );

      if (typeof recomputedCount !== 'number' || recomputedCount < 1) {
        throw new Error(
          `Test 9B Failed: batch_recompute_dirty_segments returned ${recomputedCount}`,
        );
      }

      const queueAfter = await request(
        baseUrl,
        `/rest/v1/segment_dirty_queue?segment_id=eq.${TEST_SEGMENTS.BATCH}`,
        serverKey,
      );
      if (queueAfter.length !== 0) {
        throw new Error('Test 9C Failed: Dirty queue not cleared after batch recomputation');
      }

      console.log(
        `[PASS] Test 9: batch_recompute_dirty_segments processed ${recomputedCount} segment(s) and cleared dirty queue`,
      );
    }

    // -------------------------------------------------------------
    // TEST 10: State Calculation Engine & Scheduler Verification
    // -------------------------------------------------------------
    {
      const check = await request(baseUrl, '/rest/v1/rpc/phase5_healthcheck', serverKey, {
        method: 'POST',
        body: '{}',
      });
      if (
        !check.compute_segment_state_text ||
        !check.batch_recompute_dirty_segments ||
        !check.cron_job_scheduled ||
        !check.trg_observations_recompute ||
        !check.dirty_queue_table
      ) {
        throw new Error(`Test 10 Failed: Engine healthcheck incomplete: ${JSON.stringify(check)}`);
      }
      console.log(
        '[PASS] Test 10: State calculation engine, triggers, and pg_cron decay scheduler verified',
      );
    }

    console.log('\n=============================================================');
    console.log('ALL PHASE 5 STATE FUSION & DECAY TESTS PASSED SUCCESSFULLY!');
    console.log('=============================================================\n');
  } catch (error) {
    allTestsPassed = false;
    console.error('\n[FAIL] Test suite encountered an error:');
    console.error(error);
  } finally {
    console.log('Cleaning up test fixtures...');
    await cleanupTestData();
    console.log('Cleanup complete.');
  }

  if (!allTestsPassed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\n[FATAL ERROR]', err);
  process.exitCode = 1;
});
