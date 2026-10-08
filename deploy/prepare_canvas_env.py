#!/usr/bin/env python3
"""Stage portable Blender 4.2 and PATH wrappers under canvas-env/.

Run on master01. Writes only inside the project directory. Does not apt-install,
does not use sudo, and does not edit containerd.

The official tarball still needs a few Debian shared libraries (X11,
libstdc++, and libegl1). Those are extracted into canvas-env/extra-lib. Only
the blender wrapper puts that directory on LD_LIBRARY_PATH. It does not force
a software rasterizer.
"""

from __future__ import annotations

import argparse
import gzip
import os
import stat
import subprocess
import urllib.request
from pathlib import Path

BLENDER_VERSION = "4.2.16"
TARBALL_NAME = f"blender-{BLENDER_VERSION}-linux-x64.tar.xz"
BLENDER_URL = f"https://mirrors.tuna.tsinghua.edu.cn/blender/release/Blender4.2/{TARBALL_NAME}"
TARBALL_BYTES = 350677256
DEBIAN_MIRROR = "https://mirrors.tuna.tsinghua.edu.cn/debian"
PACKAGES_URL = f"{DEBIAN_MIRROR}/dists/bookworm/main/binary-amd64/Packages.gz"
LIBRARY_SEEDS = (
    "libxrender1",
    "libxfixes3",
    "libxi6",
    "libsm6",
    "libice6",
    "libx11-6",
    "libxxf86vm1",
    "libxkbcommon0",
    "libstdc++6",
    "zlib1g",
    "libxext6",
    "libxcb1",
    "libxau6",
    "libxdmcp6",
    "libbsd0",
    "libmd0",
    "libuuid1",
    "libgcc-s1",
    "libdrm2",
    "libzstd1",
    "libegl1",
)
DEFAULT_ROOT = Path("/mnt/jfs-ssd/liweiyu/triverse_agent")


def _download(url: str, destination: Path) -> None:
    temporary = destination.with_suffix(destination.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": "triverse-agent-canvas-env"})
    with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as handle:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)
    os.replace(temporary, destination)


def _parse_packages(text: str) -> dict[str, dict[str, str]]:
    found: dict[str, dict[str, str]] = {}
    current: dict[str, str] = {}
    last = ""
    for line in text.splitlines():
        if not line:
            name = current.get("Package")
            if name and name not in found:
                found[name] = current
            current = {}
            last = ""
            continue
        if line.startswith((" ", "\t")) and last:
            current[last] = (current.get(last, "") + " " + line.strip()).strip()
            continue
        if ":" in line:
            key, value = line.split(":", 1)
            last = key
            current[key] = value.strip()
    name = current.get("Package")
    if name and name not in found:
        found[name] = current
    return found


def _dep_names(field: str) -> list[str]:
    names = []
    for part in field.split(","):
        item = part.strip().split("|")[0].strip()
        if not item:
            continue
        name = item.split()[0]
        if name.startswith("$") or name in {"libc6"}:
            continue
        names.append(name)
    return names


