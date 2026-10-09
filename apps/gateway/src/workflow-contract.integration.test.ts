import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Workflow, recordCreation } from "./workflow.js";
import { grantMcpApproval } from "./mcp-approval.js";
import { controlDir, jsonFile, atomicJson } from "./storage.js";
import { validateSchema } from "./schema.js";
import { readScene } from "./scene.js";
import { meshFixture } from "./asset-fixtures.js";

const snapshot=JSON.parse(await readFile(fileURLToPath(new URL("../../../docs/mcp-tool-snapshot-2026-10-09.json",import.meta.url)),"utf8"));
const sha=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
function validate(name:string,args:Record<string,unknown>) {const tool=snapshot.tools.find((tool:any)=>tool.name===name); assert.ok(tool,name);validateSchema(args,tool.inputSchema);}
async function fixture() {const dir=await mkdtemp(path.join(tmpdir(),"workflow-contract-")),workspace=path.join(dir,"project/workspace");await mkdir(workspace,{recursive:true});return {dir,workspace};}

test("reference upload verifies READY fingerprints and resumes by querying the original attempt",async()=>{
 const {dir,workspace}=await fixture();
 try {
  const image=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==","base64");
  await mkdir(path.join(workspace,"refs"));await writeFile(path.join(workspace,"refs/input.png"),image);
  const calls:{name:string;args:Record<string,unknown>}[]=[], session="12345678-1234-1234-1234-123456789abc",source={asset_id:"image",item_id:"original",file_id:"file"};
  let sent=0, uncertain=true;
  const deps={call:async(name:string,args:Record<string,unknown>)=>{
   validate(name,args);calls.push({name,args});
   if(name==="start_image_input") return {input_session_id:session};
   if(name==="prepare_local_upload") return {action:"UPLOAD_REQUIRED",sha256:sha(image),size_bytes:image.length,upload_url:"https://files.example/reference",upload_origin:"https://files.example",put_headers:{}};
   if(name==="finalize_local_upload") {if(uncertain) {uncertain=false;throw new Error("uncertain response");}return {verified_sha256:sha(image),verified_size_bytes:image.length,verified_content_type:"image/png",input_session:{state:"ready",source}};}
   throw new Error(name);
  },transfer:async(_url:string,options:any)=>{assert.deepEqual(options.bytes,image);sent++;return Buffer.alloc(0);}};
  await assert.rejects(new Workflow(workspace,()=>{},deps).upload("refs/input.png"),/uncertain response/);
  const ready=await new Workflow(workspace,()=>{},deps).upload("refs/input.png");assert.deepEqual(ready.source,source);
  assert.equal(sent,1);assert.equal(calls.filter(c=>c.name==="prepare_local_upload").length,1);
  const final=calls.filter(c=>c.name==="finalize_local_upload");assert.equal(final[1].args.query_only,true);assert.equal(final[1].args.attempt_id,final[0].args.attempt_id);
  await assert.rejects(new Workflow(workspace,()=>{},deps).upload("../outside.png"),/escapes workspace/);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test("approved exports recover with the same id, reject bad bytes and register one model and version",async()=>{
 const {dir,workspace}=await fixture();
 try {
  const bytes=meshFixture(),source={asset_id:"asset",item_id:"item"};const calls:string[]=[];let exportId="",bad=true;
  const deps={call:async(name:string,args:Record<string,unknown>)=>{
   validate(name,args);calls.push(name);exportId=String(args.export_id);
   return {export_id:exportId,source,delivery_status:"ready",files:[{format:"GLB",url:"https://files.example/model",size_bytes:bytes.length,sha256:sha(bytes)}]};
  },transfer:async()=>bad ? Buffer.alloc(bytes.length) : bytes};
  const workflow=new Workflow(workspace,()=>{},deps);
  const intent=await workflow.requestExport("task",source);assert.equal(calls.length,0);
  assert.equal((await workflow.requestExport("task",source)).id,intent.id);
  const approvalsFile=path.join(controlDir(workspace),"approvals.json");
  const [approval]=await jsonFile<any[]>(approvalsFile,[]);await grantMcpApproval({approvalsFile},approval.id);
  const failed=await workflow.approveExport(intent.id);assert.ok(failed.error);
  assert.equal((await readScene(path.join(workspace,"scene/scene.json"),"project")).objects.length,0);
  const ledger=path.join(controlDir(workspace),"exports.json"),exports=await jsonFile<any[]>(ledger,[]);exports[0].nextAt=0;await atomicJson(ledger,exports);
  bad=false;
  const recovered=await new Workflow(workspace,()=>{},deps).deliver(intent.id);assert.ok(recovered.path);
  assert.equal(exportId,intent.id);assert.deepEqual(calls,["export_model","get_export"]);
  assert.deepEqual(await readFile(path.join(workspace,recovered.path)),bytes);
  assert.equal((await readScene(path.join(workspace,"scene/scene.json"),"project")).objects.length,1);
  assert.equal((await jsonFile<any[]>(path.join(controlDir(workspace),"versions.json"),[])).length,1);
  await workflow.deliver(intent.id);assert.deepEqual(calls,["export_model","get_export"]);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test("uncertain creation recovery only observes its original operation and never resubmits",async()=>{
 const {dir,workspace}=await fixture();
 try {
  const approvalsFile=path.join(controlDir(workspace),"approvals.json"),operation_id="12345678-1234-1234-1234-123456789abc";
  assert.equal(await recordCreation(approvalsFile,"mcp__triverse__create_text_to_model",{operation_id}),true);
  assert.equal(await recordCreation(approvalsFile,"mcp__triverse__create_text_to_model",{operation_id}),false);
  const calls:string[]=[];
  const workflow=new Workflow(workspace,()=>{},{call:async(name,args)=>{validate(name,args);calls.push(name);if(name==="get_operation") return {operation_id,lookup:"found",task:{task_id:"task"},billing:{status:"pending"}};return {task_id:"task",status:"running",results:[],billing:{status:"pending"}};}});
  const tasks=await workflow.sync();assert.equal(tasks[0].operationId,operation_id);assert.equal(tasks[0].status,"running");
  assert.deepEqual(calls,["get_operation","refresh_task"]);
 } finally {await rm(dir,{recursive:true,force:true});}
});
