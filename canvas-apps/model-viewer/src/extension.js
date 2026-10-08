import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { formatBytes, joinPath, modelKind, parentDir, parseFind, shQuote } from "./files.js";

const START_DIR = "/projects";
const BASH_FALLBACK_LIMIT = 48 * 1024 * 1024;

const CSS = `
.tmv, .tmv * { box-sizing: border-box; }
.tmv {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 560px;
  background: #14161c;
  color: #e7ebf2;
  font: 13px/1.45 ui-sans-serif, system-ui, sans-serif;
}
.tmv-bar, .tmv-dirs, .tmv-files, .tmv-status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
}
.tmv-bar, .tmv-dirs, .tmv-files { border-bottom: 1px solid #2a3140; }
.tmv-path { flex: 1 1 280px; min-width: 0; }
.tmv input[type="text"] {
  width: 100%;
  border: 1px solid #3a4458;
  border-radius: 8px;
  background: #0f1218;
  color: inherit;
  padding: 7px 10px;
  font: inherit;
}
.tmv button, .tmv .tmv-file {
  border: 1px solid #3a4458;
  border-radius: 8px;
  background: #1c2230;
  color: inherit;
  padding: 6px 10px;
  font: inherit;
  cursor: pointer;
}
.tmv button:hover, .tmv .tmv-file:hover { background: #263044; }
.tmv button:disabled { opacity: 0.5; cursor: default; }
.tmv .tmv-file[aria-pressed="true"] { border-color: #8fb4ff; background: #243454; }
.tmv-dirs span, .tmv-files span { color: #93a0b5; }
.tmv-stage { position: relative; flex: 1 1 auto; min-height: 420px; }
.tmv-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
.tmv-empty {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #93a0b5; pointer-events: none; padding: 24px; text-align: center;
}
.tmv-status { color: #c5d0e0; min-height: 36px; }
.tmv-status[data-state="error"] { color: #ffb4b4; }
`;

export function activate(host) {
  if (host.apiVersion !== "1") {
    throw new Error("3D 模型查看器需要 Canvas host API 1。");
  }
  return host.registerPage("viewer", ({ container }) => mount(host, container));
}

