# Supabase project files

Phase 1 contains the Postgres/PostGIS foundation migration, obstacle taxonomy seed, private
thumbnail bucket policies, and a no-dependency verification script.

## Files

- `migrations/202610240001_phase1_foundation.sql` — tables, extensions, triggers, RLS, storage,
  and the initial Grey segment-state trigger.
- `seed.sql` — repeatable obstacle taxonomy seed for local development.
- `scripts/verify-foundation.mjs` — checks the deployed project without printing secrets.

## Verification

After the migration is applied and `.env` contains the project URL plus a server-side key, run from
the repository root:

```text
node supabase/scripts/verify-foundation.mjs
```

The service-role/secret key must remain server-side and must never be bundled into the mobile app.
