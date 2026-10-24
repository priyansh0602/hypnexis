# AccessPath setup

This document will grow phase by phase. The current workspace has been scaffolded but no provider
accounts or secrets have been configured.

## Prerequisites checked on 2026-10-24

- Git 2.39.5: available.
- Node v22.23.3: available.
- npm 10.9.9: available.
- Python 3.11.2: available.
- pnpm 11.24.0 through Corepack: available when Corepack latest-version lookup is disabled.
- Android `adb`/SDK tools: not available as direct commands at the time of inspection. Android
  Studio is optional; standalone Android SDK Platform-Tools are sufficient for a connected phone.
- Expo CLI/EAS CLI: not available as direct commands at the time of inspection.

The exact Expo, React Native, Supabase, MapLibre, Python, and ML package versions will be checked
against current official documentation before installation. No dependency installation is claimed
by this Phase 0 document.

## Repository basics

1. Copy `.env.example` to `.env`.
2. Keep `.env` local; it is ignored by Git.
3. Use the phase-specific manual instructions in `docs/MANUAL_STEPS.md`.
4. Run checks from the repository root only after dependencies for the relevant phase are installed.

## Secret placement

- Mobile: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` only.
- Server/Edge Functions/harvester: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and provider
  credentials in local or hosted secret stores only.
- Never put `SUPABASE_SERVICE_ROLE_KEY` in `apps/mobile`, an Expo public variable, screenshots,
  issues, or committed documentation.

## Phase 1 Supabase verification

After creating the Supabase project, enabling PostGIS and pg_cron, and applying the migration:

1. Open **Database → Tables** in the Supabase dashboard.
2. Confirm these tables exist: `roads`, `footpath_segments`, `crosswalk_links`, `obstacle_types`,
   `observations`, `segment_state`, `profiles`, `unknown_obstacle_queue`, and `model_versions`.
3. Open **Storage** and confirm the private `thumbnails` bucket exists.
4. Run `node supabase/scripts/verify-foundation.mjs` from the repository root.
5. Confirm it reports PostGIS, pg_cron, RLS, the nine obstacle codes, the private thumbnail bucket,
   and public segment-state read access as passing.

The verification command reads `.env` locally and never prints key values. It must not be run with
secrets pasted into the command line.
