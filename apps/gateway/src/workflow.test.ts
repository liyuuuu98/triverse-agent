import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { Workflow, recordCreation } from "./workflow.js";
import { atomicJson, jsonFile, controlDir } from "./storage.js";
import { grantMcpApproval, createMcpApprovalExtension, createCreationApprovalTool, consumeMcpApproval } from "./mcp-approval.js";
import { projectPaths, type StoredApproval } from "./projects.js";
import { readScene } from "./scene.js";
import { publicAddress, transfer } from "./transfer.js";
const hash=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
const fixture=async()=>{const dir=await mkdtemp(path.join(tmpdir(),"triverse-workflow-")),workspace=path.join(dir,"projects","fixture","workspace");await mkdir(workspace,{recursive:true});return {dir,workspace};};
function glb() {
 const binary=Buffer.alloc(36);[0,0,0,1,0,0,0,1,0].forEach((value,index)=>binary.writeFloatLE(value,index*4));
 const json=Buffer.from(JSON.stringify({asset:{version:"2.0"},buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:"VEC3",min:[0,0,0],max:[1,1,0]}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0}));
 const padded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+binary.length,8);jh.writeUInt32LE(padded.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,jh,padded,bh,binary]);
}
test("upload intake verifies the fingerprint and recovers uncertain preparation without a second PUT",async()=>{
 const {dir,workspace}=await fixture();
 try {
  const bytes=Buffer.from([137,80,78,71,13,10,26,10,1]);await mkdir(path.join(workspace,"refs"));await writeFile(path.join(workspace,"refs/input.png"),bytes);
  const calls:string[]=[],source={asset_id:"image",item_id:"item",file_id:"file"};let fail=true,put=0;
  const call=async(name:string,args:any)=>{calls.push(name);if(name==="start_image_input")return {input_session_id:randomUUID()};if(name==="prepare_local_upload"){if(fail){fail=false;throw new Error("response lost");}throw new Error("prepare repeated");}if(name==="finalize_local_upload"){assert.equal(args.query_only,true);return {input_session:{state:"ready",source},verified_sha256:hash(bytes),verified_size_bytes:bytes.length,verified_content_type:"image/png"};}throw new Error(name);};
  const workflow=new Workflow(workspace,undefined,{call,transfer:async()=>{put++;return Buffer.alloc(0);}});
  await assert.rejects(workflow.upload("refs/input.png"));const result=await workflow.upload("refs/input.png");assert.deepEqual(result.source,source);assert.equal(put,0);assert.equal(calls.filter(name=>name==="prepare_local_upload").length,1);
 }finally {await rm(dir,{recursive:true,force:true});}
});
test("task recovery persists billing, reviews export, verifies download and inserts exactly one scene object",async()=>{
 const {dir,workspace}=await fixture();
 try {
  const bytes=glb(),operationId=randomUUID(),calls:string[]=[],source={asset_id:"asset",item_id:"item"};let exportId="",sent=0;
  const call=async(name:string,args:any)=>{calls.push(name);if(name==="get_operation")return {operation_id:operationId,lookup:"found",task:{task_id:"task"},billing:{status:"settled",credits_amount:12}};if(name==="refresh_task")return {task_id:"task",status:"succeeded",result_availability:"complete",billing:{status:"settled",credits_amount:12},results:[{task_id:"task",...source}]};if(name==="export_model"){sent++;exportId=args.export_id;assert.equal(args.target_format,null);throw new Error("accepted but response lost");}if(name==="get_export"){assert.equal(args.export_id,exportId);return {export_id:exportId,source,delivery_status:"ready",files:[{format:"GLB",url:"https://files.example/model.glb",sha256:hash(bytes),size_bytes:bytes.length}]};}throw new Error(name);};
  await recordCreation(path.join(controlDir(workspace),"approvals.json"),"mcp__triverse__create_text_to_model",{operation_id:operationId});
  const workflow=new Workflow(workspace,undefined,{call,transfer:async()=>bytes});const tasks=await workflow.sync();assert.equal(tasks[0].status,"succeeded");assert.equal(calls.includes("export_model"),false);
  const approvals=await jsonFile<StoredApproval[]>(path.join(controlDir(workspace),"approvals.json"),[]);assert.equal(approvals.length,1);
  await grantMcpApproval({approvalsFile:path.join(controlDir(workspace),"approvals.json")},approvals[0].id);
  await workflow.approveExport(String(approvals[0].arguments?.export_id));const delivered=await workflow.deliver(exportId);assert.ok(delivered.path);assert.equal(sent,1);assert.deepEqual(await readFile(path.join(workspace,delivered.path)),bytes);
  await workflow.deliver(exportId);const scene=await readScene(path.join(workspace,"scene/scene.json"),"fixture");assert.equal(scene.objects.length,1);assert.equal(scene.objects[0].assetPath,delivered.path);assert.equal((await jsonFile<any[]>(path.join(controlDir(workspace),"versions.json"),[])).length,1);
  assert.equal(calls.filter(name=>name.startsWith("create_")).length,0);
 }finally {await rm(dir,{recursive:true,force:true});}
});
test("download fingerprint mismatch never reaches the scene",async()=>{
 const {dir,workspace}=await fixture();
 try {
  const workflow=new Workflow(workspace,undefined,{call:async(name,args)=>({export_id:args.export_id,source:{asset_id:"a",item_id:"i"},delivery_status:"ready",files:[{format:"GLB",url:"https://files.example/model.glb",size_bytes:10,sha256:"0".repeat(64)}]}),transfer:async()=>glb()});
  const intent=await workflow.requestExport("t",{asset_id:"a",item_id:"i"});const approval=(await jsonFile<StoredApproval[]>(path.join(controlDir(workspace),"approvals.json"),[]))[0];await grantMcpApproval({approvalsFile:path.join(controlDir(workspace),"approvals.json")},approval.id);const result=await workflow.approveExport(intent.id);assert.ok(result.error);assert.equal((await readScene(path.join(workspace,"scene/scene.json"),"fixture")).objects.length,0);
 }finally {await rm(dir,{recursive:true,force:true});}
});
test("real 23-tool MCP contract binds full prompt and max credits; expiry and operation reuse are rejected",async()=>{
 const {dir}=await fixture();
 try {
  const snapshot=JSON.parse(await readFile(new URL("../../../docs/mcp-tool-snapshot-2026-10-09.json",import.meta.url),"utf8"));const tools=(snapshot.tools ?? snapshot).map((tool:any)=>({name:`mcp__triverse__${tool.name}`,parameters:tool.inputSchema}));
  const handlers=new Map<string,any>(),paths=projectPaths(dir,"fixture");await createMcpApprovalExtension(paths,()=>{})({on:(name:string,fn:any)=>handlers.set(name,fn),getAllTools:()=>tools} as any);
  const quoteName="mcp__triverse__quote_text_to_model",createName="mcp__triverse__create_text_to_model",quoteInput={profile_id:"profile",visibility:"private"};
  await handlers.get("tool_call")({toolName:quoteName,toolCallId:"q",input:quoteInput});await handlers.get("tool_result")({toolName:quoteName,toolCallId:"q",input:quoteInput,isError:false,content:[],structuredContent:{data:{credits_cost:12}}});
  const quotes=await jsonFile<any[]>(path.join(path.dirname(paths.approvalsFile),"quotes.json"),[]),args={...quoteInput,prompt:"A wooden crate",operation_id:randomUUID(),max_credits:12};const tool=createCreationApprovalTool(paths);
  const invalid=await tool.execute("bad",{quote_id:quotes[0].id,arguments:{...args,name:42}});assert.equal(invalid.isError,true);
  const requested=await tool.execute("good",{quote_id:quotes[0].id,arguments:args});assert.equal(requested.isError,undefined);await grantMcpApproval(paths,requested.details.approval!.id);
  assert.equal(await consumeMcpApproval(paths,createName,{...args,prompt:"A car"}),false);assert.equal(await consumeMcpApproval(paths,createName,args),true);assert.equal(await consumeMcpApproval(paths,createName,args),false);
  const records=await jsonFile<StoredApproval[]>(paths.approvalsFile,[]);records[0].used=false;await atomicJson(paths.approvalsFile,records);assert.equal(await consumeMcpApproval(paths,createName,args),false);
  records[0].arguments={...args,operation_id:randomUUID(),name:null};records[0].expiresAt=new Date(0).toISOString();await atomicJson(paths.approvalsFile,records);assert.equal(await consumeMcpApproval(paths,createName,records[0].arguments!),false);
 }finally {await rm(dir,{recursive:true,force:true});}
});
test("transfer refuses private networks and non-HTTPS URLs",async()=>{
 for(const address of ["127.0.0.1","10.0.0.1","169.254.169.254","192.168.1.2","::1","::ffff:127.0.0.1","fe80::1"])assert.equal(publicAddress(address),false,address);
 assert.equal(publicAddress("8.8.8.8"),true);await assert.rejects(transfer("http://127.0.0.1/file"),/public HTTPS/);await assert.rejects(transfer("https://127.0.0.1/file"),/public address/);
});

test("background observation does not block new paid intents or overwrite concurrent operation inserts",async()=>{
 const {dir,workspace}=await fixture();
 try {
  const file=path.join(controlDir(workspace),"approvals.json"),first=randomUUID(),second=randomUUID();
  await recordCreation(file,"mcp__triverse__create_text_to_model",{operation_id:first});
  const workflow=new Workflow(workspace,undefined,{call:async(name,args)=>{
    if(name==="get_operation") {
      // This would deadlock if the worker held operations.json across network calls.
      assert.equal(await recordCreation(file,"mcp__triverse__create_text_to_model",{operation_id:second}),true);
      return {operation_id:args.operation_id,lookup:"not_found",billing:null};
    }
    throw new Error(name);
  }});
  await workflow.sync();
  const operations=await jsonFile<any[]>(path.join(controlDir(workspace),"operations.json"),[]);
  assert.deepEqual(new Set(operations.map(operation=>operation.id)),new Set([first,second]));
 }finally{await rm(dir,{recursive:true,force:true});}
});
