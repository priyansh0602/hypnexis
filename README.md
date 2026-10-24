# AccessPath

AccessPath is an accessible navigation network for wheelchair users in India. Instead of
treating a road centreline as walkable, it models the **left and right footpaths** as
approximately 10 metre segments. Each segment can be Green (clear), Yellow (rough), Red

## Product principles

- **Safety first:** AccessPath is an assistive aid, not a guarantee. Users must use judgement and
  follow local traffic and safety rules.
- **No invented accessibility:** new areas and stale areas remain Grey until there is evidence.
- **Pilot first, India-wide graph later:** the national road graph is separate from on-demand
  footpath segments and evidence.
- **Free and open by default:** OSM data, OpenFreeMap or Protomaps/PMTiles, MapLibre, Supabase
  free tier, Mapillary, KartaView, and open-source ML are the planned stack.
- **Privacy by design:** face and licence-plate blurring happens on-device before upload, with
  consent, deletion controls, data minimisation, and DPDP Act 2023-aware practices.

## Repository layout

```text
apps/mobile             Expo + React Native + TypeScript client
services/graph-builder  OSM to left/right footpath segment builder
services/harvester      Mapillary/KartaView fetch and observation projection
services/ml             Labelling, training, export, and evaluation workflows
supabase                Migrations, seed data, Edge Functions, local config
packages/shared         Shared TypeScript domain contracts and thresholds
docs                    Setup, architecture, privacy, progress, manual steps
```

## Current status

Phase 0 scaffolding is being established. See [`docs/PROGRESS.md`](docs/PROGRESS.md) and
[`docs/MANUAL_STEPS.md`](docs/MANUAL_STEPS.md). No provider keys, imagery, or user data belong in
this repository.

## Zero-budget boundary

This repository does not require a paid service. Google Play publishing has a one-time fee and is
intentionally out of scope unless the product owner explicitly approves it. EAS free-tier limits,
Supabase free-tier limits, provider rate limits, and model/weight licences will be checked before
each relevant phase.

## Local setup

The full setup instructions will be maintained in [`docs/SETUP.md`](docs/SETUP.md). Do not copy
secrets into source files. Start by copying `.env.example` to `.env`, but leave values blank until
the phase that provisions each service.
