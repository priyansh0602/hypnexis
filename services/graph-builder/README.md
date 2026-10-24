# Graph builder

Python service for downloading OSM road data for a configured pilot area, generating left/right
footpath segments, creating inferred crosswalk links, and uploading idempotently to Supabase.

## Phase 2 pilot

The initial pilot is a compact area around 100 Feet Road in Indiranagar, Bengaluru, Karnataka:

```text
12.9714, 77.6330, 12.9800, 77.6425
```

This is an engineering assumption for the first build, not a claim that the area is accessible.
Every generated footpath segment starts Grey/unverified.

## Licence gate

- OSMnx `2.1.1`: MIT licence.
- Shapely `2.2.0`: BSD-3-Clause licence.
- OpenStreetMap data: ODbL; attribution is carried in the preview and upload metadata.
- No Google imagery or Google Maps data is used.

These versions were checked against their current project/PyPI metadata before installation.

## Build locally

From the repository root, create an isolated environment and install this service:

```powershell
python -m venv services/graph-builder/.venv
services/graph-builder/.venv/Scripts/python.exe -m pip install -e "services/graph-builder[test]"
```

Build the configured pilot graph and write a local preview without uploading:

```powershell
services/graph-builder/.venv/Scripts/python.exe -m accesspath_graph_builder --config services/graph-builder/config/pilot.json
```

Outputs are written under `services/graph-builder/output/`:

- `preview.geojson` — roads, left/right segments, and inferred links for QGIS or geojson.io.
- `stats.json` — counts, total lengths, and the projected CRS used for metric operations.

The default local run produced 211 roads, 8,733 left/right segments, and 6,074 inferred links.
Those figures are a build result, not an accessibility assessment.

The OSMnx cache is local and ignored. A later explicit `--upload` run uses only the server-side
Supabase service key from `.env`; it never sends a public mobile key.
