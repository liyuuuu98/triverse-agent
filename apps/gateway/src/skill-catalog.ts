import { cp, mkdir, readFile, readdir, rm, rename } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { atomicJson, jsonFile } from "./storage.js";
import { exclusive } from "./scene.js";
import { realInside } from "./paths.js";
interface Catalog { version: number; retiredNames: string[]; skills: { name: string; requiresTools: string[] }[] }
export async function skillCatalog(skillsDir: string): Promise<Catalog> {
  return jsonFile<Catalog>(path.join(skillsDir, "catalog.json"), { version: 1, retiredNames: [], skills: [] });
}
async function bundleHash(directory:string,names:string[],catalog:Catalog):Promise<string> {
  const hash=createHash("sha256").update(JSON.stringify(catalog));
  async function walk(current:string) {
    const entries=await readdir(current,{withFileTypes:true});entries.sort((a,b)=>a.name.localeCompare(b.name));
    for (const entry of entries) {
      const file=path.join(current,entry.name);hash.update(path.relative(directory,file));
      if (entry.isSymbolicLink()) throw new Error("Managed skill bundles must not contain symbolic links");
      if (entry.isDirectory()) await walk(file);else if(entry.isFile()) hash.update(await readFile(file));
    }
  }
  for(const name of names) {if(!/^[a-z0-9-]+$/.test(name)) continue;try {await readFile(path.join(directory,name,"SKILL.md"));} catch {continue;}await walk(path.join(directory,name));}
  return hash.digest("hex");
}
/** Refresh complete managed bundles; preserve custom project skills and prune retired names. */
export async function syncSkills(skillsDir: string, workspace: string): Promise<void> {
  const target=await realInside(workspace,path.join(workspace,".triverse/skills"));
  await exclusive(target,async()=>{
    const catalog=await skillCatalog(skillsDir);
    const names=catalog.skills.length ? catalog.skills.map(skill=>skill.name) : await readdir(skillsDir);
    const hash=await bundleHash(skillsDir,names,catalog);
    const marker=await realInside(workspace,path.join(workspace,".triverse/skill-version.json"));
    if ((await jsonFile<any>(marker,{})).hash===hash) return;
    await mkdir(target,{recursive:true});
    for (const name of catalog.retiredNames) {
      if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Invalid retired skill name");
      // Remove only the directory entry; never follow a retired symlink.
      await rm(path.join(target,name),{recursive:true,force:true});
    }
    for(const name of names) {
      if (!/^[a-z0-9-]+$/.test(name)) continue;
      const source=path.join(skillsDir,name);try {await readFile(path.join(source,"SKILL.md"));} catch {continue;}
      const temporary=path.join(target,`${name}-${randomUUID()}.tmp`);
      try {await cp(source,temporary,{recursive:true,dereference:false});await rm(path.join(target,name),{recursive:true,force:true});await rename(temporary,path.join(target,name));}
      finally {await rm(temporary,{recursive:true,force:true});}
    }
    await atomicJson(path.join(target,"catalog.json"),catalog);await atomicJson(marker,{version:catalog.version,hash});
  });
}
