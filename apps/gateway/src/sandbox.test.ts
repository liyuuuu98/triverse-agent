import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { prepareBash, shellAvailable } from "./sandbox.js";

test("shell is disabled when OS isolation is unavailable; otherwise credentials are removed", async () => {
  const dir=await mkdtemp(path.join(tmpdir(),"shell-boundary-"));
  try {
    const workspace=path.join(dir,"workspace"); await mkdir(path.join(workspace,"assets"),{recursive:true});
    const input={command:"ls assets",cwd:"assets",env:{PATH:"/usr/bin",TEAMO_API_KEY:"secret",BEATAPI_API_KEY:"secret",UNRELATED_CREDENTIAL:"secret",BASH_ENV:"/host/profile",HOME:"/host/home"}};
    if (!shellAvailable(workspace)) {assert.throws(()=>prepareBash(workspace,input),/isolation is unavailable/);return;}
    const result=prepareBash(workspace,input);
    assert.equal(result.cwd,path.join(workspace,"assets"));
    for (const key of ["TEAMO_API_KEY","BEATAPI_API_KEY","UNRELATED_CREDENTIAL","BASH_ENV"]) assert.equal(key in result.env,false);
    assert.equal(result.env.HOME,await realpath(workspace));
    assert.equal(result.env.PATH?.includes("/host"),false);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test("isolated shell cannot read outside files or overwrite protected metadata",async(t)=>{
  const dir=await mkdtemp(path.join(tmpdir(),"shell-file-isolation-"));
  try {
    const workspace=path.join(dir,"workspace");await mkdir(path.join(workspace,"scene"),{recursive:true});
    await writeFile(path.join(dir,"outside.txt"),"outside-fixture");await writeFile(path.join(workspace,"scene/scene.json"),"protected");
    if (!shellAvailable(workspace)) {t.skip("OS sandbox cannot run in this environment; disabled-shell behavior verified separately");return;}
    for (const command of ["cat ../outside.txt","echo changed > scene/scene.json","echo outside > ../escape.txt"]) {
      const call=prepareBash(workspace,{command,cwd:".",env:{}});
      const result=spawnSync("/bin/bash",["--noprofile","--norc","-c",call.command],{cwd:call.cwd,env:call.env,encoding:"utf8",timeout:3000});
      assert.notEqual(result.status,0,command);
      assert.equal(result.stdout.includes("outside-fixture"),false);
    }
    assert.equal(await readFile(path.join(workspace,"scene/scene.json"),"utf8"),"protected");
  } finally {await rm(dir,{recursive:true,force:true});}
});
