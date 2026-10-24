# AccessPath progress

**Last updated:** 2026-10-24

## Phase status

| Phase | Scope                         | Status                                                                                                  |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| 0     | Setup and folders             | Complete for approval: scaffold committed; dependency installation and dev client remain deferred       |
| 1     | Supabase backend foundation   | Complete for approval: migration deployed and verification passed                                       |
| 2     | Pilot graph builder           | Complete for approval: local build, hosted upload, row counts, and checks verified                      |
| 3     | Free imagery harvester        | Paused: local harvester and KartaView adapter complete; Mapillary token required for live pilot harvest |
| 4     | Vision models                 | Not started; licences and free compute path required                                                    |
| 5     | State fusion and self-healing | Complete for approval: migration deployed and verification passed                                       |
| 6     | Mobile map skeleton           | Not started                                                                                             |
| 7     | Routing and comparison        | Not started                                                                                             |
| 8     | Always-on camera copilot      | Not started                                                                                             |
| 9     | Learning loop                 | Not started                                                                                             |
| 10    | Hardening                     | Not started                                                                                             |
| 11    | Deployment                    | Not started                                                                                             |

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

## Phase 2 acceptance criteria

- [x] Reusable pilot configuration with a bounded area and ~10 m segment target.
- [x] OSM road graph download with official map API and free Overpass fallback.
- [x] Deterministic left/right footpath offsets and stable segment IDs.
- [x] New segments uploaded as Grey/unverified with automatic segment-state rows.
- [x] Directional inferred crosswalk links generated at nearby intersections.
- [x] Idempotent Supabase upload path using only the server-side key.
- [x] Local GeoJSON preview and build statistics generated.
- [x] Hosted row counts match the local build.
- [x] Core graph-builder tests pass.

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
- `pnpm run lint` → passed with ESLint 10.13.0.
- `pnpm run typecheck` → passed with TypeScript 7.0.2.
- The test script was corrected from `node --test tests` to `node --test tests/*.test.mjs` before
  the passing test run.
- `pnpm add --save-dev --save-exact -w typescript@7.0.2 eslint@10.13.0 prettier@3.9.10` →
  installed successfully using the local Corepack executable.
- Local `.env` verification on 2026-10-24: all expected legacy and current Supabase variable names
  are populated; the project URL has a valid-looking `https://*.supabase.co` shape; public and
  server URL values match; `.env` is ignored and not tracked.
- Public REST smoke check: `GET /rest/v1/segment_state?select=segment_id&limit=1` returned HTTP
  200 using the public key without printing it.
- Server-side REST smoke check initially returned HTTP 404 for `phase1_healthcheck`, which proved
  the endpoint/key path was accepted before the migration was deployed.
- `node supabase/scripts/verify-foundation.mjs` → passed: PostGIS, pg_cron, RLS on 9 tables, 9
  obstacle codes, private thumbnails bucket, and public segment-state read access.
- Phase 2 approval received on 2026-10-24. A compact Indiranagar, Bengaluru pilot was selected as
  a reasonable default because no area was supplied.
- Graph-builder dependency versions checked and installed: OSMnx 2.1.1 (MIT), Shapely 2.2.0
  (BSD-3-Clause), pytest 9.1.1 (MIT); OSM data remains ODbL with attribution metadata.
- Phase 2 local build completed for the default pilot: 211 OSM roads, 8,733 Grey/unverified
  footpath segments (4,374 left and 4,359 right), and 12,148 directional inferred crosswalk links. Preview and
  stats were generated locally and ignored by Git.
- The builder uses the small-area official OSM map API first, with free Overpass fallbacks for
  larger/future areas. A transient Overpass timeout occurred before the map API fallback succeeded.
- Root tooling is now installed and verified: TypeScript 7.0.2, ESLint 10.13.0, and Prettier
  3.9.10. `pnpm run format:check`, `pnpm run typecheck`, `pnpm run lint`, and `pnpm test` all pass.
- Graph-builder tests pass: `9 passed`; the generated GeoJSON preview contains 21,092 features and
  matches `stats.json` (211 roads + 8,733 segments + 12,148 links).
- Hosted upload completed using the server-side key; Supabase row counts matched: 211 roads, 8,733
  footpath segments, 12,148 crosswalk links, and 8,733 initial Grey segment-state rows.
- Phase 3 harvester foundation implemented with Mapillary bbox-tile/cursor pagination, KartaView
  bounded center/radius tiling, append-only JSONL resume cache, resumable thumbnail downloads,
  attribution retention, nearest left/right segment projection, and explicit observation upload.
- KartaView live smoke check returned 3 pilot images from `api.kartaview.org`; Mapillary live
  harvesting was not attempted because `MAPILLARY_ACCESS_TOKEN` is empty in the local `.env`.
- Harvester tests pass: `9 passed`. Root formatting, typecheck, lint, and tests also pass.

## Phase 3 acceptance criteria

- [x] Provider-neutral image metadata model with capture time, heading, coordinates, thumbnails, and
      attribution.
- [x] Mapillary bbox queries are tiled and paginated; no one-image-at-a-time pin generation.
- [x] KartaView adapter uses its bounded public API and filters results back to the pilot bbox.
- [x] Metadata cache is resumable by provider/image ID.
- [x] Thumbnail downloads resume with `.part` files and HTTP Range requests.
- [x] Images project to the nearest left/right segment using distance and heading.
- [x] Server-side observation upload is explicit and refuses to create implicit false-clear rows.
- [ ] Mapillary live pilot harvest completed; blocked on `MS-0008`.
      Dependency installation and tool versions are recorded above; checks are reported only when they
      have actually run successfully.

## Phase 5 acceptance criteria

- [x] Obstacle decay math implemented (hours for vehicles/carts, days for rubble/garbage, zero decay for permanent obstacles).
- [x] Observation weighting with confidence and reporter trust.
- [x] All-clear observations reduce active obstacle confidence.
- [x] Permanent obstacles require >= 2 independent confirmations before status changes from Red to Green.
- [x] Stale segments (>90 days without observations) revert to Grey/unverified.
- [x] `compute_segment_state(text/uuid)` live calculation function implemented.
- [x] `batch_recompute_dirty_segments()` scheduled runner and dirty queue implemented.
- [x] `observations` table trigger immediately recomputes affected segment state.
- [x] pg_cron hourly schedule `'hourly-obstacle-decay'` configured.
- [x] Phase 5 migration executed in Supabase SQL Editor (`MS-0015`).
- [x] `node supabase/scripts/test-fusion.mjs` verification passing against hosted instance.

## Decisions and assumptions

- The repository is being created in `C:\Users\priya\OneDrive\Documents\Hypnexis`.
- The primary mobile target is Android.
- pnpm is the workspace package manager because it is available through Corepack and matches the
  requested monorepo shape.
- Supabase credentials remain in the ignored local `.env` file and are never committed.
