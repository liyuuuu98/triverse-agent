import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { createLocalAssetTools } from "./tools.js";
import { meshFixture } from "./asset-fixtures.js";
import { readScene } from "./scene.js";
test("an existing GLB can be staged, snapshotted and packed without changing the source",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"asset-workflow-")),workspace=path.join(dir,"project","workspace");
 try {await mkdir(path.join(workspace,"assets"),{recursive:true}); const original=meshFixture(); await writeFile(path.join(workspace,"assets/prop.glb"),original);
 const tools=createLocalAssetTools({workspace});
 async function run(name:string,args:Record<string,unknown>) {const t=tools.find(t=>t.name===name)!; const result=await t.execute("test",args,undefined,undefined,undefined as never); assert.equal(result.isError,undefined,JSON.stringify(result)); return JSON.parse((result.content[0] as {text:string}).text);}
 const added=await run("add_scene_asset",{path:"assets/prop.glb",name:"Prop",id:"prop",position:[3,0,0]}); assert.equal(added.scene.objects.length,1);
 await run("add_scene_asset",{path:"assets/prop.glb",name:"Prop",id:"prop",position:[4,0,0]}); assert.equal((await readScene(path.join(workspace,"scene/scene.json"),"project")).objects.length,1);
 const snapshot=await run("save_asset_version",{path:"assets/prop.glb"}); assert.deepEqual(await readFile(path.join(workspace,snapshot.version.path)),original);
 await writeFile(path.join(workspace,"assets/parent.glb"),original);
 const before=await run("read_scene",{});
 await run("update_scene",{patch:{expectedVersion:before.version,objects:[{id:"parent",name:"Parent",kind:"prop",visible:true,assetPath:"assets/parent.glb",position:[10,0,0]}, {...before.objects[0],parentId:"parent"}]}});
 const packed=await run("export_asset_pack",{paths:["assets/prop.glb"],triangle_budget:1}); const archive=unzipSync(await readFile(path.join(workspace,packed.path)));
 assert.deepEqual(Buffer.from(archive["assets/prop.glb"]),original); const manifest=JSON.parse(Buffer.from(archive["manifest.json"]).toString()); assert.equal(manifest.assets[0].withinTriangleBudget,true); assert.equal(manifest.printabilityVerified,false);
 const scene=JSON.parse(Buffer.from(archive["scene.json"]).toString());
 assert.equal(scene.objects.find((o:any)=>o.id==="prop").parentId,"parent");
 assert.deepEqual(scene.objects.find((o:any)=>o.id==="parent").position,[10,0,0]);
 assert.equal(scene.objects.find((o:any)=>o.id==="parent").assetPath,undefined);
 assert.equal(archive["assets/parent.glb"],undefined);
 assert.deepEqual(await readFile(path.join(workspace,"assets/prop.glb")),original);
 await writeFile(path.join(dir,"outside.glb"),original); await symlink(path.join(dir,"outside.glb"),path.join(workspace,"assets/escape.glb"));
 const inspect=tools.find(t=>t.name==="inspect_asset")!; const escaped=await inspect.execute("test",{path:"assets/escape.glb"},undefined,undefined,undefined as never); assert.equal(escaped.isError,true);
 } finally {await rm(dir,{recursive:true,force:true});}
});
