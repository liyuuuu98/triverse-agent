"""Download the OpenHands Agent Canvas image from the NJU mirror into an OCI archive.

master03's containerd reaches ghcr.io slowly. This uses the mirror over
plain HTTPS and does not change containerd configuration. Import with:

  sudo ctr -n k8s.io images import --base-name ghcr.nju.edu.cn/openhands/agent-canvas canvas.oci.tar
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

MIRROR = "https://ghcr.nju.edu.cn"
REPO = "openhands/agent-canvas"
TAG = "1.25.0"
ROOT = Path("/mnt/jfs-ssd/liweiyu/triverse_agent/openhands-image")
REF_ANNOTATION = "org.opencontainers.image.ref.name"


def request(url: str, accept: str) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers={"Accept": accept})
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read(), response.headers.get("content-type", "")


def blob_path(digest: str) -> Path:
    hexdigest = digest.split(":", 1)[1]
    return ROOT / "blobs" / "sha256" / hexdigest


def download_blob(digest: str) -> int:
    path = blob_path(digest)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file() and path.stat().st_size > 0:
        return path.stat().st_size
    url = f"{MIRROR}/v2/{REPO}/blobs/{digest}"
    tmp = path.with_suffix(".partial")
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=120) as response, tmp.open("wb") as handle:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)
    tmp.replace(path)
    return path.stat().st_size


def main() -> None:
    index_bytes, _ = request(
        f"{MIRROR}/v2/{REPO}/manifests/{TAG}",
        "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json",
    )
    index = json.loads(index_bytes)
    chosen = None
    for item in index.get("manifests", []):
        platform = item.get("platform") or {}
        if platform.get("os") == "linux" and platform.get("architecture") == "amd64":
            chosen = item
            break
    if chosen is None:
        raise SystemExit("amd64 manifest not found")
    manifest_bytes, _ = request(
        f"{MIRROR}/v2/{REPO}/manifests/{chosen['digest']}",
        chosen.get("mediaType", "application/vnd.oci.image.manifest.v1+json"),
    )
    manifest = json.loads(manifest_bytes)
    blob_path(chosen["digest"]).parent.mkdir(parents=True, exist_ok=True)
    blob_path(chosen["digest"]).write_bytes(manifest_bytes)
    digests = [manifest["config"]["digest"]]
    digests.extend(layer["digest"] for layer in manifest["layers"])
    total = 0
    for digest in digests:
        size = download_blob(digest)
        total += size
        print(f"{digest} {size}", flush=True)
    descriptor = dict(chosen)
    annotations = dict(descriptor.get("annotations") or {})
    annotations[REF_ANNOTATION] = TAG
    descriptor["annotations"] = annotations
    descriptor["size"] = len(manifest_bytes)
    layout = {
        "schemaVersion": 2,
        "mediaType": "application/vnd.oci.image.index.v1+json",
        "manifests": [descriptor],
    }
    (ROOT / "oci-layout").write_text('{"imageLayoutVersion":"1.0.0"}\n', encoding="utf-8")
    (ROOT / "index.json").write_text(json.dumps(layout), encoding="utf-8")
    print(f"ready {ROOT} bytes {total}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