function mount(host, container) {
  container.style.height = "100%";
  container.style.minHeight = "100%";
  container.style.display = "flex";
  container.style.flexDirection = "column";

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const root = document.createElement("section");
  root.className = "tmv";
  root.setAttribute("aria-label", "3D 模型");
  root.innerHTML = `
    <form class="tmv-bar">
      <label class="tmv-path">模型路径
        <input type="text" name="path" spellcheck="false" autocomplete="off"
          placeholder="/projects/canvas-mcp-check/box.glb" />
      </label>
      <button type="submit">打开</button>
      <label class="tmv-file">本地文件
        <input type="file" accept=".glb,.gltf,.obj,.stl" hidden />
      </label>
    </form>
    <div class="tmv-dirs">
      <button type="button" data-up>上一级</button>
      <span data-cwd></span>
      <span data-dir-list></span>
    </div>
    <div class="tmv-files">
      <button type="button" data-scan>扫描此目录</button>
      <span data-file-list>尚未扫描</span>
    </div>
    <div class="tmv-stage">
      <canvas aria-label="模型视口"></canvas>
      <div class="tmv-empty">选择工作区里的模型，或打开一个本地文件。</div>
    </div>
    <div class="tmv-status" role="status" data-state="idle">
      <span data-status-text>准备就绪</span>
      <button type="button" data-reset disabled>重置视角</button>
    </div>
  `;
  container.append(root);

  const pathInput = root.querySelector('input[name="path"]');
  const fileInput = root.querySelector('input[type="file"]');
  const cwdLabel = root.querySelector("[data-cwd]");
  const dirList = root.querySelector("[data-dir-list]");
  const fileList = root.querySelector("[data-file-list]");
  const empty = root.querySelector(".tmv-empty");
  const status = root.querySelector(".tmv-status");
  const statusText = root.querySelector("[data-status-text]");
  const canvas = root.querySelector("canvas");
  const stage = root.querySelector(".tmv-stage");
  const resetButton = root.querySelector("[data-reset]");
  const scanButton = root.querySelector("[data-scan]");

  const viewer = createViewer(canvas, stage);
  let disposed = false;
  let loadToken = 0;
  let currentDir = START_DIR;
  let framed = null;

  const params = new URLSearchParams(window.location.search);
  const initialFile = params.get("file");
  if (initialFile) pathInput.value = initialFile;

  function setStatus(text, state) {
    status.dataset.state = state;
    statusText.textContent = text;
  }

  async function showDir(dir) {
    currentDir = dir || "/";
    cwdLabel.textContent = currentDir;
    dirList.replaceChildren();
    try {
      const items = (await listSubdirs(host, currentDir)).filter((item) => !item.name.startsWith("_"));
      if (disposed || currentDir !== dir) return;
      if (items.length === 0) {
        const note = document.createElement("span");
        note.textContent = "没有子目录";
        dirList.append(note);
      }
      for (const item of items) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = item.name;
        button.addEventListener("click", () => {
          showDir(item.path);
          scan(item.path);
        });
        dirList.append(button);
      }
    } catch (error) {
      if (!disposed) setStatus(errorMessage(error), "error");
    }
  }

  async function scan(dir) {
    scanButton.disabled = true;
    fileList.textContent = "正在扫描…";
    try {
      const command = `find ${shQuote(dir)} -maxdepth 1 -type f \\( -iname '*.glb' -o -iname '*.gltf' -o -iname '*.obj' -o -iname '*.stl' \\) -printf '%s %p\\n'`;
      const stdout = await runBash(host, command);
      if (disposed || currentDir !== dir) return;
      const files = parseFind(stdout);
      renderFiles(files);
    } catch (error) {
      if (!disposed) {
        fileList.textContent = "扫描失败";
        setStatus(errorMessage(error), "error");
      }
    } finally {
      scanButton.disabled = false;
    }
  }

  function renderFiles(files) {
    fileList.replaceChildren();
    if (files.length === 0) {
      fileList.textContent = "这个目录里没有 GLB、glTF、OBJ 或 STL";
      return;
    }
    for (const file of files) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tmv-file";
      button.dataset.path = file.path;
      const name = file.path.slice(file.path.lastIndexOf("/") + 1);
      button.textContent = `${name} · ${formatBytes(file.size)}`;
      button.addEventListener("click", () => {
        pathInput.value = file.path;
        loadServerFile(file.path);
      });
      fileList.append(button);
    }
  }

  function markActive(path) {
    for (const button of fileList.querySelectorAll(".tmv-file")) {
      button.setAttribute("aria-pressed", button.dataset.path === path ? "true" : "false");
    }
  }

  async function loadServerFile(path) {
    const kind = modelKind(path);
    if (!kind) {
      setStatus("只能打开 .glb、.gltf、.obj 或 .stl。", "error");
      return;
    }
    const token = ++loadToken;
    setStatus(`正在读取 ${path}`, "loading");
    empty.hidden = true;
    try {
      const bytes = await downloadBytes(host, path);
      if (disposed || token !== loadToken) return;
      const loaded = await parseModel(kind, bytes, path, (rel) => downloadBytes(host, joinPath(parentDir(path), rel)));
      if (disposed || token !== loadToken) {
        disposeObject(loaded.object);
        return;
      }
      framed = viewer.show(loaded.object);
      resetButton.disabled = false;
      markActive(path);
      const draw = viewer.sampleCenter();
      root.dataset.meshCount = String(loaded.meshes);
      root.dataset.vertexCount = String(loaded.vertices);
      root.dataset.drawOk = draw ? "1" : "0";
      root.dataset.loadedPath = path;
      setStatus(`${path} · ${loaded.meshes} 个网格 · ${loaded.vertices} 个顶点`, "ready");
    } catch (error) {
      if (disposed || token !== loadToken) return;
      empty.hidden = false;
      root.dataset.drawOk = "0";
      setStatus(errorMessage(error), "error");
    }
  }

  async function loadLocalFile(file) {
    const kind = modelKind(file.name);
    if (!kind) {
      setStatus("本地文件只能是 .glb、.gltf、.obj 或 .stl。", "error");
      return;
    }
    const token = ++loadToken;
    setStatus(`正在读取本地文件 ${file.name}`, "loading");
    empty.hidden = true;
    try {
      const bytes = await file.arrayBuffer();
      if (disposed || token !== loadToken) return;
      const loaded = await parseModel(kind, bytes, file.name, async () => {
        throw new Error("单独的 glTF 引用了外部文件。请改用 GLB，或把文件放在工作区里打开。");
      });
      if (disposed || token !== loadToken) {
        disposeObject(loaded.object);
        return;
      }
      framed = viewer.show(loaded.object);
      resetButton.disabled = false;
      root.dataset.meshCount = String(loaded.meshes);
      root.dataset.vertexCount = String(loaded.vertices);
      root.dataset.drawOk = viewer.sampleCenter() ? "1" : "0";
      root.dataset.loadedPath = file.name;
      setStatus(`${file.name} · ${loaded.meshes} 个网格 · ${loaded.vertices} 个顶点`, "ready");
    } catch (error) {
      if (!disposed && token === loadToken) setStatus(errorMessage(error), "error");
    }
  }

  root.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const path = pathInput.value.trim();
    if (!path.startsWith("/")) {
      setStatus("请填写服务器上的绝对路径。", "error");
      return;
    }
    loadServerFile(path);
  });
  root.querySelector("[data-up]").addEventListener("click", () => {
    const next = parentDir(currentDir);
    showDir(next);
    scan(next);
  });
  scanButton.addEventListener("click", () => scan(currentDir));
  resetButton.addEventListener("click", () => {
    if (framed) viewer.frame(framed);
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) loadLocalFile(file);
    fileInput.value = "";
  });

  const startDir = initialFile && initialFile.startsWith("/") ? parentDir(initialFile) : START_DIR;
  showDir(startDir);
  scan(startDir);
  if (initialFile && initialFile.startsWith("/")) loadServerFile(initialFile);

  return () => {
    disposed = true;
    loadToken += 1;
    viewer.dispose();
    root.remove();
    style.remove();
    container.style.height = "";
    container.style.minHeight = "";
    container.style.display = "";
    container.style.flexDirection = "";
  };
}

