import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { syncSkills } from "./skill-catalog.js";
import { skillStatus } from "./skill-status.js";
import { createAgentTools } from "./agent.js";
import { projectPaths } from "./projects.js";

test("skill synchronization removes retired instructions, copies resources, preserves custom skills and enforces requirements",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"triverse-skills-")),source=path.join(dir,"source"),workspace=path.join(dir,"workspace");
 try {
  await mkdir(path.join(source,"current","references"),{recursive:true});await mkdir(path.join(workspace,".triverse","skills","retired"),{recursive:true});await mkdir(path.join(workspace,".triverse","skills","custom"),{recursive:true});
  await writeFile(path.join(source,"current","SKILL.md"),"---\nname: current\ndescription: Current skill\n---\n");await writeFile(path.join(source,"current","references","contract.json"),"{}");await writeFile(path.join(source,"catalog.json"),JSON.stringify({version:2,retiredNames:["retired"],skills:[{name:"current",requiresTools:["remote-tool"]}]}));
  await syncSkills(source,workspace);
  await assert.rejects(readFile(path.join(workspace,".triverse/skills/retired/SKILL.md")));
  assert.equal(await readFile(path.join(workspace,".triverse/skills/current/references/contract.json"),"utf8"),"{}");
  const status=skillStatus({name:"current",description:"Current skill",filePath:path.join(workspace,".triverse/skills/current/SKILL.md")},[]);
  assert.equal(status.status,"needs-tools");assert.deepEqual(status.missingTools,["remote-tool"]);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test("generic tools cannot forge approvals, change scene metadata or overwrite snapshots",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"triverse-metadata-")),workspace=path.join(dir,"workspace");
 try {
  await mkdir(workspace,{recursive:true});
  const paths=projectPaths(dir,"fixture");assert.ok(!paths.approvalsFile.startsWith(paths.workspace+path.sep));
  const tool=createAgentTools({workspace}).find(tool=>tool.name==="write")!;
  for(const relative of [".triverse/approvals.json","versions/snapshot.glb","scene/scene.json","AGENTS.md","assets/generated/model.glb","../control/approvals.json"]) {
   await assert.rejects(tool.execute("deny",{path:relative,content:"forged"},undefined,undefined,undefined as never), /Protected workspace metadata|path escapes workspace/, relative);
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});
