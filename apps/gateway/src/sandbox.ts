import { existsSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { resolveInside } from "./paths.js";

export interface BashCall { command: string; cwd: string; env: NodeJS.ProcessEnv }
const cache = new Map<string, boolean>();
const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
const protectedPaths = [".triverse", "versions", "assets/generated", "AGENTS.md", "scene/scene.json"];
function wrapper(workspace: string, command: string): string | undefined {
  const root = realpathSync(workspace);
  if (process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec")) {
    const subpath = (p: string) => `(subpath ${JSON.stringify(p)})`;
    const profile = `(version 1)(deny default)(allow process* sysctl-read mach-lookup ipc-posix*)(allow file-read* ${["/usr", "/bin", "/sbin", "/System", "/Library", "/opt/homebrew", "/private/var/db/dyld", "/dev/null", root].map(subpath).join(" ")})(allow file-write* ${subpath(root)} ${subpath("/dev/null")})(deny file-write* ${protectedPaths.map(p => subpath(path.join(root,p))).join(" ")})`;
    return `/usr/bin/sandbox-exec -p ${quote(profile)} /bin/bash --noprofile --norc -c ${quote(command)}`;
  }
  if (process.platform === "linux" && existsSync("/usr/bin/bwrap")) {
    const binds = ["/usr", "/bin", "/sbin", "/lib", "/lib64"].filter(existsSync).flatMap(p => ["--ro-bind",p,p]);
    const locks = protectedPaths.filter(p => existsSync(path.join(root,p))).flatMap(p => ["--ro-bind",path.join(root,p),path.join(root,p)]);
    return ["/usr/bin/bwrap", "--unshare-all", "--die-with-parent", "--new-session", ...binds, "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--bind",root,root,...locks,"--chdir",root,"/bin/bash","--noprofile","--norc","-c",command].map(quote).join(" ");
  }
}
export function shellAvailable(workspace: string): boolean {
  if (!existsSync(workspace)) return false;
  const root=realpathSync(workspace), previous=cache.get(root);
  if (previous !== undefined) return previous;
  const command=wrapper(root,"/usr/bin/true");
  const available=Boolean(command && spawnSync("/bin/bash",["--noprofile","--norc","-c",command],{cwd:root,env:{PATH:"/usr/bin:/bin",HOME:root},timeout:3000,stdio:"ignore"}).status === 0);
  cache.set(root,available); return available;
}
export function prepareBash(workspace: string, input: BashCall): BashCall {
  if (!shellAvailable(workspace)) throw new Error("Shell disabled: operating-system workspace isolation is unavailable.");
  const relative = path.isAbsolute(input.cwd) ? path.relative(workspace,input.cwd) || "." : input.cwd || ".";
  const cwd = resolveInside(workspace, relative);
  const env: NodeJS.ProcessEnv={HOME:realpathSync(workspace),PATH:"/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",LANG:input.env.LANG || "en_US.UTF-8"};
  return {command:wrapper(workspace,`cd ${quote(cwd)} && ${input.command}`)!,cwd,env};
}
