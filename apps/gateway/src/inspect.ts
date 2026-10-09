export interface MeshReport {
  triangles: number; meshes: number; materials: number; vertices: number; bytes: number;
  bounds?: { min: number[]; max: number[] };
  dimensions?: number[];
  textures: number; skins: number; animations: string[];
  primitivesWithoutUV: number; primitivesWithoutNormals: number;
  audit: { checkedTriangles: number; complete: boolean; boundaryEdges: number; nonManifoldEdges: number; inconsistentWindingEdges: number; degenerateFaces: number; connectedComponents: number; closed: boolean | null };
  warnings: string[];
}
type Doc = Record<string, any>;
type Bounds = NonNullable<MeshReport["bounds"]>;
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a: number[], b: number[]): number[] {
  const out = Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}
function matrix(node: Doc): number[] {
  if (node.matrix) {
    if (!Array.isArray(node.matrix) || node.matrix.length !== 16 || !node.matrix.every(Number.isFinite)) throw new Error("invalid node matrix");
    return node.matrix;
  }
  const t = node.translation ?? [0, 0, 0], s = node.scale ?? [1, 1, 1], q = node.rotation ?? [0, 0, 0, 1];
  if (![t, s, q].every(Array.isArray) || t.length !== 3 || s.length !== 3 || q.length !== 4 || ![...t, ...s, ...q].every(Number.isFinite)) throw new Error("invalid node transform");
  const [x, y, z, w] = q;
  return [(1 - 2 * (y*y + z*z))*s[0], 2*(x*y + z*w)*s[0], 2*(x*z - y*w)*s[0], 0,
    2*(x*y - z*w)*s[1], (1 - 2*(x*x + z*z))*s[1], 2*(y*z + x*w)*s[1], 0,
    2*(x*z + y*w)*s[2], 2*(y*z - x*w)*s[2], (1 - 2*(x*x + y*y))*s[2], 0, ...t, 1];
}
function extend(bounds: Bounds | undefined, point: number[]): Bounds {
  if (!point.every(Number.isFinite)) throw new Error("non-finite mesh position");
  if (!bounds) return { min: [...point], max: [...point] };
  for (let i = 0; i < 3; i++) { bounds.min[i] = Math.min(bounds.min[i], point[i]); bounds.max[i] = Math.max(bounds.max[i], point[i]); }
  return bounds;
}
function transformBounds(bounds: Bounds, m: number[]): Bounds {
  let out: Bounds | undefined;
  for (let mask = 0; mask < 8; mask++) {
    const p = [0, 1, 2].map((i) => mask & (1 << i) ? bounds.max[i] : bounds.min[i]);
    out = extend(out, [0, 1, 2].map((r) => m[r]*p[0] + m[4+r]*p[1] + m[8+r]*p[2] + m[12+r]));
  }
  return out!;
}

