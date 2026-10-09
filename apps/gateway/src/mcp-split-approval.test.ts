import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCreationApprovalTool, createMcpApprovalExtension, grantMcpApproval } from "./mcp-approval.js";
import { projectPaths, readJson, writeJson } from "./projects.js";

test("split quotes bind prompt, defaults, visibility and budget to a single approved creation", async () => {
  const dir=await mkdtemp(path.join(tmpdir(),"split-approval-"));
  try {
    const paths=projectPaths(dir,"fixture"); await mkdir(path.dirname(paths.approvalsFile),{recursive:true});
    const handlers=new Map<string,(event:any)=>any>();
    const quoteName="mcp__triverse__quote_text_to_model", createName="mcp__triverse__create_text_to_model";
    const quoteSchema={type:"object",properties:{model:{type:"string",default:"v1"}},additionalProperties:false};
    const createSchema={type:"object",properties:{...quoteSchema.properties,prompt:{type:"string",minLength:3},visibility:{enum:["public","private"]},max_credits:{type:"integer",minimum:0},operation_id:{type:"string"}},required:["prompt","visibility","max_credits","operation_id"],additionalProperties:false};
    const pi={on:(name:string,handler:(event:any)=>any)=>handlers.set(name,handler),getAllTools:()=>[{name:quoteName,parameters:quoteSchema},{name:createName,parameters:createSchema}]};
    await createMcpApprovalExtension(paths,()=>{})(pi as unknown as ExtensionAPI);
    const call=handlers.get("tool_call")!, result=handlers.get("tool_result")!;
    await call({toolName:quoteName,toolCallId:"quote",input:{}});
    await result({toolName:quoteName,toolCallId:"quote",input:{},isError:false,structuredContent:{data:{credits_cost:12}},content:[]});
    const [receipt]=await readJson<any[]>(path.join(path.dirname(paths.approvalsFile),"quotes.json"),[]);
    assert.ok(receipt);
    assert.deepEqual(await readJson(paths.approvalsFile,[]),[]);
    const args={prompt:"A wooden crate",visibility:"private",max_credits:12,operation_id:"12345678-1234-1234-1234-123456789abc"};
    assert.equal((await call({toolName:createName,toolCallId:"early",input:args})).block,true);
    const approvalTool=createCreationApprovalTool(paths);
    assert.equal((await approvalTool.execute("bad-price",{quote_id:receipt.id,arguments:{...args,max_credits:13}})).isError,true);
    assert.equal((await approvalTool.execute("bad-model",{quote_id:receipt.id,arguments:{...args,model:"different"}})).isError,true);
    let approved=await approvalTool.execute("review",{quote_id:receipt.id,arguments:args});
    const stale=await readJson<any[]>(paths.approvalsFile,[]);
    stale[0].expiresAt=new Date(0).toISOString();await writeJson(paths.approvalsFile,stale);
    const renewed=await approvalTool.execute("renew",{quote_id:receipt.id,arguments:args});
    assert.notEqual(renewed.details.approval?.id,approved.details.approval?.id);
    approved=renewed;
    assert.equal(approved.isError,undefined); const approval=approved.details.approval!;
    await grantMcpApproval(paths,approval.id);
    for (const change of [{prompt:"A car"},{visibility:"public"},{max_credits:13},{operation_id:"87654321-1234-1234-1234-123456789abc"}]) {
      assert.equal((await call({toolName:createName,toolCallId:"changed",input:{...args,...change}})).block,true);
    }
    assert.equal(await call({toolName:createName,toolCallId:"valid",input:args}),undefined);
    assert.equal((await call({toolName:createName,toolCallId:"repeat",input:args})).block,true);
    const [operation]=await readJson<any[]>(path.join(path.dirname(paths.approvalsFile),"operations.json"),[]);
    assert.equal(operation.id,args.operation_id);
    assert.equal(operation.arguments.model,"v1");
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test("the discovered text, image and retexture schemas enforce source identity and reject failed quotes",async()=>{
 const snapshot=JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../../../docs/mcp-tool-snapshot-2026-10-09.json",import.meta.url),"utf8"));
 const operation_id="12345678-1234-1234-1234-123456789abc", source={asset_id:"asset",item_id:"item",file_id:"file"};
 for (const flow of ["text_to_model","image_to_model","retexture"]) {
  const dir=await mkdtemp(path.join(tmpdir(),"real-schema-approval-"));
  try {
   const paths=projectPaths(dir,"fixture");await mkdir(path.dirname(paths.approvalsFile),{recursive:true});
   const handlers=new Map<string,(event:any)=>any>(),quoteName=`mcp__triverse__quote_${flow}`,createName=`mcp__triverse__create_${flow}`;
   const pi={on:(name:string,handler:(event:any)=>any)=>handlers.set(name,handler),getAllTools:()=>snapshot.tools.map((tool:any)=>({name:`mcp__triverse__${tool.name}`,parameters:tool.inputSchema}))};
   await createMcpApprovalExtension(paths,()=>{})(pi as unknown as ExtensionAPI);
   const schema=snapshot.tools.find((tool:any)=>tool.name===`quote_${flow}`).inputSchema;
   const quoteArgs=flow==="text_to_model" ? {profile_id:"profile",visibility:"private"} : flow==="retexture" ? {source,mode:"text",text_prompt:"Wooden finish"} : {source,visibility:"private",profile_id:"profile",parameters:{}};
   // Image profile IDs/parameter sets remain service-defined; bind every quoted field.
   const actualArgs=Object.fromEntries(Object.entries(quoteArgs).filter(([key])=>key in schema.properties));
   await handlers.get("tool_call")!({toolName:quoteName,toolCallId:"failed",input:actualArgs});
   await handlers.get("tool_result")!({toolName:quoteName,toolCallId:"failed",input:actualArgs,isError:false,structuredContent:{error:{message:"not allowed"}},content:[]});
   assert.deepEqual(await readJson(path.join(path.dirname(paths.approvalsFile),"quotes.json"),[]),[]);
   await handlers.get("tool_call")!({toolName:quoteName,toolCallId:"quote",input:actualArgs});
   await handlers.get("tool_result")!({toolName:quoteName,toolCallId:"quote",input:actualArgs,isError:false,structuredContent:{data:{credits_cost:12}},content:[]});
   const [receipt]=await readJson<any[]>(path.join(path.dirname(paths.approvalsFile),"quotes.json"),[]);
   const createArgs={...actualArgs,prompt:"A wooden crate",operation_id,max_credits:12,visibility:"private"};
   const createSchema=snapshot.tools.find((tool:any)=>tool.name===`create_${flow}`).inputSchema;
   const args=Object.fromEntries(Object.entries(createArgs).filter(([key])=>key in createSchema.properties));
   const tool=createCreationApprovalTool(paths);const review=await tool.execute("review",{quote_id:receipt.id,arguments:args});
   assert.equal(review.isError,undefined,JSON.stringify(review));await grantMcpApproval(paths,review.details.approval!.id);
   if("source" in args) assert.equal((await handlers.get("tool_call")!({toolName:createName,input:{...args,source:{...source,file_id:"other-file"}}})).block,true);
   assert.equal(await handlers.get("tool_call")!({toolName:createName,input:args}),undefined,flow);
  } finally {await rm(dir,{recursive:true,force:true});}
 }
});
