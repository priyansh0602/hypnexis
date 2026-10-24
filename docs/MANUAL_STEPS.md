# Manual steps log

This file records actions that require the product owner. Statuses are updated only after the
product owner replies `done` and the result is verified locally or in the relevant dashboard.

| ID      | Phase | Manual action                                                                                                                                          | Status  | Date       | Verification                                                                                                                      |
| ------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| MS-0001 | 0     | Install standalone Android SDK Platform-Tools (Android Studio is optional), make `adb` available, and connect or confirm a physical Android phone path | done    | 2026-10-24 | Product owner confirmed an existing Flutter app runs on the connected phone over USB debugging                                    |
| MS-0002 | 0     | Create a GitHub account/repository for AccessPath and provide the repository URL                                                                       | done    | 2026-10-24 | `origin` is configured and `git ls-remote --heads origin` succeeded; repository currently has no remote commits                   |
| MS-0003 | 0     | Create an Expo account                                                                                                                                 | done    | 2026-10-24 | Product owner confirmed the Expo team dashboard is open for `priyansh0602`                                                        |
| MS-0004 | 0     | Enable Android Developer Mode and USB debugging on the primary phone                                                                                   | done    | 2026-10-24 | Product owner confirmed USB debugging works for an existing Flutter app                                                           |
| MS-0005 | 0     | Install the Expo development client on the primary phone                                                                                               | pending | 2026-10-24 | The dev client opens on the phone                                                                                                 |
| MS-0006 | 1     | Create the Supabase project, choose Mumbai/South Asia when offered, and copy keys                                                                      | done    | 2026-10-24 | Local `.env` contains the expected URL/key variables, is ignored, and the Supabase endpoint responded                             |
| MS-0007 | 2     | Choose the pilot ward/neighbourhood or bounding box                                                                                                    | assumed | 2026-10-24 | Default pilot saved locally as Indiranagar, Bengaluru: 12.9714, 77.6330, 12.9800, 77.6425; replace before field rollout if needed |
| MS-0008 | 3     | Create a Mapillary developer app and access token                                                                                                      | pending | 2026-10-24 | Token is present only in ignored local env files                                                                                  |
| MS-0009 | 4     | Run the Colab/Label Studio labelling workflow and create the hand-verified test set                                                                    | pending | 2026-10-24 | Test-set manifest and review counts are recorded                                                                                  |
| MS-0010 | 6     | Run the mobile dev build and confirm the live map loads                                                                                                | pending | 2026-10-24 | App shows OSM base map and Grey unverified segments                                                                               |
| MS-0011 | 8     | Grant camera/location permissions and complete a mounted-phone field test                                                                              | pending | 2026-10-24 | Test checklist and safety observations are recorded                                                                               |
| MS-0012 | 11    | Configure EAS free-tier build and choose direct APK/internal distribution                                                                              | pending | 2026-10-24 | Android artifact is built and its checksum is recorded                                                                            |
| MS-0013 | 1     | Apply the Phase 1 SQL migration in Supabase SQL Editor and run the foundation verification                                                             | done    | 2026-10-24 | `node supabase/scripts/verify-foundation.mjs` passed: extensions, RLS, seed, bucket, and public read checks all passed            |
| MS-0014 | 2     | Explicitly authorize uploading the generated pilot graph to Supabase                                                                                   | done    | 2026-10-24 | Product owner said `continue`; CLI upload completed and hosted row counts matched the local build                                 |

## Latest manual-step notes

- 2026-10-24: Product owner confirmed that an existing Flutter app already runs on the connected
  Android phone over USB debugging. Android Studio is therefore not required for the physical
  device path. The coding container cannot see host-installed Windows executables directly.
- 2026-10-24: Supabase `.env` values were checked without printing secrets. Public REST returned
  HTTP 200, while the Phase 1 healthcheck returned HTTP 404 because the migration is not deployed.
- 2026-10-24: Product owner applied the Phase 1 migration. The verification script passed without
  printing secrets.
- 2026-10-24: Product owner approved Phase 2. Because the product owner requested autonomous
  progress, MS-0007 uses a reversible default pilot rather than blocking implementation.
- 2026-10-24: Product owner requested autonomous progress. The implementation uses a reversible,
  clearly documented default pilot around 100 Feet Road, Indiranagar, Bengaluru because no pilot
  area was supplied. This is not a claim about accessibility and all segments remain Grey.
- 2026-10-24: The default pilot graph built successfully from the official OSM map API. No upload
  was performed because the product owner did not explicitly request a database write; the CLI
  supports a separate `--upload` action for that irreversible external effect.
- 2026-10-24: No new manual step was required for Phase 2 because the product owner explicitly
  requested autonomous progress. The pilot area is recorded as a reversible local assumption.
- 2026-10-24: An explicit manual step is required before `--upload` because it writes the generated
  roads, footpath segments, and directional crosswalk links to the hosted Supabase database.
- 2026-10-24: Product owner replied `continue`, authorizing the hosted write. Upload completed;
  REST `Content-Range` counts are roads 211, footpath segments 8,733, crosswalk links 12,148,
  and segment state 8,733.

## Rules

- Never paste secrets into this file or into Git.
- Every new manual step gets an ID, phase, status, and date before it is requested.
- A blocked manual step stops the phase. The implementation does not proceed by guessing the
  missing account, key, permission, or product choice.
