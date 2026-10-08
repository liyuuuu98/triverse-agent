"""Local workspace helpers. These do not call Triverse and do not spend credits."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import zipfile
from pathlib import Path

_NOTE_LIMIT = 200_000


def safe_workspace_file(workspace: Path, relative: str) -> Path:
    """Resolve a workspace-relative path and reject anything that escapes it."""

    if not isinstance(relative, str) or not relative or "\x00" in relative:
        raise ValueError("path escapes workspace")
    raw = relative.replace("\\", "/")
    if raw.startswith(("/", "~")):
        raise ValueError("path escapes workspace")
    parts = [part for part in raw.split("/") if part not in {"", "."}]
    if not parts or any(part == ".." for part in parts):
        raise ValueError("path escapes workspace")
    root = workspace.resolve()
    resolved = root.joinpath(*parts).resolve()
    if resolved != root and root not in resolved.parents:
        raise ValueError("path escapes workspace")
    return resolved


def list_files(workspace: Path) -> list[dict]:
    rows = []
    if not workspace.exists():
        return rows
    root = workspace.resolve()
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        try:
            resolved = path.resolve()
        except OSError:
            continue
        if resolved != root and root not in resolved.parents:
            continue
        relative = path.relative_to(root)
        if any(part.startswith(".") for part in relative.parts):
            continue
        rows.append({"path": relative.as_posix(), "size": resolved.stat().st_size})
    return rows


def write_note(workspace: Path, name: str, text: str) -> str:
    if not isinstance(name, str) or not name.strip():
        raise ValueError("invalid note name")
    if not isinstance(text, str):
        raise ValueError("笔记正文必须是字符串")
    if len(text) > _NOTE_LIMIT:
        raise ValueError("笔记过长")
    base = name.strip()
    if "/" in base or "\\" in base or ".." in base or "\x00" in base:
        raise ValueError("invalid note name")
    safe_name = Path(base).name
    if not safe_name or safe_name in {".", ".."}:
        raise ValueError("invalid note name")
    if not safe_name.startswith("triverse-"):
        safe_name = "triverse-" + safe_name
    if not safe_name.endswith(".md"):
        safe_name += ".md"
    target = safe_workspace_file(workspace, safe_name)
    target.write_text(text, encoding="utf-8")
    return safe_name


def mesh_info(workspace: Path, relative: str) -> dict:
    import trimesh

    target = safe_workspace_file(workspace, relative)
    if not target.is_file():
        raise FileNotFoundError(relative)
    loaded = trimesh.load(target, force="mesh")
    mesh = loaded.dump(concatenate=True) if isinstance(loaded, trimesh.Scene) else loaded
    return {
        "path": relative,
        "vertices": int(len(mesh.vertices)),
        "faces": int(len(mesh.faces)),
        "closed": bool(mesh.is_watertight),
        "bounds": mesh.bounds.tolist(),
        "note": "closed 只是本地网格是否闭合，不是水密修复。水密修复尚未具备。",
    }


def export_stl(workspace: Path, relative: str) -> str:
    import trimesh

    target = safe_workspace_file(workspace, relative)
    loaded = trimesh.load(target, force="mesh")
    mesh = loaded.dump(concatenate=True) if isinstance(loaded, trimesh.Scene) else loaded
    stem = Path(relative).stem
    out_name = f"triverse-{stem}.stl"
    out = safe_workspace_file(workspace, out_name)
    mesh.export(out)
    return out_name


def media_probe(workspace: Path, relative: str) -> dict:
    target = safe_workspace_file(workspace, relative)
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return {"available": False, "reason": "ffprobe is not installed"}
    if not target.is_file():
        raise FileNotFoundError(relative)
    completed = subprocess.run(
        [ffprobe, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(target)],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if completed.returncode != 0:
        return {"available": True, "error": completed.stderr[-500:]}
    return {"available": True, "probe": json.loads(completed.stdout or "{}")}


def run_blender(workspace: Path, script_relative: str, blender_bin: str) -> dict:
    if not blender_bin:
        return {
            "ran": False,
            "installed": False,
            "reason": "BLENDER_BIN 未设置，Blender 未安装，这一步只能在本地完成。",
        }
    script = safe_workspace_file(workspace, script_relative)
    if script.suffix.lower() != ".py":
        raise ValueError("blender script must be a .py file inside the workspace")
    if not script.is_file():
        raise FileNotFoundError(script_relative)
    completed = subprocess.run(
        [blender_bin, "--background", "--python", str(script)],
        cwd=workspace.resolve(),
        check=False,
        capture_output=True,
        text=True,
        timeout=300,
    )
    return {
        "ran": True,
        "code": completed.returncode,
        "stdout": completed.stdout[-2000:],
        "stderr": completed.stderr[-2000:],
    }


def publish_output(path: Path) -> None:
    """Let the Canvas user read and replace a file written by the tool process."""

    try:
        os.chmod(path, 0o664)
        os.chown(path, 10001, 10001)
    except OSError:
        return


def _load_mesh(workspace: Path, relative: str):
    import trimesh

    target = safe_workspace_file(workspace, relative)
    if not target.is_file():
        raise FileNotFoundError(relative)
    loaded = trimesh.load(target, force="mesh")
    mesh = loaded.dump(concatenate=True) if isinstance(loaded, trimesh.Scene) else loaded
    if len(mesh.faces) == 0 or len(mesh.vertices) == 0:
        raise ValueError("mesh is empty")
    return mesh


def _output_path(workspace: Path, relative: str | None, default_name: str) -> Path:
    name = default_name if not relative else relative
    path = safe_workspace_file(workspace, name)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _export_mesh(mesh, path: Path) -> None:
    suffix = path.suffix.lower()
    if suffix == ".3mf":
        _write_3mf(mesh, path)
    else:
        mesh.export(path)
    publish_output(path)


def _write_3mf(mesh, path: Path) -> None:
    vertices = []
    for x, y, z in mesh.vertices:
        vertices.append(f'<vertex x="{float(x):.6f}" y="{float(y):.6f}" z="{float(z):.6f}"/>')
    triangles = []
    for a, b, c in mesh.faces:
        triangles.append(f'<triangle v1="{int(a)}" v2="{int(b)}" v3="{int(c)}"/>')
    model = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<model unit="millimeter" xml:lang="en-US" '
        'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
        "<metadata name=\"Application\">Triverse Agent</metadata>"
        "<resources><object id=\"1\" type=\"model\"><mesh><vertices>"
        + "".join(vertices)
        + "</vertices><triangles>"
        + "".join(triangles)
        + "</triangles></mesh></object></resources><build><item objectid=\"1\"/></build></model>"
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Target="/3D/3dmodel.model" Id="rel0" '
        'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
        "</Relationships>"
    )
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", rels)
        archive.writestr("3D/3dmodel.model", model)
    publish_output(path)


def export_3mf(workspace: Path, relative: str, output: str | None = None) -> str:
    mesh = _load_mesh(workspace, relative)
    stem = Path(relative).stem
    path = _output_path(workspace, output, f"triverse-{stem}.3mf")
    if path.suffix.lower() != ".3mf":
        raise ValueError("output must end with .3mf")
    _write_3mf(mesh, path)
    return path.relative_to(workspace.resolve()).as_posix()


def _boundary_vertices(faces) -> set[int]:
    counts: dict[tuple[int, int], int] = {}
    for tri in faces:
        a, b, c = (int(x) for x in tri)
        for edge in ((a, b), (b, c), (c, a)):
            key = edge if edge[0] < edge[1] else (edge[1], edge[0])
            counts[key] = counts.get(key, 0) + 1
    locked: set[int] = set()
    for (a, b), count in counts.items():
        if count == 1:
            locked.add(a)
            locked.add(b)
    return locked


def _neighbors(faces, count: int) -> list[set[int]]:
    neighbors = [set() for _ in range(count)]
    for tri in faces:
        a, b, c = (int(x) for x in tri)
        neighbors[a].update((b, c))
        neighbors[b].update((a, c))
        neighbors[c].update((a, b))
    return neighbors


def taubin_smooth(
    workspace: Path,
    relative: str,
    *,
    iterations: int = 8,
    lamb: float = 0.5,
    mu: float = -0.53,
    lock_boundary: bool = True,
    output: str | None = None,
) -> dict:
    """λ/μ Laplacian smooth. This does not repair holes or make a mesh watertight."""

    import numpy as np

    steps = int(iterations)
    if steps < 1 or steps > 50:
        raise ValueError("iterations must be 1 to 50")
    lam = float(lamb)
    shrink = float(mu)
    if not 0 < lam <= 1 or not -1 <= shrink < 0:
        raise ValueError("lamb must be in (0, 1] and mu in [-1, 0)")
    mesh = _load_mesh(workspace, relative)
    vertices = np.asarray(mesh.vertices, dtype=float).copy()
    faces = np.asarray(mesh.faces)
    neighbors = _neighbors(faces, len(vertices))
    locked = _boundary_vertices(faces) if lock_boundary else set()
    free = [index for index in range(len(vertices)) if index not in locked and neighbors[index]]
    for _ in range(steps):
        for factor in (lam, shrink):
            updated = vertices.copy()
            for index in free:
                mean = vertices[list(neighbors[index])].mean(axis=0)
                updated[index] = vertices[index] + factor * (mean - vertices[index])
            vertices = updated
    mesh.vertices = vertices
    stem = Path(relative).stem
    path = _output_path(workspace, output, f"triverse-smooth-{stem}.glb")
    _export_mesh(mesh, path)
    return {
        "path": path.relative_to(workspace.resolve()).as_posix(),
        "vertices": int(len(mesh.vertices)),
        "faces": int(len(mesh.faces)),
        "locked_boundary_vertices": len(locked),
        "note": "Taubin 光顺不补洞，也不是水密修复。",
    }


def mesh_audit(workspace: Path, relative: str) -> dict:
    import numpy as np

    mesh = _load_mesh(workspace, relative)
    faces = np.asarray(mesh.faces)
    counts: dict[tuple[int, int], int] = {}
    for tri in faces:
        a, b, c = (int(x) for x in tri)
        for edge in ((a, b), (b, c), (c, a)):
            key = edge if edge[0] < edge[1] else (edge[1], edge[0])
            counts[key] = counts.get(key, 0) + 1
    parent = list(range(len(mesh.vertices)))

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for tri in faces:
        a, b, c = (int(x) for x in tri)
        ra, rb, rc = find(a), find(b), find(c)
        parent[rb] = ra
        parent[rc] = ra
    components = len({find(int(index)) for index in faces.reshape(-1)})
    areas = getattr(mesh, "area_faces", None)
    degenerate = int(np.sum(np.asarray(areas) <= 1e-12)) if areas is not None else 0
    closed = bool(mesh.is_watertight)
    volume = None
    if closed:
        try:
            volume = float(mesh.volume)
        except Exception:
            volume = None
    return {
        "path": relative,
        "vertices": int(len(mesh.vertices)),
        "faces": int(len(faces)),
        "closed": closed,
        "boundary_edges": int(sum(1 for count in counts.values() if count == 1)),
        "non_manifold_edges": int(sum(1 for count in counts.values() if count > 2)),
        "degenerate_faces": degenerate,
        "components": int(components),
        "surface_area": float(mesh.area),
        "volume": volume,
        "bounds": mesh.bounds.tolist(),
        "note": "这是诊断。不修改网格，不修成水密。",
    }


def scale_model(
    workspace: Path,
    relative: str,
    *,
    size_mm: float,
    axis: str = "z",
    output: str | None = None,
) -> dict:
    target = float(size_mm)
    if target <= 0 or target > 100_000:
        raise ValueError("size_mm must be between 0 and 100000")
    chosen = {"x": 0, "y": 1, "z": 2}.get(str(axis).lower())
    if chosen is None:
        raise ValueError("axis must be x, y, or z")
    mesh = _load_mesh(workspace, relative)
    current = float(mesh.extents[chosen])
    if current <= 1e-9:
        raise ValueError("mesh extent on that axis is zero")
    mesh.apply_scale(target / current)
    stem = Path(relative).stem
    path = _output_path(workspace, output, f"triverse-scaled-{stem}.glb")
    _export_mesh(mesh, path)
    return {
        "path": path.relative_to(workspace.resolve()).as_posix(),
        "scale": target / current,
        "extents_mm": [float(v) for v in mesh.extents],
        "note": "按所选轴的当前尺寸等比缩放。数值按毫米写入，不检查实物单位。",
    }


def _solid_heightfield(heights, width_mm: float, depth_mm: float, amplitude_mm: float, base_mm: float):
    import numpy as np
    import trimesh

    grid = np.asarray(heights, dtype=float)
    if grid.ndim != 2 or grid.shape[0] < 2 or grid.shape[1] < 2:
        raise ValueError("heights must be a 2d grid of at least 2x2")
    if not np.isfinite(grid).all():
        raise ValueError("heights must be finite")
    rows, cols = grid.shape
    if rows > 256 or cols > 256:
        raise ValueError("heights grid is limited to 256 by 256")
    width = float(width_mm)
    depth = float(depth_mm)
    amplitude = float(amplitude_mm)
    base = float(base_mm)
    if width <= 0 or depth <= 0 or amplitude < 0 or base < 0:
        raise ValueError("width_mm and depth_mm must be positive")
    xs = np.linspace(0, width, cols)
    ys = np.linspace(0, depth, rows)
    top = np.zeros((rows * cols, 3), dtype=float)
    for i in range(rows):
        for j in range(cols):
            top[i * cols + j] = (xs[j], ys[i], float(grid[i, j]) * amplitude)
    if base == 0:
        faces = []
        for i in range(rows - 1):
            for j in range(cols - 1):
                a = i * cols + j
                b = a + 1
                c = a + cols
                d = c + 1
                faces.append((a, b, d))
                faces.append((a, d, c))
        return trimesh.Trimesh(vertices=top, faces=np.asarray(faces), process=False)
    floor = float(top[:, 2].min() - base)
    bottom = top.copy()
    bottom[:, 2] = floor
    vertices = np.vstack((top, bottom))
    count = rows * cols
    faces = []
    for i in range(rows - 1):
        for j in range(cols - 1):
            a = i * cols + j
            b = a + 1
            c = a + cols
            d = c + 1
            faces.extend(((a, b, d), (a, d, c), (a + count, d + count, b + count), (a + count, c + count, d + count)))
    for j in range(cols - 1):
        a = j
        b = j + 1
        faces.extend(((b, a, a + count), (b, a + count, b + count)))
    for j in range(cols - 1):
        a = (rows - 1) * cols + j
        b = a + 1
        faces.extend(((a, b, b + count), (a, b + count, a + count)))
    for i in range(rows - 1):
        a = i * cols
        b = a + cols
        faces.extend(((a, b, b + count), (a, b + count, a + count)))
    for i in range(rows - 1):
        a = i * cols + (cols - 1)
        b = a + cols
        faces.extend(((b, a, a + count), (b, a + count, b + count)))
    return trimesh.Trimesh(vertices=vertices, faces=np.asarray(faces), process=False)


def _gray_grid_from_image(workspace: Path, relative: str, side: int = 64):
    target = safe_workspace_file(workspace, relative)
    if not target.is_file():
        raise FileNotFoundError(relative)
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is not installed")
    completed = subprocess.run(
        [
            ffmpeg,
            "-v",
            "error",
            "-i",
            str(target),
            "-vf",
            f"scale={int(side)}:{int(side)}:flags=area,format=gray",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "gray",
            "pipe:1",
        ],
        check=False,
        capture_output=True,
        timeout=60,
    )
    if completed.returncode != 0 or len(completed.stdout) != side * side:
        raise RuntimeError(completed.stderr.decode("utf-8", errors="replace")[-400:] or "ffmpeg gray conversion failed")
    import numpy as np

    grid = np.frombuffer(completed.stdout, dtype=np.uint8).reshape((side, side)).astype(float)
    peak = float(grid.max())
    if peak > 0:
        grid = grid / peak
    return grid


def heightfield_mesh(
    workspace: Path,
    *,
    heights: list | None = None,
    image: str | None = None,
    width_mm: float = 40,
    depth_mm: float = 40,
    amplitude_mm: float = 4,
    base_mm: float = 1,
    output: str | None = None,
) -> dict:
    if heights is not None:
        grid = heights
        source = "heights"
    elif image:
        grid = _gray_grid_from_image(workspace, image)
        source = image
    else:
        raise ValueError("heights or image is required")
    mesh = _solid_heightfield(grid, width_mm, depth_mm, amplitude_mm, base_mm)
    path = _output_path(workspace, output, "triverse-heightfield.glb")
    _export_mesh(mesh, path)
    return {
        "path": path.relative_to(workspace.resolve()).as_posix(),
        "source": source,
        "vertices": int(len(mesh.vertices)),
        "faces": int(len(mesh.faces)),
        "closed": bool(mesh.is_watertight),
        "note": "这是本地灰度位移体，不是 Hi3D 浮雕服务，也不保证可打印。",
    }


def _convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    unique = sorted(set(points))
    if len(unique) <= 2:
        return unique

    def cross(origin, left, right) -> float:
        return (left[0] - origin[0]) * (right[1] - origin[1]) - (left[1] - origin[1]) * (right[0] - origin[0])

    lower: list[tuple[float, float]] = []
    for point in unique:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper: list[tuple[float, float]] = []
    for point in reversed(unique):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def _point_in_convex(point: tuple[float, float], polygon: list[tuple[float, float]]) -> bool:
    if len(polygon) < 3:
        return False

    def cross(origin, left, right) -> float:
        return (left[0] - origin[0]) * (right[1] - origin[1]) - (left[1] - origin[1]) * (right[0] - origin[0])

    sign = 0.0
    for index, start in enumerate(polygon):
        end = polygon[(index + 1) % len(polygon)]
        turn = cross(start, end, point)
        if turn == 0:
            continue
        if sign == 0:
            sign = turn
        elif turn * sign < 0:
            return False
    return True


def _edge_distance(point: tuple[float, float], polygon: list[tuple[float, float]]) -> float:
    import math

    best = None
    for index, start in enumerate(polygon):
        end = polygon[(index + 1) % len(polygon)]
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        length = math.hypot(dx, dy)
        if length == 0:
            distance = math.hypot(point[0] - start[0], point[1] - start[1])
        else:
            scale = max(0.0, min(1.0, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (length * length)))
            distance = math.hypot(point[0] - (start[0] + scale * dx), point[1] - (start[1] + scale * dy))
        best = distance if best is None else min(best, distance)
    return float(best or 0)


def support_check(workspace: Path, relative: str) -> dict:
    import numpy as np

    mesh = _load_mesh(workspace, relative)
    bounds = np.asarray(mesh.bounds, dtype=float)
    height = float(bounds[1, 2] - bounds[0, 2])
    band = max(height * 0.02, 1e-6)
    contact = mesh.vertices[mesh.vertices[:, 2] <= bounds[0, 2] + band]
    try:
        center = np.asarray(mesh.center_mass, dtype=float)
        center_kind = "center_mass"
    except Exception:
        center = np.asarray(mesh.centroid, dtype=float)
        center_kind = "centroid"
    polygon = _convex_hull([(float(x), float(y)) for x, y, _z in contact])
    point = (float(center[0]), float(center[1]))
    inside = _point_in_convex(point, polygon)
    margin = _edge_distance(point, polygon)
    return {
        "path": relative,
        "stable_estimate": bool(inside and margin >= 0),
        "margin_mm": margin if inside else -margin,
        "center_xy": [point[0], point[1]],
        "center_kind": center_kind,
        "contact_vertices": int(len(contact)),
        "note": "只按 Z 轴向上、底面接触点的几何估计。不证明摩擦、填充或实物抗倾倒。",
    }


def _ffmpeg() -> str | None:
    override = os.environ.get("FFMPEG_BIN", "").strip()
    if override:
        return override
    return shutil.which("ffmpeg")


def _run_ffmpeg(args: list[str]) -> dict:
    ffmpeg = _ffmpeg()
    if not ffmpeg:
        return {"available": False, "reason": "ffmpeg is not installed"}
    completed = subprocess.run([ffmpeg, "-y", "-v", "error", *args], check=False, capture_output=True, text=True, timeout=180)
    if completed.returncode != 0:
        return {"available": True, "error": completed.stderr[-500:]}
    return {"available": True}


def media_convert(
    workspace: Path,
    kind: str,
    *,
    inputs: list[str],
    output: str,
    start: float | None = None,
    end: float | None = None,
    width: int | None = None,
    height: int | None = None,
    fps: int | None = None,
) -> dict:
    if kind not in {"trim", "scale", "images_to_mp4", "mix_audio"}:
        raise ValueError("kind must be trim, scale, images_to_mp4, or mix_audio")
    if not isinstance(inputs, list) or not inputs:
        raise ValueError("inputs are required")
    files = [safe_workspace_file(workspace, item) for item in inputs]
    for path in files:
        if not path.is_file():
            raise FileNotFoundError(path.name)
    destination = safe_workspace_file(workspace, output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if kind == "trim":
        if len(files) != 1 or start is None or end is None:
            raise ValueError("trim needs one input, start, and end")
        begin = float(start)
        finish = float(end)
        if begin < 0 or finish <= begin:
            raise ValueError("invalid trim range")
        result = _run_ffmpeg(["-ss", f"{begin:.3f}", "-to", f"{finish:.3f}", "-i", str(files[0]), str(destination)])
    elif kind == "scale":
        if len(files) != 1 or width is None or height is None:
            raise ValueError("scale needs one input, width, and height")
        wide = int(width)
        high = int(height)
        if wide < 2 or high < 2 or wide > 4096 or high > 4096:
            raise ValueError("width and height must be 2 to 4096")
        result = _run_ffmpeg(["-i", str(files[0]), "-vf", f"scale={wide}:{high}", str(destination)])
    elif kind == "images_to_mp4":
        rate = int(fps or 24)
        if rate < 1 or rate > 60:
            raise ValueError("fps must be 1 to 60")
        listing = safe_workspace_file(workspace, "triverse-ffmpeg-list.txt")
        lines = []
        for path in files:
            lines.append(f"file '{path.as_posix()}'")
            lines.append(f"duration {1 / rate:.6f}")
        listing.write_text("\n".join(lines) + "\n", encoding="utf-8")
        publish_output(listing)
        result = _run_ffmpeg(
            ["-f", "concat", "-safe", "0", "-i", str(listing), "-vsync", "vfr", "-pix_fmt", "yuv420p", str(destination)]
        )
    else:
        if len(files) != 2:
            raise ValueError("mix_audio needs two inputs")
        result = _run_ffmpeg(
            ["-i", str(files[0]), "-i", str(files[1]), "-filter_complex", "amix=inputs=2:duration=longest", str(destination)]
        )
    if result.get("available") and "error" not in result and destination.is_file():
        publish_output(destination)
        result["path"] = destination.relative_to(workspace.resolve()).as_posix()
    return result


def image_sheet(workspace: Path, images: list[str], *, columns: int = 2, output: str = "triverse-sheet.png") -> dict:
    if not isinstance(images, list) or not 1 <= len(images) <= 12:
        raise ValueError("images must contain 1 to 12 paths")
    cols = int(columns)
    if cols < 1 or cols > 6:
        raise ValueError("columns must be 1 to 6")
    files = []
    for item in images:
        path = safe_workspace_file(workspace, item)
        if not path.is_file():
            raise FileNotFoundError(item)
        files.append(path)
    destination = safe_workspace_file(workspace, output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    args: list[str] = []
    for path in files:
        args.extend(["-i", str(path)])
    tiles = []
    for index in range(len(files)):
        tiles.append(f"[{index}:v]scale=320:320:force_original_aspect_ratio=decrease,pad=320:320:(ow-iw)/2:(oh-ih)/2,setsar=1[v{index}]")
    layout = []
    for index in range(len(files)):
        layout.append(f"{(index % cols) * 320}_{(index // cols) * 320}")
    inputs = "".join(f"[v{index}]" for index in range(len(files)))
    graph = ";".join(tiles) + f";{inputs}xstack=inputs={len(files)}:layout={'|'.join(layout)}[out]"
    result = _run_ffmpeg([*args, "-filter_complex", graph, "-map", "[out]", str(destination)])
    if result.get("available") and "error" not in result and destination.is_file():
        publish_output(destination)
        result["path"] = destination.relative_to(workspace.resolve()).as_posix()
    return result


def _timestamp(seconds: float) -> str:
    total = int(round(float(seconds) * 1000))
    if total < 0:
        raise ValueError("subtitle time must be >= 0")
    hours, total = divmod(total, 3_600_000)
    minutes, total = divmod(total, 60_000)
    secs, millis = divmod(total, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def write_subtitle(workspace: Path, cues: list, output: str = "triverse-subtitles.srt") -> dict:
    if not isinstance(cues, list) or not cues or len(cues) > 500:
        raise ValueError("cues must contain 1 to 500 items")
    blocks = []
    for index, cue in enumerate(cues, start=1):
        if not isinstance(cue, dict):
            raise ValueError("each cue must be an object")
        text = str(cue.get("text") or "").strip()
        if not text or len(text) > 500:
            raise ValueError("cue text must be 1 to 500 characters")
        start = _timestamp(float(cue["start"]))
        end = _timestamp(float(cue["end"]))
        if float(cue["end"]) <= float(cue["start"]):
            raise ValueError("cue end must be after start")
        blocks.append(f"{index}\n{start} --> {end}\n{text}\n")
    path = safe_workspace_file(workspace, output)
    if path.suffix.lower() not in {".srt", ".txt"}:
        raise ValueError("output must end with .srt")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(blocks), encoding="utf-8")
    publish_output(path)
    return {"path": path.relative_to(workspace.resolve()).as_posix(), "cues": len(blocks), "note": "只写时间轴文本，不做语音识别。"}


def run_bundled_blender(workspace: Path, script_name: str, job: dict, blender_bin: str) -> dict:
    if not blender_bin:
        return {
            "ran": False,
            "installed": False,
            "reason": "BLENDER_BIN 未设置，Blender 未安装，这一步只能在本地完成。",
        }
    script = Path(__file__).resolve().parent / "blender_scripts" / script_name
    if not script.is_file():
        raise FileNotFoundError(script_name)
    job_path = workspace / "triverse-blender-job.json"
    job_path.write_text(json.dumps(job), encoding="utf-8")
    try:
        completed = subprocess.run(
            [
                blender_bin,
                "--background",
                "--python-exit-code",
                "1",
                "--python",
                str(script),
                "--",
                str(job_path),
            ],
            cwd=workspace.resolve(),
            check=False,
            capture_output=True,
            text=True,
            timeout=300,
        )
    except subprocess.TimeoutExpired:
        return {"ran": True, "installed": True, "code": -1, "error": "blender timed out"}
    finally:
        try:
            job_path.unlink()
        except OSError:
            pass
    return {
        "ran": True,
        "installed": True,
        "code": completed.returncode,
        "stdout": completed.stdout[-2000:],
        "stderr": completed.stderr[-2000:],
    }


def mesh_boolean(
    workspace: Path,
    a: str,
    b: str,
    operation: str,
    blender_bin: str,
    output: str | None = None,
) -> dict:
    if operation not in {"difference", "union", "intersect"}:
        raise ValueError("operation must be difference, union, or intersect")
    left = safe_workspace_file(workspace, a)
    right = safe_workspace_file(workspace, b)
    if not left.is_file() or not right.is_file():
        raise FileNotFoundError("boolean input missing")
    destination = _output_path(workspace, output, "triverse-boolean.glb")
    if destination.suffix.lower() not in {".glb", ".stl"}:
        raise ValueError("output must end with .glb or .stl")
    result = run_bundled_blender(
        workspace,
        "boolean_op.py",
        {
            "workspace": str(workspace.resolve()),
            "a": left.relative_to(workspace.resolve()).as_posix(),
            "b": right.relative_to(workspace.resolve()).as_posix(),
            "operation": operation,
            "output": destination.relative_to(workspace.resolve()).as_posix(),
        },
        blender_bin,
    )
    if result.get("code") == 0 and destination.is_file():
        publish_output(destination)
        result["path"] = destination.relative_to(workspace.resolve()).as_posix()
    return result


def blender_preview(workspace: Path, relative: str, blender_bin: str, output_dir: str | None = None) -> dict:
    source = safe_workspace_file(workspace, relative)
    if not source.is_file():
        raise FileNotFoundError(relative)
    folder = _output_path(workspace, (output_dir or "triverse-preview") + "/keep.txt", "triverse-preview/keep.txt").parent
    folder.mkdir(parents=True, exist_ok=True)
    result = run_bundled_blender(
        workspace,
        "preview_op.py",
        {
            "workspace": str(workspace.resolve()),
            "model": source.relative_to(workspace.resolve()).as_posix(),
            "output_dir": folder.relative_to(workspace.resolve()).as_posix(),
        },
        blender_bin,
    )
    if result.get("code") == 0:
        written = []
        for path in sorted(folder.glob("*.png")):
            publish_output(path)
            written.append(path.relative_to(workspace.resolve()).as_posix())
        result["images"] = written
    return result


def texture_bake(workspace: Path, high: str, low: str, blender_bin: str, output: str | None = None) -> dict:
    high_path = safe_workspace_file(workspace, high)
    low_path = safe_workspace_file(workspace, low)
    if not high_path.is_file() or not low_path.is_file():
        raise FileNotFoundError("bake input missing")
    destination = _output_path(workspace, output, "triverse-bake-normal.png")
    if destination.suffix.lower() != ".png":
        raise ValueError("output must end with .png")
    result = run_bundled_blender(
        workspace,
        "bake_op.py",
        {
            "workspace": str(workspace.resolve()),
            "high": high_path.relative_to(workspace.resolve()).as_posix(),
            "low": low_path.relative_to(workspace.resolve()).as_posix(),
            "output": destination.relative_to(workspace.resolve()).as_posix(),
        },
        blender_bin,
    )
    if result.get("code") == 0 and destination.is_file():
        publish_output(destination)
        result["path"] = destination.relative_to(workspace.resolve()).as_posix()
        result["note"] = "本地 Blender 法线烘焙。不是远程贴图，也不代表 Hi3D 贴图服务。"
    return result