function createViewer(canvas, stage) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x14161c, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  camera.position.set(2.2, 1.4, 2.8);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3344, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 6, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd7e4ff, 0.45);
  fill.position.set(-4, 2, -3);
  scene.add(fill);

  let model = null;
  let grid = null;
  let frameId = 0;

  function resize() {
    const width = Math.max(stage.clientWidth, 1);
    const height = Math.max(stage.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  function render() {
    controls.update();
    renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(render);
  }
  render();

  return {
    show(object) {
      if (model) {
        scene.remove(model);
        disposeObject(model);
      }
      if (grid) {
        scene.remove(grid);
        disposeObject(grid);
      }
      model = object;
      scene.add(object);
      const framed = frameObject(camera, controls, object);
      const span = Math.max(framed.size.x, framed.size.z, framed.radius, 0.5);
      grid = new THREE.GridHelper(span * 4, 20, 0x41506a, 0x2c3546);
      grid.position.y = framed.box.min.y;
      scene.add(grid);
      return framed;
    },
    frame(framed) {
      placeCamera(camera, controls, framed);
    },
    sampleCenter() {
      renderer.render(scene, camera);
      const gl = renderer.getContext();
      const pixel = new Uint8Array(4);
      const x = Math.floor(gl.drawingBufferWidth / 2);
      const y = Math.floor(gl.drawingBufferHeight / 2);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const clear = [20, 22, 28];
      return pixel[0] !== clear[0] || pixel[1] !== clear[1] || pixel[2] !== clear[2];
    },
    dispose() {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      controls.dispose();
      if (model) disposeObject(model);
      if (grid) disposeObject(grid);
      renderer.dispose();
    },
  };
}

function frameObject(camera, controls, object) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    box.set(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() * 0.5, 1e-4);
  const framed = { box, size, center, radius };
  placeCamera(camera, controls, framed);
  return framed;
}

