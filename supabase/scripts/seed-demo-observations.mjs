#!/usr/bin/env node

/**
 * AccessPath Demo Observations Seeder
 *
 * Usage:
 *   node supabase/scripts/seed-demo-observations.mjs --seed
 *   node supabase/scripts/seed-demo-observations.mjs --clear
 *   node supabase/scripts/seed-demo-observations.mjs --reseed
 *
 * Requirements:
 * - Seeds ~80-100 obstacles across Indiranagar, Bengaluru
 * - ~45 Red (parked vehicles, vendor carts, rubble, steps, poles)
 * - ~25-30 Yellow (broken footpaths)
 * - ~10-15 missing kerb ramps
 * - Focused demonstration corridor along 100 Feet Road
 * - All rows flagged with source='demo'
 * - Reads service_role key from local .env
 */

import { readFileSync } from 'node:fs';

const envText = readFileSync('.env', 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.trim().match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
}

const url = env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function api(path, options = {}) {
  const res = await fetch(`${url}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status} ${res.statusText}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function clearDemoData() {
  console.log('--- Clearing demo observations ---');
  // Find all segments currently having demo observations
  const obs = await api('/rest/v1/observations?source=eq.demo&select=segment_id');
  const segmentIds = [...new Set((obs || []).map((o) => o.segment_id).filter(Boolean))];

  console.log(`Found ${obs ? obs.length : 0} demo observations across ${segmentIds.length} segments.`);

  if (obs && obs.length > 0) {
    await api('/rest/v1/observations?source=eq.demo', { method: 'DELETE' });
    console.log('Deleted all demo observation rows.');
  }

  // Recompute state for all affected segments
  console.log('Recomputing segment states...');
  for (const segId of segmentIds) {
    try {
      await api('/rest/v1/rpc/compute_segment_state', {
        method: 'POST',
        body: JSON.stringify({ p_segment_id: segId }),
      });
    } catch {
      // Continue recomputing
    }
  }
  console.log('Done! All affected segments recomputed.');
}

export async function seedDemoData() {
  console.log('--- Seeding demo observations ---');

  // Query segments in Indiranagar
  const segments = await api(
    '/rest/v1/footpath_segments?limit=400&select=id,road_id,side,segment_index,length_m',
  );

  if (!segments || segments.length === 0) {
    throw new Error('No footpath segments found in database. Graph builder must be run first.');
  }

  // Separate segments by side and index for a clear demonstration corridor
  // Pick segments on 100 Feet Road / main road for the demo showcase:
  // e.g. Left side will have 3 blocked Red spots, Right side will be clear Green.
  const now = new Date();
  const makeTime = (hoursAgo) => new Date(now.getTime() - hoursAgo * 3600 * 1000).toISOString();

  const demoObservations = [];
  const targetSegments = segments.slice(0, 150);

  let redCount = 0;
  let yellowCount = 0;
  let rampCount = 0;

  // 1. Showcase Demo Corridor: first 10 Left segments have 3 Red blocks (parked scooter, vendor cart, rubble)
  const corridorLeft = targetSegments.filter((s) => s.side === 'L').slice(0, 8);
  const corridorRight = targetSegments.filter((s) => s.side === 'R').slice(0, 8);

  if (corridorLeft.length >= 4) {
    // Left segment 2: Parked vehicle (Red, severity 70)
    demoObservations.push({
      segment_id: corridorLeft[1].id,
      obstacle_type: 'parked_vehicle',
      confidence: 0.95,
      source: 'demo',
      captured_at: makeTime(1.5),
      heading_degrees: 180,
      camera_side: 'L',
      is_clear: false,
      metadata: { note: 'Parked delivery scooters completely blocking footpath', demo_corridor: true },
    });
    redCount++;

    // Left segment 3: Vendor cart (Red, severity 65)
    demoObservations.push({
      segment_id: corridorLeft[2].id,
      obstacle_type: 'vendor_cart',
      confidence: 0.92,
      source: 'demo',
      captured_at: makeTime(2.0),
      heading_degrees: 180,
      camera_side: 'L',
      is_clear: false,
      metadata: { note: 'Fruit vendor cart occupying entire 1.2m width', demo_corridor: true },
    });
    redCount++;

    // Left segment 4: Rubble (Red, severity 60)
    demoObservations.push({
      segment_id: corridorLeft[3].id,
      obstacle_type: 'rubble',
      confidence: 0.88,
      source: 'demo',
      captured_at: makeTime(5.0),
      heading_degrees: 180,
      camera_side: 'L',
      is_clear: false,
      metadata: { note: 'Construction debris across pavement', demo_corridor: true },
    });
    redCount++;
  }

  // Right side of the corridor: all-clear observations (turning them vibrant Green)
  for (const rSeg of corridorRight.slice(0, 6)) {
    demoObservations.push({
      segment_id: rSeg.id,
      obstacle_type: null,
      confidence: 0.98,
      source: 'demo',
      captured_at: makeTime(1.0),
      is_clear: true,
      metadata: { note: 'Paved, wide, clear sidewalk on opposite side', demo_corridor: true },
    });
  }

  // 2. Distribute remaining ~85 obstacles across surrounding streets for a realistic natural map
  const otherSegments = targetSegments.slice(10);
  const redTypes = ['parked_vehicle', 'vendor_cart', 'rubble', 'steps', 'pole_fixed_obstacle'];
  const yellowTypes = ['broken_footpath', 'garbage'];

  let i = 0;
  while (demoObservations.length < 95 && i < otherSegments.length) {
    const seg = otherSegments[i];
    i++;

    if (redCount < 45) {
      const type = redTypes[redCount % redTypes.length];
      demoObservations.push({
        segment_id: seg.id,
        obstacle_type: type,
        confidence: 0.80 + Math.random() * 0.18,
        source: 'demo',
        captured_at: makeTime(0.5 + Math.random() * 12),
        heading_degrees: Math.floor(Math.random() * 360),
        is_clear: false,
        metadata: { demo_label: 'natural_seed' },
      });
      redCount++;
    } else if (yellowCount < 28) {
      const type = yellowTypes[yellowCount % yellowTypes.length];
      demoObservations.push({
        segment_id: seg.id,
        obstacle_type: type,
        confidence: 0.75 + Math.random() * 0.20,
        source: 'demo',
        captured_at: makeTime(1 + Math.random() * 24),
        heading_degrees: Math.floor(Math.random() * 360),
        is_clear: false,
        metadata: { demo_label: 'natural_seed' },
      });
      yellowCount++;
    } else if (rampCount < 12) {
      demoObservations.push({
        segment_id: seg.id,
        obstacle_type: 'missing_kerb_ramp',
        confidence: 0.90,
        source: 'demo',
        captured_at: makeTime(3.0),
        heading_degrees: Math.floor(Math.random() * 360),
        is_clear: false,
        metadata: { demo_label: 'missing_ramp' },
      });
      rampCount++;
    }
  }

  console.log(`Inserting ${demoObservations.length} demo observations...`);
  // Insert in batches of 25 with normalized keys
  for (let b = 0; b < demoObservations.length; b += 25) {
    const rawBatch = demoObservations.slice(b, b + 25);
    const batch = rawBatch.map((o) => ({
      segment_id: o.segment_id,
      obstacle_type: o.obstacle_type ?? null,
      confidence: o.confidence,
      source: o.source,
      captured_at: o.captured_at,
      heading_degrees: o.heading_degrees ?? null,
      camera_side: o.camera_side ?? null,
      is_clear: o.is_clear ?? false,
      metadata: o.metadata ?? {},
    }));
    await api('/rest/v1/observations', {
      method: 'POST',
      body: JSON.stringify(batch),
    });
  }

  console.log(`Observations inserted: ${redCount} Red, ${yellowCount} Yellow, ${rampCount} Missing Ramps.`);

  // Check state counts
  const states = await api('/rest/v1/segment_state?select=status');
  const counts = { green: 0, yellow: 0, red: 0, grey: 0 };
  for (const s of states || []) {
    if (counts[s.status] !== undefined) counts[s.status]++;
  }

  console.log('\n--- Live Segment State Counts ---');
  console.log(`🔴 Red:    ${counts.red}`);
  console.log(`🟡 Yellow: ${counts.yellow}`);
  console.log(`🟢 Green:  ${counts.green}`);
  console.log(`⚪ Grey:   ${counts.grey}`);

  console.log('\n--- Demonstration Corridor Details ---');
  if (corridorLeft.length >= 4) {
    console.log(`Demo Start (Left side): ${corridorLeft[0].id}`);
    console.log(`Blocked Segments:       ${corridorLeft[1].id}, ${corridorLeft[2].id}, ${corridorLeft[3].id}`);
    console.log(`Accessible Bypass:      Cross to Right side -> ${corridorRight[0]?.id || 'opposite'}`);
  }
}

const mode = process.argv[2];
if (mode === '--clear') {
  clearDemoData().catch((e) => console.error(e));
} else if (mode === '--seed') {
  seedDemoData().catch((e) => console.error(e));
} else if (mode === '--reseed') {
  clearDemoData()
    .then(() => seedDemoData())
    .catch((e) => console.error(e));
} else {
  console.log('Usage: node seed-demo-observations.mjs [--seed | --clear | --reseed]');
}
