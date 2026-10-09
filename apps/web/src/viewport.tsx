import { Grid } from "@react-three/drei/core/Grid.js";
import { OrbitControls } from "@react-three/drei/core/OrbitControls.js";
import { useGLTF } from "@react-three/drei/core/Gltf.js";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import type { CameraPreset, SceneObject, SceneState } from "@triverse/protocol";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from "react";
import { AnimationMixer, Box3, BoxHelper, Group, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, Vector3 } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { fileUrl } from "./api";
import { Icon } from "./brand";

type Controls = ComponentRef<typeof OrbitControls>;
interface ViewportProps { projectId: string; scene: SceneState; onSelect: (id: string) => void; onCamera: (preset: CameraPreset) => void }
const presets: CameraPreset[] = ["default", "front", "back", "left", "right", "top"];

export function Viewport({ projectId, scene, onSelect, onCamera }: ViewportProps) {
  const [showGrid, setShowGrid] = useState(true), [playing, setPlaying] = useState(false), [loaded, setLoaded] = useState(0), [reset, setReset] = useState(0);
  const [localPreset,setLocalPreset]=useState<CameraPreset>(scene.camera.preset ?? "default");
  useEffect(()=>setLocalPreset(scene.camera.preset ?? "default"),[projectId,scene.camera.preset]);
  const previewScene={...scene,camera:{...scene.camera,preset:localPreset}};
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [assetRevision, setAssetRevision] = useState(0);
  const controls = useRef<Controls>(null), capture = useRef<(() => void) | null>(null);
  const byParent = useMemo(() => {
    const map = new Map<string | undefined, SceneObject[]>();
    for (const object of scene.objects) map.set(object.parentId, [...(map.get(object.parentId) ?? []), object]);
    return map;
  }, [scene.objects]);
  const objectsById = new Map(scene.objects.map((object) => [object.id, object]));
  function isVisible(object: SceneObject): boolean {
    return object.visible && scene.visibility[object.id] !== false && (!object.parentId || Boolean(objectsById.get(object.parentId) && isVisible(objectsById.get(object.parentId)!)));
  }
  const visibleModels = scene.objects.filter((object) => isVisible(object) && object.assetPath?.toLowerCase().endsWith(".glb"));
  function renderObject(object: SceneObject): ReactNode {
    if (!object.visible || scene.visibility[object.id] === false) return null;
    return <group key={object.id} name={`object:${object.id}`} userData={{ sceneObjectId: object.id }} position={object.position ?? [0,0,0]} rotation={object.rotation ?? [0,0,0]} scale={object.scale ?? [1,1,1]}>
      {object.kind === "light" ? <pointLight color={object.light?.color ?? "#ffffff"} intensity={object.light?.intensity ?? 2} /> : null}
      {object.assetPath?.toLowerCase().endsWith(".glb") ? <ModelBoundary key={`${projectId}:${object.id}:${object.assetPath}:${assetRevision}`} onError={(message) => setErrors((current) => ({ ...current, [object.id]: message }))}>
        <Asset url={fileUrl(projectId, object.assetPath, assetRevision)} inspect={scene.mode === "inspect"} playing={playing} onReady={() => { setLoaded((n) => n+1); setErrors((current) => { const next={...current}; delete next[object.id]; return next; }); }} onSelect={() => onSelect(object.id)} />
      </ModelBoundary> : null}
      {(byParent.get(object.id) ?? []).map(renderObject)}
    </group>;
  }
  return <div className="viewport">
    <CanvasBoundary><Canvas frameloop={playing ? "always" : "demand"} dpr={[1,1.5]} camera={{ position: [3.2,2.2,4.2], fov: 45 }} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={["#141418"]} /><ambientLight intensity={0.6} /><directionalLight position={[4,6,3]} intensity={1.4} />
      {showGrid && scene.mode !== "render" ? <Grid args={[20,20]} cellColor="#29282f" sectionColor="#3d3a49" fadeDistance={18} fadeStrength={2} infiniteGrid /> : null}
      <OrbitControls ref={controls} makeDefault />
      <Suspense fallback={null}>{(byParent.get(undefined) ?? []).map(renderObject)}</Suspense>
      <CameraControl sceneState={previewScene} controls={controls} loaded={loaded} reset={reset} capture={capture} />
      <Selection sceneState={scene} loaded={loaded} />
    </Canvas></CanvasBoundary>
    <div className="viewport-toolbar"><div className="viewport-label"><Icon name="cube" size={15} />{localPreset}<span>· {scene.mode} mode</span></div><div className="viewport-controls">
      <button type="button" aria-label="Toggle grid" aria-pressed={showGrid} onClick={() => setShowGrid((v) => !v)}><Icon name="grid" size={14} /></button>
      <button type="button" aria-label="Fit view" title="Fit view" onClick={() => setReset((n) => n+1)}><Icon name="reset" size={14} /></button>
      <button type="button" aria-label="Reload models" title="Reload changed model files" onClick={() => setAssetRevision(Date.now())}>↻</button>
      <button type="button" aria-label={playing ? "Pause animation" : "Play animation"} title="Play embedded animations" aria-pressed={playing} onClick={() => setPlaying((v) => !v)}>{playing ? "Ⅱ" : "▶"}</button>
      <button type="button" aria-label="Download preview PNG" title="Download preview PNG" onClick={() => capture.current?.()}>PNG</button>
    </div></div>
    <div className="view-presets" aria-label="Camera views">{presets.map((preset) => <button key={preset} type="button" aria-pressed={localPreset === preset} onClick={() => {setLocalPreset(preset);onCamera(preset);}}>{preset === "default" ? "Perspective" : preset}</button>)}</div>
    {visibleModels.length === 0 ? <div className="empty"><div className="empty-scene-icon"><Icon name="cube" size={34} /></div><h2>3D preview</h2><p>Your models will appear here.</p></div> : null}
    {Object.entries(errors).filter(([id]) => scene.objects.some((o) => o.id === id)).map(([id,message]) => <div className="viewport-error" role="alert" key={id}>{scene.objects.find((o) => o.id === id)?.name}: {message}</div>)}
    <div className="viewport-footer"><span>Drag to orbit · Scroll to zoom · Right-drag to pan</span><span>{visibleModels.length} MODELS</span></div>
  </div>;
}
function Asset({ url, inspect, playing, onReady, onSelect }: { url: string; inspect: boolean; playing: boolean; onReady: () => void; onSelect: () => void }) {
  const gltf=useGLTF(url);
  const display=displayScene(gltf);
  const object=useMemo(() => {
    const copy=clone(display);
    copy.traverse((node) => { if (node instanceof Mesh) node.material = Array.isArray(node.material) ? node.material.map((m) => m?.clone() ?? new MeshStandardMaterial()) : node.material?.clone() ?? new MeshStandardMaterial(); });
    return copy;
  }, [display]);
  const mixer=useMemo(() => new AnimationMixer(object),[object]);
  const ready=useRef(onReady); ready.current=onReady;
  useEffect(() => { ready.current(); return () => { object.traverse((node) => { if (node instanceof Mesh) for (const m of Array.isArray(node.material) ? node.material : [node.material]) m.dispose(); }); }; }, [object]);
  useEffect(() => { object.traverse((node) => { if (node instanceof Mesh) for (const m of Array.isArray(node.material) ? node.material : [node.material]) if ("wireframe" in m) m.wireframe=inspect; }); }, [object,inspect]);
  useEffect(() => { if (gltf.animations[0]) mixer.clipAction(gltf.animations[0]).play(); return () => { mixer.stopAllAction(); mixer.uncacheRoot(object); }; }, [mixer,object,gltf.animations]);
  useFrame((_,delta) => { if (playing) mixer.update(delta); });
  return <primitive object={object} onClick={(event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect(); }} />;
}
function CameraControl({ sceneState, controls, loaded, reset, capture }: { sceneState: SceneState; controls: RefObject<Controls | null>; loaded: number; reset: number; capture: RefObject<(() => void) | null> }) {
  const { camera, scene, gl, invalidate }=useThree();
  const assets=sceneState.objects.map((o) => `${o.id}:${o.parentId}:${o.assetPath}:${o.visible}:${sceneState.visibility[o.id]}:${JSON.stringify([o.position,o.rotation,o.scale])}`).join("|");
  useEffect(() => {
    const orbit=controls.current;
    if (!orbit || !(camera instanceof PerspectiveCamera)) return;
    scene.updateMatrixWorld(true);
    const box=new Box3();
    if (sceneState.camera.target) { const target=scene.getObjectByName(`object:${sceneState.camera.target}`); if (target) box.setFromObject(target); }
    else for (const object of sceneState.objects) { const node=scene.getObjectByName(`object:${object.id}`); if (node && node.visible && object.assetPath) box.expandByObject(node); }
    if (box.isEmpty()) return;
    const center=box.getCenter(new Vector3()), size=box.getSize(new Vector3());
    const radius=Math.max(size.length()/2,0.05), vertical=camera.fov*Math.PI/360, horizontal=Math.atan(Math.tan(vertical)*camera.aspect);
    const distance=radius/Math.sin(Math.min(vertical,horizontal))*1.2;
    const directions: Record<CameraPreset, Vector3> = { default: new Vector3(1,0.7,1.3), front: new Vector3(0,0,1), back: new Vector3(0,0,-1), left: new Vector3(-1,0,0), right: new Vector3(1,0,0), top: new Vector3(0,1,0.0001) };
    camera.position.copy(center).add(directions[sceneState.camera.preset ?? "default"].normalize().multiplyScalar(distance));
    camera.near=Math.max(distance/10000,0.001); camera.far=Math.max(distance*100,100); camera.updateProjectionMatrix();
    orbit.target.copy(center); orbit.update(); orbit.saveState(); invalidate();
  }, [camera,scene,controls,sceneState.camera.preset,sceneState.camera.target,assets,loaded,reset,invalidate]);
  useEffect(() => {
    capture.current=() => { gl.render(scene,camera); const a=document.createElement("a"); a.href=gl.domElement.toDataURL("image/png"); a.download=`preview-${sceneState.camera.preset ?? "default"}.png`; a.click(); };
    return () => { capture.current=null; };
  }, [capture,gl,scene,camera,sceneState.camera.preset]);
  return null;
}
function Selection({ sceneState, loaded }: { sceneState: SceneState; loaded: number }) {
  const { scene }=useThree();
  const helpers=useRef<BoxHelper[]>([]);
  useEffect(() => {
    helpers.current=[];
    if (sceneState.mode !== "render") for (const id of new Set([...sceneState.selectedIds,...sceneState.highlightedIds])) {
      const node=scene.getObjectByName(`object:${id}`); if (!node) continue;
      const helper=new BoxHelper(node,sceneState.selectedIds.includes(id) ? "#bfc0ff" : "#ffd166"); helper.userData.selectionHelper=true; scene.add(helper); helpers.current.push(helper);
    }
    return () => { for (const helper of helpers.current) { scene.remove(helper); helper.geometry.dispose(); (helper.material as any).dispose(); } helpers.current=[]; };
  }, [scene,sceneState.version,sceneState.mode,loaded,sceneState.selectedIds,sceneState.highlightedIds]);
  useFrame(() => { for (const helper of helpers.current) helper.update(); });
  return null;
}
class ModelBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state={ failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onError(error.message || "Could not load model"); }
  render() { return this.state.failed ? null : this.props.children; }
}
export type { SceneObject };