def _stage_libraries(env: Path) -> None:
    extra = env / "extra-lib"
    extra.mkdir(parents=True, exist_ok=True)
    needed = (
        extra / "libXrender.so.1",
        extra / "libstdc++.so.6",
        extra / "libdrm.so.2",
        extra / "libzstd.so.1",
        extra / "libEGL.so.1",
        extra / "libEGL_mesa.so.0",
        extra / "egl_vendor.d" / "50_mesa.json",
    )
    if all(path.exists() for path in needed):
        return
    index = env / "src" / "Packages.gz"
    if not index.is_file():
        print(f"download {PACKAGES_URL}")
        _download(PACKAGES_URL, index)
    packages = _parse_packages(gzip.decompress(index.read_bytes()).decode("utf-8", errors="replace"))
    selected: dict[str, dict[str, str]] = {}
    queue = list(LIBRARY_SEEDS)
    while queue:
        name = queue.pop()
        if name in selected:
            continue
        record = packages.get(name)
        if record is None:
            raise SystemExit(f"debian package not found: {name}")
        selected[name] = record
        queue.extend(_dep_names(record.get("Depends", "")))
    debs = env / "src" / "debs"
    debs.mkdir(parents=True, exist_ok=True)
    staging = env / "src" / "lib-root"
    staging.mkdir(parents=True, exist_ok=True)
    for name, record in sorted(selected.items()):
        filename = record["Filename"]
        destination = debs / Path(filename).name
        if not destination.is_file() or destination.stat().st_size == 0:
            print(f"download {name}")
            _download(f"{DEBIAN_MIRROR}/{filename}", destination)
        subprocess.run(["dpkg-deb", "-x", str(destination), str(staging)], check=True)
    for folder in (staging / "usr/lib/x86_64-linux-gnu", staging / "lib/x86_64-linux-gnu"):
        if not folder.is_dir():
            continue
        for path in folder.iterdir():
            if path.is_file() or path.is_symlink():
                target = extra / path.name
                if path.is_symlink():
                    if target.exists() or target.is_symlink():
                        target.unlink()
                    target.symlink_to(path.readlink())
                else:
                    os.replace(path, target)
    vendor_source = staging / "usr/share/glvnd/egl_vendor.d"
    if vendor_source.is_dir():
        vendor = extra / "egl_vendor.d"
        vendor.mkdir(parents=True, exist_ok=True)
        for path in vendor_source.iterdir():
            if path.is_file():
                os.replace(path, vendor / path.name)


def _write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def prepare(root: Path) -> None:
    env = root / "canvas-env"
    source = env / "src"
    source.mkdir(parents=True, exist_ok=True)
    tarball = source / TARBALL_NAME
    if not tarball.is_file() or tarball.stat().st_size != TARBALL_BYTES:
        print(f"download {BLENDER_URL}")
        _download(BLENDER_URL, tarball)
    if tarball.stat().st_size != TARBALL_BYTES:
        raise SystemExit(f"unexpected tarball size {tarball.stat().st_size}")
    blender = env / f"blender-{BLENDER_VERSION}-linux-x64" / "blender"
    if not blender.is_file():
        print(f"extract {tarball.name}")
        subprocess.run(["tar", "-xJf", str(tarball), "-C", str(env)], check=True)
    if not blender.is_file():
        raise SystemExit(f"missing {blender}")
    _stage_libraries(env)
    bindir = env / "bin"
    bindir.mkdir(parents=True, exist_ok=True)
    _write(
        bindir / "blender",
        """#!/bin/sh
here=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
root=$(CDPATH= cd -- "$here/.." && pwd)
dist="$root/blender-4.2.16-linux-x64"
export LD_LIBRARY_PATH="$dist/lib:$dist/lib/mesa:$root/extra-lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
# libegl1's dispatcher reads this vendor list. The container has no /usr/share/glvnd.
export __EGL_VENDOR_LIBRARY_FILENAMES="$root/extra-lib/egl_vendor.d/50_mesa.json"
exec "$dist/blender" "$@"
""",
    )
    _write(
        bindir / "ffmpeg",
        """#!/bin/sh
exec /opt/ffmpeg/bin/ffmpeg "$@"
""",
    )
    _write(
        bindir / "ffprobe",
        """#!/bin/sh
exec /opt/ffmpeg/bin/ffprobe "$@"
""",
    )
    subprocess.run(
        ["chmod", "-R", "a+rX", str(env / f"blender-{BLENDER_VERSION}-linux-x64"), str(env / "extra-lib"), str(bindir)],
        check=True,
    )
    print(f"ready {blender}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare the Canvas Blender tree.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT), help="project root, not a node path")
    args = parser.parse_args()
    prepare(Path(args.root))


if __name__ == "__main__":
    main()
