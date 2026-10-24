import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const requiredPaths = [
  'apps/mobile',
  'services/graph-builder',
  'services/harvester',
  'services/ml',
  'supabase',
  'packages/shared',
  'docs/PROGRESS.md',
  'docs/MANUAL_STEPS.md',
  'docs/ARCHITECTURE.md',
  'docs/PRIVACY.md',
  'docs/SETUP.md',
  '.env.example',
  'pnpm-workspace.yaml',
];

test('Phase 0 repository scaffold is present', async () => {
  await Promise.all(requiredPaths.map((path) => access(path)));
});

test('the example environment does not contain a credential value', async () => {
  const envExample = await readFile('.env.example', 'utf8');

  assert.match(envExample, /SUPABASE_SERVICE_ROLE_KEY=/);
  assert.doesNotMatch(envExample, /SUPABASE_SERVICE_ROLE_KEY=\S+/);
  assert.doesNotMatch(envExample, /MAPILLARY_ACCESS_TOKEN=\S+/);
});
