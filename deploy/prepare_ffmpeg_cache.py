#!/usr/bin/env python3
"""Download the Debian bookworm ffmpeg dependency closure and extract it.

Writes only under /mnt/jfs-ssd/liweiyu/triverse_agent. Does not install
packages into the host OS.
"""
from __future__ import annotations

import gzip
import hashlib
import lzma
import os
import shutil
import subprocess
import sys
import urllib.request
from collections import defaultdict

ROOT = "/mnt/jfs-ssd/liweiyu/triverse_agent"
DEB_DIR = os.path.join(ROOT, "debs")
EXTRACT = os.path.join(ROOT, "ffmpeg-root")
INDEXES = [
    (
        "https://mirrors.tuna.tsinghua.edu.cn/debian/",
        "https://mirrors.tuna.tsinghua.edu.cn/debian/dists/bookworm/main/binary-amd64/Packages.gz",
    ),
]
SEEDS = ["ffmpeg", "ca-certificates"]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "triverse-agent-debcache"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def parse_packages(text: str) -> list[dict[str, str]]:
    pkgs: list[dict[str, str]] = []
    cur: dict[str, str] = {}
    last = None
    for line in text.splitlines():
        if not line:
            if cur.get("Package"):
                pkgs.append(cur)
            cur = {}
            last = None
            continue
        if line.startswith((" ", "\t")):
            if last:
                cur[last] = (cur.get(last, "") + " " + line.strip()).strip()
            continue
        if ":" in line:
            key, val = line.split(":", 1)
            last = key
            cur[key] = val.strip()
    if cur.get("Package"):
        pkgs.append(cur)
    return pkgs


def ver_gt(a: str, b: str) -> bool:
    return subprocess.run(
        ["dpkg", "--compare-versions", a, "gt", b],
        check=False,
    ).returncode == 0


def split_deps(field: str) -> list[list[str]]:
    if not field:
        return []
    parts: list[str] = []
    buf: list[str] = []
    depth = 0
    for ch in field:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        if ch == "," and depth == 0:
            parts.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
    if buf:
        parts.append("".join(buf))
    out: list[list[str]] = []
    for part in parts:
        alts = []
        for alt in part.split("|"):
            token = alt.strip().split()
            if not token:
                continue
            name = token[0].split(":")[0]
            if name and not name.startswith("$"):
                alts.append(name)
        if alts:
            out.append(alts)
    return out


