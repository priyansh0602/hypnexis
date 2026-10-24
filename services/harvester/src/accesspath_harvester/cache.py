"""Resumable metadata and image cache."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

import requests

from .models import ImageRecord


class JsonlCache:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def existing_ids(self) -> set[str]:
        if not self.path.exists():
            return set()
        ids: set[str] = set()
        with self.path.open('r', encoding='utf-8') as handle:
            for line in handle:
                if not line.strip():
                    continue
                try:
                    ids.add(str(json.loads(line)['provider_image_key']))
                except (KeyError, json.JSONDecodeError):
                    continue
        return ids

    def append(self, image: ImageRecord, provider_image_key: str, extra: dict[str, Any] | None = None) -> None:
        record = {
            'provider_image_key': provider_image_key,
            'image': image.to_json(),
            **(extra or {}),
        }
        with self.path.open('a', encoding='utf-8') as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + '\n')

    def read(self) -> Iterable[dict[str, Any]]:
        if not self.path.exists():
            return []
        rows: list[dict[str, Any]] = []
        with self.path.open('r', encoding='utf-8') as handle:
            for line in handle:
                if line.strip():
                    rows.append(json.loads(line))
        return rows


def download_resumable(url: str, destination: Path, session: requests.Session | None = None) -> bool:
    """Download a file with `.part` resume semantics; return True on completion."""

    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + '.part')
    existing_size = partial.stat().st_size if partial.exists() else 0
    client = session or requests.Session()
    headers = {'Range': f'bytes={existing_size}-'} if existing_size else {}
    response = client.get(url, headers=headers, stream=True, timeout=60)
    if response.status_code == 416 and destination.exists():
        return True
    response.raise_for_status()

    append = existing_size > 0 and response.status_code == 206
    if not append:
        existing_size = 0
    mode = 'ab' if append else 'wb'
    with partial.open(mode) as handle:
        for chunk in response.iter_content(chunk_size=1024 * 128):
            if chunk:
                handle.write(chunk)
    partial.replace(destination)
    return True
