import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { projectPaths } from "./projects.js";
import { shellAvailable } from "./sandbox.js";
import { createServer, type ServerConfig } from "./server.js";

const skillsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../skills");

test("health, project files, and a missing model key", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "pi-server-"));
  const config: ServerConfig = {
    port: 0,
    dataDir,
    webDist: path.join(dataDir, "missing-web"),
    skillsDir,
    teamoKey: "",
    teamoBaseUrl: "https://api.teamorouter.cn/v1",
  };
  const server = createServer(config);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${base}/health`);
    assert.deepEqual(await health.json(), { ok: true });
    const reboundStatus=await new Promise<number>((resolve,reject)=>{const req=httpRequest(`${base}/api/projects`,{headers:{host:"attacker.invalid"}},res=>{res.resume();resolve(res.statusCode!);});req.on("error",reject);req.end();});
    assert.equal(reboundStatus,403);
    const capabilities = await fetch(`${base}/api/capabilities`);
    assert.equal(capabilities.status, 200);
    const catalog = await capabilities.json() as { skills: { name: string }[]; tools: { name: string; configured: boolean }[]; mcpServers: unknown[]; services: { configured: boolean }[] };
    assert.ok(catalog.skills.some((skill) => skill.name === "create-game-ready-asset"));
    assert.equal(new Set(catalog.skills.map((skill) => skill.name)).size, catalog.skills.length);
    const shell = shellAvailable(projectPaths(dataDir, "capabilities").workspace) ? ["bash"] : [];
    assert.deepEqual(catalog.tools.map((tool) => tool.name), ["read", "write", "edit", ...shell, "inspect_asset", "list_workspace_files", "read_scene", "update_scene", "add_scene_asset", "save_asset_version", "export_asset_pack", "request_creation_approval", "upload_reference", "sync_tasks", "deliver_asset", "generate_image"]);
    assert.equal(catalog.tools.find((tool) => tool.name === "inspect_asset")?.configured, true);
    assert.equal(catalog.tools.find((tool) => tool.name === "generate_image")?.configured, false);
    assert.deepEqual(catalog.mcpServers, [{ name: "triverse", status: "signed-out", connected: false, toolCount: 0 }]);
    assert.equal(JSON.stringify(catalog).includes("access_token"), false);
    assert.ok(catalog.services.every((service) => !service.configured));
    assert.ok(!JSON.stringify(catalog).includes(dataDir));
    assert.equal((await fetch(`${base}/api/capabilities?projectId=invalid`)).status, 404);
    const created = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Crate" }),
    });
    assert.equal(created.status, 201);
    const body = (await created.json()) as { project: { id: string } };
    const customSkill = path.join(dataDir, "projects", body.project.id, "workspace", ".triverse", "skills", "custom-skill");
    await mkdir(customSkill, { recursive: true });
    await writeFile(path.join(customSkill, "SKILL.md"), "---\nname: custom-skill\ndescription: A project-specific capability.\n---\n");
    const projectCatalog = await (await fetch(`${base}/api/capabilities?projectId=${body.project.id}`)).json() as { skills: { name: string }[] };
    assert.ok(projectCatalog.skills.some((skill) => skill.name === "custom-skill"));
    await rm(customSkill, { recursive: true });
    const copied = await readdir(path.join(dataDir, "projects", body.project.id, "workspace", ".triverse", "skills"));
    const source = await readdir(skillsDir);
    assert.ok(copied.includes("create-game-ready-asset"));
    assert.ok(copied.includes("mesh-audit"));
    assert.equal(copied.filter(name => name !== "catalog.json").length, source.filter(name=>name !== "catalog.json").length);
    const denied = await fetch(`${base}/api/projects/${body.project.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "make a crate" }),
    });
    assert.equal(denied.status, 503);
    assert.deepEqual(await denied.json(), { error: "TEAMO_API_KEY is not set" });
    const escaped = await fetch(`${base}/api/projects/${body.project.id}/file?path=${encodeURIComponent("../meta.json")}`);
    assert.equal(escaped.status, 400);
    const file = await fetch(`${base}/api/projects/${body.project.id}/file?path=project.triverse.json`);
    assert.equal(file.status, 200);
    assert.match(await file.text(), /Crate/);
    const patched = await fetch(`${base}/api/projects/${body.project.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "not-a-model" }),
    });
    assert.equal(patched.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("external workspaces require access keys and protect files, approvals and mutation origins",async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),"pi-auth-"));const config:ServerConfig={port:0,host:"0.0.0.0",accessToken:"test-workspace-key",dataDir,webDist:path.join(dataDir,"missing"),skillsDir,teamoKey:"",teamoBaseUrl:"https://example.invalid/v1"};
 assert.throws(()=>createServer({...config,accessToken:""}),/requires WORKSPACE_ACCESS_TOKEN/);
 const server=createServer(config);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 try {
  const address=server.address();assert.ok(address && typeof address==="object");const base=`http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(`${base}/api/projects`)).status,401);assert.equal((await fetch(`${base}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:"wrong"})})).status,401);
  const login=await fetch(`${base}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:config.accessToken})});assert.equal(login.status,200);const cookie=login.headers.get("set-cookie")!.split(";")[0];assert.match(login.headers.get("set-cookie")!,/HttpOnly; SameSite=Strict/);
  const headers={"content-type":"application/json",cookie};assert.equal((await fetch(`${base}/api/projects`,{method:"POST",headers:{...headers,origin:"https://evil.invalid"},body:'{"name":"blocked"}'})).status,403);
  const created=await fetch(`${base}/api/projects`,{method:"POST",headers,body:'{"name":"private"}'});const project=(await created.json() as any).project;
  assert.equal((await fetch(`${base}/api/projects/${project.id}/file?path=.triverse/approvals.json`,{headers})).status,400);
  assert.equal((await fetch(`${base}/api/projects/${project.id}/file?path=../control/approvals.json`,{headers})).status,400);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dataDir,{recursive:true,force:true});}
});

test("static bundles use gzip, immutable caching and conditional requests",async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),"pi-static-")),webDist=path.join(dataDir,"web");await mkdir(path.join(webDist,"assets"),{recursive:true});await writeFile(path.join(webDist,"assets","app-testhash.js"),"const test='bundle';\n".repeat(500));
 const server=createServer({port:0,dataDir,webDist,skillsDir,teamoKey:"",teamoBaseUrl:"https://example.invalid"});await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 try {
  const address=server.address();assert.ok(address && typeof address==="object");const url=`http://127.0.0.1:${address.port}/assets/app-testhash.js`;
  const first=await fetch(url,{headers:{"accept-encoding":"gzip"}});assert.equal(first.headers.get("content-encoding"),"gzip");assert.match(first.headers.get("cache-control")!,/immutable/);assert.match(await first.text(),/bundle/);
  const second=await fetch(url,{headers:{"if-none-match":first.headers.get("etag")!}});assert.equal(second.status,304);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dataDir,{recursive:true,force:true});}
});
