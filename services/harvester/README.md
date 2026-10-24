# Imagery harvester

Python service for resumable Mapillary/KartaView metadata and thumbnail retrieval, projection to
left/right segments, and explicit observation upload. Raw imagery is kept local for the next
privacy/ML phase; this phase does not upload raw downloaded files to Supabase Storage.

## Licence and API gates

- Mapillary Graph API: direct HTTPS requests, bbox tile queries, cursor pagination, and a required
  access token. Each record keeps creator and source attribution so the mobile app can display it.
- KartaView API v2: direct HTTPS requests to `api.kartaview.org`; its public endpoint uses bounded
  center/radius queries, so the adapter tiles the pilot bbox and filters returned coordinates back to
  the bbox.
- `requests` 2.34.2: Apache-2.0.
- `Shapely` 2.2.0: BSD-3-Clause.
- `pyproj` 3.8.0: MIT.
- `pytest` 9.1.1: MIT.

Provider attribution and licence fields are stored with every image record. Mapillary attribution
must remain visible in the app. KartaView attribution/licence wording is kept conservative until
the release review checks the provider terms for the exact use case.

## Run

Install the isolated service environment:

```powershell
python -m venv services/harvester/.venv
services/harvester/.venv/Scripts/python.exe -m pip install -e "services/harvester[test]"
```

Use the Phase 2 segment preview and harvest Mapillary metadata after `MAPILLARY_ACCESS_TOKEN` is
present in the ignored root `.env`:

```powershell
services/harvester/.venv/Scripts/python.exe -m accesspath_harvester --config services/harvester/config/pilot.json
```

Add `--download` to cache provider thumbnails locally. Add `--upload-observations` only when the
project owner explicitly authorizes a hosted database write. The server-side Supabase key is read
from `.env` and is never placed in a mobile build.

The metadata cache is append-only JSONL and resumes by provider/image ID. Thumbnail downloads use
`.part` files and HTTP Range requests so interrupted runs can continue.
