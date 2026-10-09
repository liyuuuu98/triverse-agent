import assert from "node:assert/strict";
import test from "node:test";
import { emptyScene, normalizeScene, applyScenePatch, SceneConflictError } from "@triverse/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readScene, updateScene, writeScene } from "./scene.js";
const object=(id:string) => ({id,name:id,kind:"prop",assetPath:`assets/${id}.glb`,visible:true});
test("legacy scenes migrate consistently and edits reject stale or invalid transforms", () => {
 const original=normalizeScene({...emptyScene("p"),objects:[object("a"),object("b")]},"p");
 assert.deepEqual(original.objects[1].position,[1.6,0,0]);
 const changed=applyScenePatch(original,{expectedVersion:1,objects:[{...original.objects[0],position:[3,4,5],scale:[2,2,2]},original.objects[1]],selectedIds:["a"],activeAssetId:"a"});
 assert.equal(changed.version,2); assert.deepEqual(changed.objects[0].position,[3,4,5]);
 assert.throws(()=>applyScenePatch(changed,{expectedVersion:1,mode:"render"}),SceneConflictError);
 assert.throws(()=>applyScenePatch(original,{objects:[{...object("a"),scale:[0,1,1]}]}),/positive/);
 assert.throws(()=>applyScenePatch(original,{objects:[{...object("a"),position:[NaN,1,1]}]}),/finite/);
 assert.throws(()=>applyScenePatch(original,{selectedIds:["missing"]}),/unknown/);
 assert.throws(()=>applyScenePatch(original,{objects:[{...object("a"),parentId:"b"},{...object("b"),parentId:"a"}]}),/cyclic/);
 assert.throws(()=>applyScenePatch(original,{objects:[{...object("a"),assetPath:"../outside.glb"}]}),/workspace/);
});
test("two simultaneous edits cannot both overwrite one scene version",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"scene-concurrency-"));
 try { const file=path.join(dir,"scene.json"); await writeScene(file,"p",emptyScene("p"));
 const results=await Promise.allSettled(["inspect","render"].map(mode=>updateScene(file,"p",scene=>applyScenePatch(scene,{expectedVersion:1,mode}))));
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1); assert.equal((await readScene(file,"p")).version,2);
 } finally {await rm(dir,{recursive:true,force:true});}
});
