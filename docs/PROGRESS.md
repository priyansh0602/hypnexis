# AccessPath progress

**Last updated:** 2026-10-24

## Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Setup and folders | Complete for approval: scaffold committed; dependency installation and dev client remain deferred |
| 1 | Supabase backend foundation | Complete for approval: migration deployed and verification passed |
| 2 | Pilot graph builder | Not started; pilot area required |
| 3 | Free imagery harvester | Not started; Mapillary app/token required |
| 4 | Vision models | Not started; licences and free compute path required |
| 5 | State fusion and self-healing | Not started |
| 6 | Mobile map skeleton | Not started |
| 7 | Routing and comparison | Not started |
| 8 | Always-on camera copilot | Not started |
| 9 | Learning loop | Not started |
| 10 | Hardening | Not started |
| 11 | Deployment | Not started |

## Phase 0 acceptance criteria

- [x] Empty workspace inspected.
- [x] Requested directory structure created.
- [x] Root Git ignore, environment template, workspace metadata, and baseline formatting/linting
      configuration created.
- [x] Initial documentation created.
- [x] Physical Android phone path confirmed: an existing Flutter app runs over USB debugging.
- [x] GitHub repository created and URL provided by the product owner.
- [x] Expo account created; the `priyansh0602` team dashboard is available.
- [x] Android phone developer mode and USB debugging enabled; an existing Flutter app runs on the
      device.
- [ ] Expo development client installed on the primary Android device (deferred until the mobile
      development build exists).
- [x] Phase 0 commit created after the available manual prerequisites were confirmed (`bd56e88`).

## Phase 1 acceptance criteria

- [x] Supabase project and local secret placement verified without printing credentials.
- [x] PostGIS and pg_cron enabled.
- [x] Tables created for roads, footpath segments, crossings, obstacles, observations, state,
      profiles, unknown obstacles, and model versions.
- [x] RLS enabled on all nine application tables.
- [x] Authenticated users can insert their own user/camera observations, but cannot write computed
      segment state directly.
- [x] New footpath segments initialise as Grey/unverified state.
- [x] Obstacle taxonomy seeded with nine required codes.
- [x] Private `thumbnails` storage bucket created with MIME and size limits.
- [x] `node supabase/scripts/verify-foundation.mjs` passed against the deployed project.

## Checks run

From the repository root on 2026-10-24:

- `git --version` → Git 2.39.5.
- `node --version` → Node v22.23.3.
- `npm --version` → npm 10.9.9.
- `python3 --version` → Python 3.11.2.
- `COREPACK_DEFAULT_TO_LATEST=0 pnpm --version` → pnpm 11.24.0.
- `git status --short --branch` → not a repository before scaffolding.
- `adb`, `sdkmanager`, Expo CLI, and EAS CLI were not available as direct commands; Android
  environment variables were not set.
- `pnpm test` → passed: 2 scaffold tests.
- `pnpm run lint` → failed because ESLint has not been installed yet (`eslint: not found`).
- `pnpm run typecheck` → failed because TypeScript has not been installed yet (`tsc: not found`).
- The test script was corrected from `node --test tests` to `node --test tests/*.test.mjs` before
  the passing test run.
- `pnpm add --save-dev --save-exact -w typescript@7.0.2 eslint@10.13.0 prettier@3.9.10` was
  attempted once, but the npm registry requests timed out. No dependency files were changed by
  that failed install.
- Local `.env` verification on 2026-10-24: all expected legacy and current Supabase variable names
  are populated; the project URL has a valid-looking `https://*.supabase.co` shape; public and
  server URL values match; `.env` is ignored and not tracked.
- Public REST smoke check: `GET /rest/v1/segment_state?select=segment_id&limit=1` returned HTTP
  200 using the public key without printing it.
- Server-side REST smoke check initially returned HTTP 404 for `phase1_healthcheck`, which proved
  the endpoint/key path was accepted before the migration was deployed.
- `node supabase/scripts/verify-foundation.mjs` → passed: PostGIS, pg_cron, RLS on 9 tables, 9
  obstacle codes, private thumbnails bucket, and public segment-state read access.

The formatter, linter, and TypeScript compiler are intentionally not reported as passed because
their dependencies are not installed. The scaffold test suite and Phase 1 verification are passed.
Dependency versions will be checked against current official documentation before installation.

## Decisions and assumptions

- The repository is being created in `C:\Users\priya\OneDrive\Documents\Hypnexis`.
- The primary mobile target is Android.
- pnpm is the workspace package manager because it is available through Corepack and matches the
  requested monorepo shape.
- Supabase credentials remain in the ignored local `.env` file and are never committed.
