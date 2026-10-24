#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const REQUIRED_OBSTACLE_CODES = [
  'broken_footpath',
  'garbage',
  'missing_kerb_ramp',
  'parked_vehicle',
  'pole_fixed_obstacle',
  'rubble',
  'steps',
  'unknown',
  'vendor_cart',
];

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

  throw new Error(`Missing one of: ${keys.join(', ')}`);
}

async function request(baseUrl, path, key, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned HTTP ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  return body ? JSON.parse(body) : null;
}

const env = parseEnv(await readFile('.env', 'utf8'));
const baseUrl = (env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const serverKey = required(env, ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY']);
const publicKey = required(env, [
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
]);

if (!/^https:\/\/[^/]+\.supabase\.co$/.test(baseUrl)) {
  throw new Error('SUPABASE_URL does not look like a Supabase project URL');
}

const health = await request(baseUrl, '/rest/v1/rpc/phase1_healthcheck', serverKey, {
  method: 'POST',
  body: '{}',
});

const obstacleRows = await request(
  baseUrl,
  '/rest/v1/obstacle_types?select=code&order=code.asc',
  serverKey,
);
const obstacleCodes = obstacleRows.map((row) => row.code).sort();
const expectedCodes = [...REQUIRED_OBSTACLE_CODES].sort();

if (JSON.stringify(obstacleCodes) !== JSON.stringify(expectedCodes)) {
  throw new Error(
    `Obstacle seed mismatch: expected ${expectedCodes.join(', ')}, got ${obstacleCodes.join(', ')}`,
  );
}

await request(baseUrl, '/storage/v1/bucket/thumbnails', serverKey);
await request(baseUrl, '/rest/v1/segment_state?select=segment_id&limit=1', publicKey);

const requiredTables = [
  'roads',
  'footpath_segments',
  'crosswalk_links',
  'obstacle_types',
  'observations',
  'segment_state',
  'profiles',
  'unknown_obstacle_queue',
  'model_versions',
];
const tableRls = health.tables ?? {};
const missingRls = requiredTables.filter((table) => tableRls[table] !== true);

if (missingRls.length > 0) {
  throw new Error(`RLS is not enabled for: ${missingRls.join(', ')}`);
}

if (!health.extensions?.postgis || !health.extensions?.pg_cron) {
  throw new Error('PostGIS and pg_cron must both be enabled');
}

if (health.thumbnail_bucket !== true) {
  throw new Error('The private thumbnails storage bucket is missing');
}

console.log('Supabase URL: valid');
console.log('Server key: present (value not printed)');
console.log('Public key: present (value not printed)');
console.log('PostGIS: enabled');
console.log('pg_cron: enabled');
console.log(`RLS: enabled on ${requiredTables.length} application tables`);
console.log(`Obstacle seed: ${obstacleCodes.length} codes`);
console.log('Thumbnails bucket: present and private');
console.log('Public segment-state read: reachable');
console.log('Phase 1 foundation verification: PASS');