export function inspectGlb(bytes: Buffer): MeshReport {
  if (bytes.length < 20 || bytes.toString("utf8", 0, 4) !== "glTF") throw new Error("not a glb file");
  if (bytes.readUInt32LE(4) !== 2) throw new Error("unsupported GLB version");
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error("GLB declared length does not match file");
  let json: Buffer | undefined, binary: Buffer | undefined;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw new Error("truncated GLB chunk header");
    const size = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    if (size % 4 || offset + 8 + size > bytes.length) throw new Error("GLB chunk is truncated or unaligned");
    if (offset === 12 && type !== 0x4e4f534a) throw new Error("glb is missing a JSON chunk");
    if (type === 0x4e4f534a) { if (json) throw new Error("duplicate GLB JSON chunk"); json = bytes.subarray(offset + 8, offset + 8 + size); }
    if (type === 0x004e4942) { if (binary) throw new Error("duplicate GLB BIN chunk"); binary = bytes.subarray(offset + 8, offset + 8 + size); }
    offset += 8 + size;
  }
  if (!json) throw new Error("glb is missing a JSON chunk");
  const doc: Doc = JSON.parse(json.toString("utf8"));
  if (doc.asset?.version !== "2.0") throw new Error("unsupported glTF asset version");
  const accessors: Doc[] = doc.accessors ?? [], meshes: Doc[] = doc.meshes ?? [];
  const warnings = new Set<string>();
  const report: MeshReport = { triangles: 0, meshes: meshes.length, materials: (doc.materials ?? []).length, vertices: 0, bytes: bytes.length,
    textures: (doc.textures ?? []).length, skins: (doc.skins ?? []).length, animations: (doc.animations ?? []).map((a: Doc, i: number) => a.name ?? `Animation ${i+1}`),
    primitivesWithoutUV: 0, primitivesWithoutNormals: 0,
    audit: { checkedTriangles: 0, complete: false, boundaryEdges: 0, nonManifoldEdges: 0, inconsistentWindingEdges: 0, degenerateFaces: 0, connectedComponents: 0, closed: null }, warnings: [] };
  function getAccessor(index: unknown): Doc {
    if (!Number.isInteger(index) || !accessors[index as number]) throw new Error("invalid accessor reference");
    const a = accessors[index as number];
    if (!Number.isSafeInteger(a.count) || a.count < 0) throw new Error("invalid accessor count");
    return a;
  }
  function readAccessor(index: unknown, components: number): number[][] | undefined {
    const a = getAccessor(index);
    if (a.sparse || a.bufferView === undefined) { warnings.add("Some accessors are sparse or lack readable buffers; geometry audit is incomplete."); return; }
    if (a.type !== (components === 3 ? "VEC3" : "SCALAR")) throw new Error("unexpected accessor type");
    const view = doc.bufferViews?.[a.bufferView];
    if (!view || !Number.isSafeInteger(view.byteLength) || view.byteLength < 0) throw new Error("invalid buffer view");
    if (view.extensions?.EXT_meshopt_compression) { warnings.add("Meshopt compressed geometry needs a decoder; audit is incomplete."); return; }
    const buffer = doc.buffers?.[view.buffer ?? 0];
    if (buffer?.uri || (view.buffer ?? 0) !== 0 || !binary) { warnings.add("External or missing buffers cannot be audited by this local GLB reader."); return; }
    const readers: Record<number, [number, (offset: number) => number]> = {
      5120: [1, (o) => binary!.readInt8(o)], 5121: [1, (o) => binary!.readUInt8(o)],
      5122: [2, (o) => binary!.readInt16LE(o)], 5123: [2, (o) => binary!.readUInt16LE(o)],
      5125: [4, (o) => binary!.readUInt32LE(o)], 5126: [4, (o) => binary!.readFloatLE(o)],
    };
    const reader = readers[a.componentType];
    if (!reader) throw new Error("unsupported accessor component type");
    const [size, read] = reader, stride = view.byteStride ?? components * size;
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const end = a.count ? start + (a.count - 1)*stride + components*size : start;
    if (![start, stride, view.byteOffset ?? 0, a.byteOffset ?? 0].every((n) => Number.isSafeInteger(n) && n >= 0) || stride < components*size || end > (view.byteOffset ?? 0) + view.byteLength || (view.byteOffset ?? 0) + view.byteLength > binary.length || end > (buffer?.byteLength ?? binary.length)) throw new Error("accessor exceeds buffer bounds");
    if (a.count > 2_000_000) { warnings.add("Geometry audit skipped an accessor over two million entries."); return; }
    if (a.normalized) { warnings.add("Normalized position accessors need decoding; geometry audit is incomplete."); return; }
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: components }, (_, c) => read(start + i*stride + c*size)));
  }
  const meshBounds: Array<Bounds | undefined> = [];
  meshes.forEach((mesh, meshIndex) => {
    let bounds: Bounds | undefined;
    const edges = new Map<string, { count: number; direction: number }>();
    const parents = new Map<string, string>();
    function root(v: string): string { let p = parents.get(v)!; while (p !== parents.get(p)) { parents.set(p, parents.get(parents.get(p)!)!); p = parents.get(p)!; } return p; }
    function union(a: string, b: string) { if (!parents.has(a)) parents.set(a, a); if (!parents.has(b)) parents.set(b, b); parents.set(root(a), root(b)); }
    for (const primitive of mesh.primitives ?? []) {
      const position = getAccessor(primitive.attributes?.POSITION);
      report.vertices += position.count;
      const count = primitive.indices === undefined ? position.count : getAccessor(primitive.indices).count;
      const mode = primitive.mode ?? 4;
      const triangles = mode === 4 ? Math.floor(count/3) : mode === 5 || mode === 6 ? Math.max(0, count - 2) : 0;
      report.triangles += triangles;
      if (primitive.attributes?.TEXCOORD_0 === undefined) report.primitivesWithoutUV++;
      if (primitive.attributes?.NORMAL === undefined) report.primitivesWithoutNormals++;
      if (position.min?.length === 3 && position.max?.length === 3) { bounds = extend(bounds, position.min); bounds = extend(bounds, position.max); }
      if (primitive.targets?.length) warnings.add("Bounds describe the base pose; morph targets and animated deformation are not evaluated.");
      if (primitive.extensions?.KHR_draco_mesh_compression) { warnings.add("Draco compressed geometry needs a decoder; audit is incomplete."); continue; }
      if (report.audit.checkedTriangles + triangles > 500_000) { warnings.add("Topology audit is limited to 500000 triangles; optimize large meshes before full inspection."); continue; }
      const points = readAccessor(primitive.attributes?.POSITION, 3);
      if (!points) continue;
      for (const point of points) bounds = extend(bounds, point);
      if (!triangles) continue;
      const indices = primitive.indices === undefined ? points.map((_, i) => [i]) : readAccessor(primitive.indices, 1);
      if (!indices) continue;
      for (let f = 0; f < triangles; f++) {
        const slots = mode === 4 ? [f*3, f*3+1, f*3+2] : mode === 6 ? [0, f+1, f+2] : f%2 ? [f+1, f, f+2] : [f, f+1, f+2];
        const pts = slots.map((slot) => { const index = indices[slot]?.[0]; if (!Number.isInteger(index) || !points[index]) throw new Error("triangle index is outside POSITION accessor"); return points[index]; });
        const keys = pts.map((p) => p.map((n) => Object.is(n, -0) ? 0 : n).join(","));
        report.audit.checkedTriangles++;
        const a = pts[1].map((v, i) => v-pts[0][i]), b = pts[2].map((v, i) => v-pts[0][i]);
        const cross = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
        if (new Set(keys).size < 3 || cross.every((n) => n === 0)) { report.audit.degenerateFaces++; continue; }
        union(keys[0], keys[1]); union(keys[1], keys[2]);
        for (let i=0; i<3; i++) {
          const x=keys[i], y=keys[(i+1)%3], id=x<y ? `${x}|${y}` : `${y}|${x}`;
          const edge=edges.get(id) ?? { count: 0, direction: 0 }; edge.count++; edge.direction += x<y ? 1 : -1; edges.set(id, edge);
        }
      }
    }
    for (const edge of edges.values()) {
      if (edge.count === 1) report.audit.boundaryEdges++;
      if (edge.count > 2) report.audit.nonManifoldEdges++;
      if (edge.count === 2 && edge.direction !== 0) report.audit.inconsistentWindingEdges++;
    }
    report.audit.connectedComponents += new Set([...parents.keys()].map(root)).size;
    meshBounds[meshIndex] = bounds;
  });
  let bounds: Bounds | undefined;
  function include(b: Bounds) { bounds=extend(bounds,b.min); bounds=extend(bounds,b.max); }
  if (doc.nodes?.length) {
    const nodes: Doc[] = doc.nodes;
    const roots = doc.scenes?.[doc.scene ?? 0]?.nodes ?? nodes.map((_, i) => i).filter((i) => !nodes.some((n) => n.children?.includes(i)));
    function visit(index: number, parent: number[], seen: Set<number>) {
      if (!nodes[index] || seen.has(index)) throw new Error("invalid or cyclic glTF node hierarchy");
      const node=nodes[index], world=multiply(parent,matrix(node));
      if (node.mesh !== undefined) { if (!meshes[node.mesh]) throw new Error("invalid mesh reference"); const b=meshBounds[node.mesh]; if (b) include(transformBounds(b,world)); }
      for (const child of node.children ?? []) visit(child,world,new Set([...seen,index]));
    }
    for (const index of roots) visit(index,identity(),new Set());
  } else for (const b of meshBounds) if (b) include(b);
  report.bounds=bounds;
  report.dimensions=bounds ? bounds.max.map((v,i)=>v-bounds!.min[i]) : undefined;
  report.audit.complete=report.triangles>0 && report.audit.checkedTriangles===report.triangles;
  if (report.audit.complete) report.audit.closed=report.audit.boundaryEdges===0 && report.audit.nonManifoldEdges===0 && report.audit.degenerateFaces===0 && report.audit.inconsistentWindingEdges===0;
  if (report.skins || report.animations.length) warnings.add("Bounds are static; animation poses and skin deformation are not measured.");
  if (doc.images?.some((image: Doc)=>image.uri && !image.uri.startsWith("data:"))) warnings.add("Model references external textures; include those dependencies for delivery.");
  warnings.add("Topology checks weld identical positions within each mesh. They do not test self-intersections, vertex manifoldness, wall thickness or printability.");
  report.warnings=[...warnings];
  return report;
}
