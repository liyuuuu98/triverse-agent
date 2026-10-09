import { defineTool } from "@earendil-works/pi-coding-agent";
import { applyScenePatch, type AgentEvent, type TaskRecord } from "@triverse/protocol";
import { Type } from "typebox";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { atomicJson, jsonFile, controlDir } from "./storage.js";
import { exclusive, updateScene } from "./scene.js";
import { agentDirFor, callMcpTool } from "./mcp.js";
import { realInside, resolveInside } from "./paths.js";
import { inspectGlb } from "./inspect.js";
import { transfer } from "./transfer.js";
import type { StoredApproval } from "./projects.js";

type Call=(name: string,args: Record<string,unknown>)=>Promise<any>;
interface Operation { id: string; flow: string; arguments: Record<string,unknown>; task?: any; lookup?: string; billing?: any; recoveryAction?: string; error?: string; updatedAt: string }
interface ExportIntent { id: string; taskId: string; source: {asset_id:string;item_id:string}; sent: boolean; approved: boolean; declined?: boolean; result?: any; assetPath?: string; error?: string; nextAt?: number }
const digest=(bytes: Buffer|string)=>createHash("sha256").update(bytes).digest("hex");
export async function recordCreation(approvalsFile: string, tool: string, args: Record<string,unknown>): Promise<boolean> {
  const file=path.join(path.dirname(approvalsFile),"operations.json");
  return exclusive(file,async()=>{
    const records=await jsonFile<Operation[]>(file,[]), id=String(args.operation_id).toLowerCase();
    if (records.some(item=>item.id.toLowerCase()===id)) return false;
    records.push({id,flow:tool.replace("mcp__triverse__create_",""),arguments:args,updatedAt:new Date().toISOString()});
    await atomicJson(file,records);return true;
  });
}
export class Workflow {
  readonly root: string; readonly call: Call;
  readonly workspace: string;
  readonly emit: (event:AgentEvent)=>void;
  constructor(workspace: string,emit: (event:AgentEvent)=>void=()=>{}, dependencies?: {call?:Call;transfer?: typeof transfer}) {
    this.workspace=workspace;
    this.emit=emit;
    this.root=controlDir(workspace);
    this.call=dependencies?.call ?? ((name,args)=>callMcpTool(agentDirFor(path.resolve(workspace,"../../..")),name,args));
    this.transfer=dependencies?.transfer ?? transfer;
  }
  readonly transfer: typeof transfer;
  async upload(relative: string): Promise<any> {
    const file=await realInside(this.workspace,resolveInside(this.workspace,relative));
    if ((await stat(file)).size>20_971_520) throw new Error("Reference image exceeds 20 MB.");
    const bytes=await readFile(file), sha=digest(bytes);
    const mime=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : bytes[0]===255 && bytes[1]===216 && bytes[2]===255 ? "image/jpeg" : bytes.subarray(0,4).toString()==="RIFF" && bytes.subarray(8,12).toString()==="WEBP" ? "image/webp" : bytes.subarray(4,8).toString()==="ftyp" && bytes.subarray(8,32).includes(Buffer.from("avif")) ? "image/avif" : undefined;
    if (!mime) throw new Error("Use a PNG, JPEG, WebP or AVIF reference; GIF is not supported for generation.");
    const ledger=path.join(this.root,`upload-${sha}.json`);
    return exclusive(ledger,async()=>{
      let state=await jsonFile<any>(ledger,null);
      if (!state) {state={request_id:randomUUID(),attempt_id:randomUUID(),sha256:sha,size_bytes:bytes.length,content_type:mime};await atomicJson(ledger,state);}
      if (!state.input_session_id) {const input=await this.call("start_image_input",{request_id:state.request_id});state.input_session_id=input.input_session_id;await atomicJson(ledger,state);}
      const identity={input_session_id:state.input_session_id,attempt_id:state.attempt_id};
      if (state.sent) {
        const result=await this.call("finalize_local_upload",{...identity,query_only:true});
        return this.verifyUpload(result,state);
      }
      // Mark before the non-idempotent prepare/PUT sequence. Recovery only queries.
      state.sent=true;await atomicJson(ledger,state);
      const lease=await this.call("prepare_local_upload",{...identity,filename:path.basename(file),content_type:mime,size_bytes:bytes.length,sha256:sha});
      if (lease.sha256!==sha || lease.size_bytes!==bytes.length) throw new Error("Upload lease fingerprint differs from the reference.");
      if (lease.action === "UPLOAD_REQUIRED") {
        if (!lease.upload_url || !lease.upload_origin || new URL(lease.upload_url).origin!==new URL(lease.upload_origin).origin) throw new Error("Upload lease origin mismatch.");
        await this.transfer(lease.upload_url,{bytes,headers:lease.put_headers ?? {},limit:1_000_000});
      } else if (lease.action !== "REUSE_READY") throw new Error("Upload fingerprint was rejected.");
      const result=await this.call("finalize_local_upload",{...identity,query_only:false});
      return this.verifyUpload(result,state);
    });
  }
  verifyUpload(result: any,state:any) {
    if (result.verified_sha256!==state.sha256 || result.verified_size_bytes!==state.size_bytes || result.verified_content_type!==state.content_type || result.input_session?.state!=="ready" || !result.input_session?.source) throw new Error("Upload is not verified READY. Keep the same session/attempt and query again; do not invent a new attempt.");
    return {input_session_id:state.input_session_id,state:"ready",source:result.input_session.source,sha256:state.sha256};
  }
  async requestExport(taskId:string,source:ExportIntent["source"]): Promise<ExportIntent> {
    const ledger=path.join(this.root,"exports.json");
    return exclusive(ledger,async()=>{
      const records=await jsonFile<ExportIntent[]>(ledger,[]);
      let item=records.find(item=>item.taskId===taskId && item.source.asset_id===source.asset_id && item.source.item_id===source.item_id);
      if (!item) {item={id:randomUUID(),taskId,source,sent:false,approved:false};records.push(item);await atomicJson(ledger,records);}
      if (!item.approved) {
        const file=path.join(this.root,"approvals.json");
        const approval=await exclusive(file,async()=>{
          const approvals=await jsonFile<StoredApproval[]>(file,[]);
          let approval=approvals.find(approval=>approval.tool==="deliver_asset" && approval.arguments?.export_id===item!.id);
          if (!approval) {approval={id:randomUUID(),tool:"deliver_asset",summary:"Export and download original model · may consume export quota",quote:{task_id:taskId,source,target_format:null,conversion:false,notice:"MCP has no export quote API. Export may consume account quota; no automatic conversion/retry is allowed."},arguments:{export_id:item!.id},granted:false,used:false};approvals.push(approval);await atomicJson(file,approvals);}
          return approval;
        });
        if (approval.used && !approval.granted) {item.declined=true;await atomicJson(ledger,records);}
        else if (!approval.granted) this.emit({type:"approval",approval});
      }
      return item;
    });
  }
  async approveExport(exportId:string): Promise<any> {
    const file=path.join(this.root,"exports.json");
    await exclusive(file,async()=>{
      const exports=await jsonFile<ExportIntent[]>(file,[]),item=exports.find(item=>item.id===exportId);
      const approvals=await jsonFile<StoredApproval[]>(path.join(this.root,"approvals.json"),[]);
      const grant=approvals.find(item=>item.tool==="deliver_asset" && item.arguments?.export_id===exportId && item.granted);
      if (!item || !grant) throw new Error("Export requires a user-approved persisted intent.");
      item.approved=true;await atomicJson(file,exports);
    });
    return this.deliver(exportId);
  }
  async deliver(exportId:string): Promise<any> {
    const ledger=path.join(this.root,"exports.json");
    return exclusive(ledger,async()=>{
      const records=await jsonFile<ExportIntent[]>(ledger,[]),item=records.find(item=>item.id===exportId);
      if (!item?.approved) throw new Error("Export intent is not approved.");
      if (item.assetPath) return {path:item.assetPath,export_id:exportId};
      if ((item.nextAt ?? 0)>Date.now()) return {export_id:exportId,state:"waiting"};
      try {
        let result: any;
        if (item.sent) result=await this.call("get_export",{export_id:item.id});
        else {item.sent=true;await atomicJson(ledger,records);result=await this.call("export_model",{export_id:item.id,task_id:item.taskId,source:item.source,target_format:null,retry_failed_conversion:false});}
        if (result.export_id!==item.id || result.source?.asset_id!==item.source.asset_id || result.source?.item_id!==item.source.item_id) throw new Error("Export identity differs from the approved intent.");
        // Persist no expiring URLs or leases in agent-readable files.
        item.result={delivery_status:result.delivery_status,billing:result.billing,points_charged:result.points_charged,quota:result.quota,next_action:result.next_action};
        item.nextAt=Date.now()+Math.max(15,result.retry_after_seconds ?? 15)*1000;
        if (result.delivery_status!=="ready") {await atomicJson(ledger,records);return item.result;}
        const manifest=result.files?.filter((file:any)=>String(file.format).toUpperCase()==="GLB");
        if (!manifest?.length || manifest.length!==1) throw new Error("Export needs exactly one original GLB. Conversion or ambiguous candidates require a separate user decision.");
        const file=manifest[0];
        if (file.expires_at && Date.parse(file.expires_at)<=Date.now()) throw new Error("Export file expired; query the same export again.");
        if (file.size_bytes && file.size_bytes>200_000_000) throw new Error("Export exceeds 200 MB.");
        const bytes=await this.transfer(file.url);
        if ((file.size_bytes!==null && file.size_bytes!==undefined && bytes.length!==file.size_bytes) || (file.sha256 && digest(bytes)!==file.sha256)) throw new Error("Downloaded export fingerprint mismatch.");
        const report=inspectGlb(bytes);
        if (report.warnings.some(warning=>/external|missing buffers/i.test(warning))) throw new Error("Export GLB has external dependencies; delivery is incomplete.");
        const relative=`assets/generated/${item.id}/${digest(bytes)}.glb`;
        const destination=await realInside(this.workspace,resolveInside(this.workspace,relative));await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,bytes,{flag:"wx"}).catch(async(error)=>{if(error.code!=="EEXIST" || digest(await readFile(destination))!==digest(bytes)) throw error;});
        const objectId=`generated-${item.id}`;
        const scene=await updateScene(path.join(this.workspace,"scene/scene.json"),path.basename(path.dirname(this.workspace)),current=>{
          if (current.objects.some(object=>object.id===objectId)) return current;
          return applyScenePatch(current,{objects:[...current.objects,{id:objectId,name:`Model ${item.source.item_id}`,kind:"prop",assetPath:relative,visible:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}],selectedIds:[objectId],activeAssetId:objectId});
        });
        const historyFile=path.join(this.root,"versions.json");
        await exclusive(historyFile,async()=>{
          const versions=await jsonFile<any[]>(historyFile,[]);
          if(!versions.some(version=>version.id===item.id)) {versions.push({id:item.id,path:relative,createdAt:new Date().toISOString(),note:`Generated result ${item.source.asset_id}/${item.source.item_id}`,sha256:digest(bytes),taskId:item.taskId,source:item.source,exportId:item.id});await atomicJson(historyFile,versions);}
        });
        this.emit({type:"scene",scene});item.assetPath=relative;delete item.error;
        await atomicJson(ledger,records);return {path:relative,export_id:item.id,report};
      } catch {item.error="Export observation or delivery failed. Query the same export intent; no automatic paid retry.";await atomicJson(ledger,records);return {export_id:item.id,error:item.error};}
    });
  }
  async sync(): Promise<TaskRecord[]> {
    const ledger=path.join(this.root,"operations.json");
    return exclusive(`workflow-sync:${this.root}`,async()=>{
      const records=await jsonFile<Operation[]>(ledger,[]);
      if (!records.length) {
        for (const item of await jsonFile<ExportIntent[]>(path.join(this.root,"exports.json"),[])) if(item.approved && !item.assetPath) await this.deliver(item.id);
        return jsonFile<TaskRecord[]>(path.join(this.root,"tasks.json"),[]);
      }
      for (const item of records) {
        if ((item.task?.result_availability === "complete" || /^(failed|cancelled|canceled|rejected)$/i.test(item.task?.status ?? "")) && item.billing?.status && item.billing.status!=="pending") continue;
        try {
          const operation=await this.call("get_operation",{operation_id:item.id});
          if (operation.operation_id!==item.id) throw new Error("Operation identity mismatch");
          item.lookup=operation.lookup;item.billing=operation.billing;item.recoveryAction=operation.recovery_action;
          const taskId=operation.task?.task_id;
          if (taskId) {const task=await this.call("refresh_task",{task_id:taskId});if(task.task_id!==taskId) throw new Error("Task identity mismatch");item.task=task;item.billing=task.billing ?? item.billing;}
          delete item.error;
          for (const result of item.task?.results ?? []) if (result.task_id===item.task.task_id) await this.requestExport(result.task_id,{asset_id:result.asset_id,item_id:result.item_id});
        } catch {item.error="Task synchronization failed. The original operation is retained; creation will not be repeated.";}
        item.updatedAt=new Date().toISOString();
      }
      const merged=await exclusive(ledger,async()=>{
        const latest=await jsonFile<Operation[]>(ledger,[]);
        for(const observed of records) {const index=latest.findIndex(item=>item.id===observed.id);if(index>=0) latest[index]={...latest[index],...observed};}
        await atomicJson(ledger,latest);return latest;
      });
      const tasks=merged.map(item=>({id:item.task?.task_id ?? item.id,flow:item.flow,status:item.error ? "sync-error" : item.task?.status ?? item.lookup ?? "acceptance-unknown",updatedAt:item.updatedAt,operationId:item.id,billing:item.billing,recoveryAction:item.recoveryAction,results:item.task?.results ?? [],error:item.error}));

      const exports=await jsonFile<ExportIntent[]>(path.join(this.root,"exports.json"),[]);
      for (const item of exports) if (item.approved && !item.assetPath) await this.deliver(item.id);
      const delivered=await jsonFile<ExportIntent[]>(path.join(this.root,"exports.json"),[]);
      for (const task of tasks) {const assets=delivered.filter(item=>item.taskId===task.id && item.assetPath);if(assets[0]) Object.assign(task,{assetPath:assets[0].assetPath});}
      await atomicJson(path.join(this.root,"tasks.json"),tasks);
      return tasks;
    });
  }
}
export function createWorkflowTools(workspace:string,emit?:(event:AgentEvent)=>void) {
  const workflow=new Workflow(workspace,emit);
  const tool=(name:string,description:string,parameters:any,run:(args:any)=>Promise<any>)=>defineTool({name,label:name,description,promptSnippet:description,executionMode:"sequential",parameters,execute:async(_id,args)=>{try{return {content:[{type:"text" as const,text:JSON.stringify(await run(args))}],details:{}};}catch{return {content:[{type:"text" as const,text:`${name} failed. Keep the original intent and use task recovery. No paid creation was repeated.`}],details:{},isError:true};}}});
  return [tool("upload_reference","Upload a workspace PNG/JPEG/WebP/AVIF using verified MCP intake. Keeps upload leases hidden and returns only a verified READY source.",Type.Object({path:Type.String()}),args=>workflow.upload(args.path)),tool("sync_tasks","Observe persisted approved operations and refresh tasks; resume downloads. Never retries paid creation.",Type.Object({}),()=>workflow.sync()),tool("deliver_asset","Request user review of an original model export, or continue a previously approved export. Conversion and retries are never automatic.",Type.Object({task_id:Type.String(),asset_id:Type.String(),item_id:Type.String()}),async args=>{const intent=await workflow.requestExport(args.task_id,{asset_id:args.asset_id,item_id:args.item_id});return intent.approved ? workflow.deliver(intent.id) : {export_id:intent.id,state:intent.declined ? "declined" : "needs_confirmation"};})];
}
