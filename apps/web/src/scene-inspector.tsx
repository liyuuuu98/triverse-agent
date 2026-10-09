import { useEffect, useState } from "react";
import type { ScenePatch, SceneState } from "@triverse/protocol";

export function SceneInspector({ scene, onPatch, onSelect }: { scene: SceneState; onPatch: (patch: ScenePatch) => Promise<void>; onSelect: (id: string) => void }) {
  const selected=scene.objects.find((o) => scene.selectedIds.includes(o.id));
  const selectedTransform=JSON.stringify(selected ? [selected.id,selected.position,selected.rotation,selected.scale] : null);
  const [draft,setDraft]=useState<string[]>([]), [busy,setBusy]=useState(false), [error,setError]=useState("");
  useEffect(() => {
    setDraft(selected ? [...(selected.position ?? [0,0,0]),...(selected.rotation ?? [0,0,0]).map((v) => v*180/Math.PI),...(selected.scale ?? [1,1,1])].map((v) => String(Number(v.toFixed(5)))) : []);
    setError("");
  }, [selectedTransform]);
  async function save() {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const values=draft.map((v) => v.trim() ? Number(v) : NaN);
      if (!values.every(Number.isFinite) || values.slice(6).some((v) => v<=0)) throw new Error("Enter finite values and positive scales.");
      const vec=(start: number) => values.slice(start,start+3) as [number,number,number];
      const rotation=vec(3).map((v) => v*Math.PI/180) as [number,number,number];
      await onPatch({ objects: scene.objects.map((object) => object.id===selected.id ? { ...object, position: vec(0), rotation, scale: vec(6) } : object) });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save transform"); }
    finally { setBusy(false); }
  }
  return <aside className="scene-inspector" aria-label="Scene objects">
    <div className="scene-heading"><strong>Scene</strong><select aria-label="Viewport mode" value={scene.mode} onChange={(event) => void onPatch({ mode: event.target.value as SceneState["mode"] }).catch((reason) => setError(reason.message))}><option value="edit">Edit</option><option value="inspect">Wireframe</option><option value="render">Render</option></select></div>
    <div className="scene-object-list">{scene.objects.map((object) => <div className={scene.selectedIds.includes(object.id) ? "scene-object selected" : "scene-object"} key={object.id}>
      <button type="button" className="scene-object-name" aria-pressed={scene.selectedIds.includes(object.id)} onClick={() => onSelect(object.id)}>{object.parentId ? "↳ " : ""}{object.name}</button>
      <button type="button" aria-label={`${object.visible && scene.visibility[object.id]!==false ? "Hide" : "Show"} ${object.name}`} onClick={() => void onPatch({ objects: scene.objects.map((o) => o.id===object.id ? { ...o, visible: !(o.visible && scene.visibility[o.id]!==false) } : o), visibility: { ...scene.visibility, [object.id]: true } }).catch((reason) => setError(reason.message))}>{object.visible && scene.visibility[object.id]!==false ? "●" : "○"}</button>
    </div>)}</div>
    {selected ? <form className="transform-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <strong>{selected.name}</strong>{["Position (m)","Rotation (°)","Scale"].map((label,row) => <fieldset key={label} disabled={busy}><legend>{label}</legend>{["X","Y","Z"].map((axis,column) => { const index=row*3+column; return <label key={axis}>{axis}<input type="number" step="any" aria-label={`${label} ${axis}`} value={draft[index] ?? ""} onChange={(event) => setDraft((current) => current.map((value,i) => i===index ? event.target.value : value))} /></label>; })}</fieldset>)}
      <button type="submit" disabled={busy}>{busy ? "Saving…" : "Apply transform"}</button>
    </form> : <p>Select an object to edit its transform.</p>}
    {error ? <p role="alert" className="scene-error">{error}</p> : null}
  </aside>;
}