def main() -> int:
    os.makedirs(DEB_DIR, exist_ok=True)
    packages: dict[str, dict[str, str]] = {}
    for base, url in INDEXES:
        print(f"INDEX {url}", flush=True)
        raw = fetch(url)
        if url.endswith(".xz"):
            text = lzma.decompress(raw).decode("utf-8", "replace")
        else:
            text = gzip.decompress(raw).decode("utf-8", "replace")
        for pkg in parse_packages(text):
            arch = pkg.get("Architecture", "")
            if arch not in ("amd64", "all"):
                continue
            name = pkg["Package"]
            pkg["_base"] = base
            old = packages.get(name)
            if old is None or ver_gt(pkg.get("Version", "0"), old.get("Version", "0")):
                packages[name] = pkg
    print(f"INDEXED {len(packages)}", flush=True)

    provides: dict[str, list[str]] = defaultdict(list)
    for name, pkg in packages.items():
        for alts in split_deps(pkg.get("Provides", "")):
            for alt in alts:
                if name not in provides[alt]:
                    provides[alt].append(name)

    def choose(virtual: str) -> str | None:
        cands = [c for c in provides.get(virtual, []) if c in packages]
        if not cands:
            return None
        if virtual in cands:
            return virtual
        plain = [c for c in cands if not c.endswith(("-dev", "-dbg", "-doc"))]
        pool = plain or cands
        return sorted(pool, key=len)[0]

    selected: dict[str, dict[str, str]] = {}
    missing: list[str] = []

    def resolve(name: str, stack: tuple[str, ...]) -> None:
        if name in selected or name in stack:
            return
        real = name if name in packages else choose(name)
        if real is None:
            missing.append(name)
            return
        if real in selected:
            return
        selected[real] = packages[real]
        for group in split_deps(packages[real].get("Depends", "")) + split_deps(
            packages[real].get("Pre-Depends", "")
        ):
            picked = None
            for alt in group:
                if alt in packages or choose(alt):
                    picked = alt
                    break
            if picked is None:
                missing.append("|".join(group) + f" from {real}")
                continue
            resolve(picked, stack + (real,))

    for seed in SEEDS:
        resolve(seed, ())

    print(f"SELECTED {len(selected)} MISSING {len(missing)}", flush=True)
    for item in missing:
        print(f"MISSING {item}", flush=True)
    if missing:
        return 1

    jobs = []
    total = 0
    for name, pkg in sorted(selected.items()):
        sha = pkg.get("SHA256", "")
        filename = pkg["Filename"]
        url = pkg["_base"] + filename
        dest = os.path.join(DEB_DIR, os.path.basename(filename))
        size = int(pkg.get("Size") or 0)
        total += size
        jobs.append((name, url, dest, sha, size))
    print(f"BYTES {total}", flush=True)

    pending = []
    for name, url, dest, sha, size in jobs:
        if os.path.isfile(dest) and sha:
            digest = hashlib.sha256(open(dest, "rb").read()).hexdigest()
            if digest == sha:
                continue
        pending.append((name, url, dest, sha, size))
    print(f"DOWNLOAD {len(pending)}", flush=True)

    if pending:
        list_path = "/tmp/triverse-ffmpeg-urls.txt"
        with open(list_path, "w", encoding="utf-8") as fh:
            for _name, url, dest, _sha, _size in pending:
                fh.write(f"{url}\n")
                fh.write(f"  dir={DEB_DIR}\n")
                fh.write(f"  output={os.path.basename(dest)}\n")
        # curl config wants one url block. Write a simpler xargs list instead.
        with open("/tmp/triverse-ffmpeg-urls.list", "w", encoding="utf-8") as fh:
            for _name, url, dest, _sha, _size in pending:
                fh.write(url + "\n")
        subprocess.run(
            [
                "xargs",
                "-n",
                "1",
                "-P",
                "12",
                "curl",
                "-fsSL",
                "--retry",
                "3",
                "--retry-delay",
                "1",
                "-O",
                "--output-dir",
                DEB_DIR,
            ],
            stdin=open("/tmp/triverse-ffmpeg-urls.list", "rb"),
            check=True,
        )

    bad = []
    for name, url, dest, sha, size in jobs:
        if not os.path.isfile(dest):
            bad.append(f"absent {name}")
            continue
        if sha:
            digest = hashlib.sha256(open(dest, "rb").read()).hexdigest()
            if digest != sha:
                bad.append(f"sha {name}")
    if bad:
        print("VERIFY_FAIL", *bad, sep="\n")
        return 1
    print("VERIFY_OK", flush=True)

    if os.path.isdir(EXTRACT):
        shutil.rmtree(EXTRACT)
    os.makedirs(EXTRACT)
    for name, _url, dest, _sha, _size in jobs:
        subprocess.run(["dpkg-deb", "-x", dest, EXTRACT], check=True)
    ffprobe = os.path.join(EXTRACT, "usr/bin/ffprobe")
    ffmpeg = os.path.join(EXTRACT, "usr/bin/ffmpeg")
    print("FFPROBE_BIN", os.path.isfile(ffprobe), os.path.isfile(ffmpeg), flush=True)
    if not (os.path.isfile(ffprobe) and os.path.isfile(ffmpeg)):
        return 1
    os.chmod(ffprobe, 0o755)
    os.chmod(ffmpeg, 0o755)
    lib = os.path.join(EXTRACT, "usr/lib/x86_64-linux-gnu")
    linked = 0
    for dirpath, _, filenames in os.walk(lib):
        if os.path.abspath(dirpath) == os.path.abspath(lib):
            continue
        for fname in filenames:
            if ".so" not in fname:
                continue
            dest = os.path.join(lib, fname)
            if os.path.lexists(dest):
                continue
            src = os.path.join(dirpath, fname)
            os.symlink(os.path.relpath(src, lib), dest)
            linked += 1
    print(f"SYMLINKS {linked}", flush=True)
    # Debian puts libc and some codec deps in /lib, not /usr/lib. Expose the
    # non-glibc libraries next to the others. Leave libc on the container image
    # so ffprobe does not mix an extracted libc with the image dynamic linker.
    glibc_names = {
        "ld-linux-x86-64.so.2",
        "libc.so.6",
        "libm.so.6",
        "libdl.so.2",
        "libpthread.so.0",
        "librt.so.1",
        "libresolv.so.2",
        "libutil.so.1",
        "libanl.so.1",
        "libBrokenLocale.so.1",
        "libc_malloc_debug.so.0",
        "libmemusage.so",
        "libmvec.so.1",
        "libnsl.so.1",
        "libnss_compat.so.2",
        "libnss_dns.so.2",
        "libnss_files.so.2",
        "libnss_hesiod.so.2",
        "libpcprofile.so",
        "libpsx.so.2",
        "libthread_db.so.1",
    }
    promoted = 0
    lib_multi = os.path.join(EXTRACT, "lib/x86_64-linux-gnu")
    if os.path.isdir(lib_multi):
        for fname in os.listdir(lib_multi):
            if fname in glibc_names or ".so" not in fname:
                continue
            dest = os.path.join(lib, fname)
            if os.path.lexists(dest):
                continue
            src = os.path.join(lib_multi, fname)
            os.symlink(os.path.relpath(src, lib), dest)
            promoted += 1
    print(f"PROMOTED {promoted}", flush=True)
    bindir = os.path.join(EXTRACT, "bin")
    os.makedirs(bindir, exist_ok=True)
    for tool in ("ffprobe", "ffmpeg"):
        wrap = os.path.join(bindir, tool)
        with open(wrap, "w", encoding="utf-8") as fh:
            fh.write(
                "#!/bin/sh\n"
                'root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)\n'
                'export LD_LIBRARY_PATH="$root/usr/lib/x86_64-linux-gnu:'
                '$root/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"\n'
                f'exec "$root/usr/bin/{tool}" "$@"\n'
            )
        os.chmod(wrap, 0o755)
    env = os.environ.copy()
    env.pop("LD_LIBRARY_PATH", None)
    env["PATH"] = bindir + os.pathsep + env.get("PATH", "")
    proc = subprocess.run(
        ["ffprobe", "-version"],
        env=env,
        check=False,
        text=True,
        capture_output=True,
    )
    print(proc.stdout.splitlines()[0] if proc.stdout else proc.stderr, flush=True)
    ldd_env = os.environ.copy()
    ldd_env["LD_LIBRARY_PATH"] = lib + ":" + os.path.join(EXTRACT, "usr/lib")
    ldd = subprocess.run(["ldd", ffprobe], env=ldd_env, check=False, text=True, capture_output=True)
    missing_so = [line.strip() for line in ldd.stdout.splitlines() if "not found" in line]
    print("LDD_MISSING", len(missing_so), flush=True)
    for line in missing_so:
        print("SO", line, flush=True)
    if proc.returncode != 0 or missing_so:
        return 1
    print("FFMPEG_READY", EXTRACT, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