const meshLibraries=new WeakMap<object,{scene?:Group;pending?:Promise<void>;error?:Error}>();
function displayScene(gltf:{scene?:Object3D;scenes?:Object3D[];parser:{getDependencies(type:string):Promise<any[]>}}):Object3D {
  if(gltf.scene) return gltf.scene;
  if(gltf.scenes?.[0]) return gltf.scenes[0];
  let record=meshLibraries.get(gltf);
  if(!record) {
    record={};meshLibraries.set(gltf,record);
    const entry=record;
    entry.pending=gltf.parser.getDependencies("mesh").then((meshes:Object3D[])=>{
      if(!meshes.length) throw new Error("The GLB contains no displayable scene or mesh.");
      const scene=new Group();for(const mesh of meshes) scene.add(mesh);entry.scene=scene;
    }).catch((error:unknown)=>{entry.error=error instanceof Error ? error : new Error("Could not load GLB mesh library");});
  }
  if(record.error) throw record.error;
  if(!record.scene) throw record.pending;
  return record.scene;
}
class CanvasBoundary extends Component<{children:ReactNode},{error?:string}> {
  state:{error?:string}={};
  static getDerivedStateFromError(error:Error) {return {error:error.message || "3D preview is unavailable"};}
  render() {return this.state.error ? <div role="alert" className="viewport-error">3D preview unavailable: {this.state.error}. Asset downloads and scene controls remain available.</div> : this.props.children;}
}
