"""Server-side Supabase observation upload for explicit CLI use."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from collections.abc import Iterable
from typing import Any

from .models import ProjectedObservation


class SupabaseUploadError(RuntimeError):
    """Raised when an observation upload fails."""


def _env_value(*names: str) -> str:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    raise SupabaseUploadError(f'missing required environment variable: {" or ".join(names)}')


def upload_observations(observations: Iterable[ProjectedObservation]) -> int:
    rows = [observation.to_supabase_row() for observation in observations]
    if not rows:
        return 0
    base_url = _env_value('SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL').rstrip('/')
    key = _env_value('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY')
    request = urllib.request.Request(
        f'{base_url}/rest/v1/observations',
        data=json.dumps(rows).encode('utf-8'),
        method='POST',
        headers={
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            if response.status not in (200, 201, 204):
                raise SupabaseUploadError(f'observations returned HTTP {response.status}')
    except urllib.error.HTTPError as error:
        detail = error.read().decode('utf-8', errors='replace')[:500]
        raise SupabaseUploadError(f'observations returned HTTP {error.code}: {detail}') from error
    return len(rows)
