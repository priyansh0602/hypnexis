# AccessPath architecture

## User-visible outcome

A wheelchair user can see the evidence-backed condition of the left and right footpaths, receive
a route that accounts for wheelchair width and obstacle penalties, and get a last-safe-exit warning
before a known blockage. Unknown areas remain Grey and are explicitly labelled as lacking
accessibility data.

## Planned system boundaries

```text
OSM road data ──> graph-builder ──> Supabase PostGIS road/segment graph
Mapillary/KartaView ──> harvester ──> licensed images + projected observations
phone camera ──> on-device blur + detector ──> offline observation queue
observations ──> SQL fusion/decay jobs ──> computed segment state
segment graph + state ──> mobile map/routing/last-safe-exit guidance
reviewed labels ──> ML training/evaluation ──> versioned model in Storage
```

## Data ownership rules

- `observations` are append-oriented evidence; clients do not write computed segment state.
- `segment_state` is derived by database functions/jobs and includes freshness and confidence.
- `footpath_segments` are created on demand for a pilot area; they do not imply accessibility.
- Permanent barriers need independent evidence before a later clear observation can remove the
  penalty.
- Photos are thumbnails only after on-device privacy filtering and retain required attribution.

## Technology decisions

- Mobile: React Native with TypeScript, Expo development builds, MapLibre.
- Backend: Supabase Postgres/PostGIS, Auth, Storage, Realtime, Edge Functions, and pg_cron.
- Offline/ML: Python, with Colab-compatible notebooks and scripts.
- Map data: OpenStreetMap plus a free tile source such as OpenFreeMap or Protomaps/PMTiles.
- Street-level imagery: Mapillary and KartaView only, with attribution in the app.
- Routing: footpath graph, A*/Dijkstra, width-aware penalties, and a finite penalty for Red so
  the app can still provide a best-effort route when every option is poor.

## Security and privacy boundaries

- Only the Supabase anon key may ship in the mobile app.
- The service-role key is server-side only and is never included in an Expo environment used by the
  app.
- RLS is enabled on every user-facing table.
- Camera frames are processed locally; face and licence-plate blurring occurs before upload.
- Consent, deletion, retention, attribution, and DPDP Act 2023-aware practices are documented in
  [`docs/PRIVACY.md`](PRIVACY.md).