function placeCamera(camera, controls, framed) {
  const { center, radius } = framed;
  const fov = (camera.fov * Math.PI) / 180;
  const dist = (radius / Math.sin(fov / 2)) * 1.15;
  camera.position.set(center.x + radius * 0.45, center.y + radius * 0.35, center.z + dist);
  camera.near = Math.max(radius / 200, 1e-4);
  camera.far = dist * 20 + radius * 20;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

async function parseModel(kind, bytes, label, fetchRelative) {
  let object;
  if (kind === "glb") {
    object = await parseGltf(bytes, "");
  } else if (kind === "gltf") {
    object = await parseGltfDocument(bytes, fetchRelative);
  } else if (kind === "obj") {
    const text = new TextDecoder().decode(bytes);
    object = new OBJLoader().parse(text);
    object.traverse((node) => {
      if (node.isMesh && node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) material.side = THREE.DoubleSide;
      }
    });
  } else if (kind === "stl") {
    const geometry = new STLLoader().parse(bytes);
    geometry.computeVertexNormals();
    object = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0xc5ccd6, metalness: 0.04, roughness: 0.62, side: THREE.DoubleSide }),
    );
  } else {
    throw new Error(`不支持的格式：${label}`);
  }
  const counts = countGeometry(object);
  if (counts.meshes === 0) throw new Error(`${label} 里没有网格。`);
  return { object, ...counts };
}

function parseGltf(bytes, resourcePath) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(bytes, resourcePath, (gltf) => resolve(gltf.scene), reject);
  });
}

async function parseGltfDocument(bytes, fetchRelative) {
  const json = JSON.parse(new TextDecoder().decode(bytes));
  for (const buffer of json.buffers ?? []) {
    if (buffer.uri && !buffer.uri.startsWith("data:")) {
      const data = await fetchRelative(decodeURIComponent(buffer.uri));
      buffer.uri = `data:application/octet-stream;base64,${bytesToBase64(data)}`;
    }
  }
  for (const image of json.images ?? []) {
    if (image.uri && !image.uri.startsWith("data:")) {
      const data = await fetchRelative(decodeURIComponent(image.uri));
      image.uri = `data:${mimeForImage(image.uri)};base64,${bytesToBase64(data)}`;
    }
  }
  return parseGltf(new TextEncoder().encode(JSON.stringify(json)), "");
}

function mimeForImage(uri) {
  const ext = uri.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

function countGeometry(object) {
  let meshes = 0;
  let vertices = 0;
  object.traverse((node) => {
    if (!node.isMesh || !node.geometry?.attributes?.position) return;
    meshes += 1;
    vertices += node.geometry.attributes.position.count;
  });
  return { meshes, vertices };
}

function disposeObject(object) {
  object.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (!node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value && value.isTexture) value.dispose();
      }
      material.dispose();
    }
  });
}

async function listSubdirs(host, dir) {
  const items = [];
  let pageId = null;
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ path: dir, limit: "100" });
    if (pageId) params.set("page_id", pageId);
    const body = await host.agentServer.request({
      method: "GET",
      path: `/api/file/search_subdirs?${params.toString()}`,
    });
    items.push(...(body.items ?? []));
    pageId = body.next_page_id;
    if (!pageId) break;
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

async function runBash(host, command) {
  const out = await host.agentServer.request({
    method: "POST",
    path: "/api/bash/execute_bash_command",
    body: { command, timeout: 30 },
  });
  if (out.exit_code !== 0) throw new Error((out.stderr || out.stdout || "命令失败").trim());
  return out.stdout || "";
}

async function downloadBytes(host, path) {
  // The extension helper turns a non-JSON body into text, which corrupts GLB
  // bytes. The file route returns the raw body on this same origin.
  const response = await fetch(`/api/file/download?path=${encodeURIComponent(path)}`);
  if (response.status === 401 || response.status === 403) return downloadBytesViaBash(host, path);
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(detail || `下载失败 (${response.status})`);
  }
  return response.arrayBuffer();
}

async function downloadBytesViaBash(host, path) {
  const sizeText = (await runBash(host, `stat -c %s ${shQuote(path)}`)).trim();
  const size = Number(sizeText);
  if (!Number.isFinite(size)) throw new Error("无法读取文件大小。");
  if (size > BASH_FALLBACK_LIMIT) {
    throw new Error("文件下载需要登录，而且这个文件太大，不能经命令输出读取。");
  }
  const encoded = (await runBash(host, `base64 -w 0 ${shQuote(path)}`)).replace(/\s/g, "");
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let text = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    text += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(text);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
