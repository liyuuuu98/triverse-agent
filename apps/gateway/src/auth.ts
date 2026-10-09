import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
const hash=(value:string)=>createHash("sha256").update(value).digest();
export function workspaceAuth(token:string) {
  const sessions=new Map<string,number>();
  const authenticated=(req:IncomingMessage)=> !token || Boolean((req.headers.cookie ?? "").split(/;\s*/).some(cookie=>{const [name,value]=cookie.split("=");return name==="triverse_session" && (sessions.get(value ?? "") ?? 0)>Date.now();}));
  return {
    authenticated,
    login(req:IncomingMessage,res:ServerResponse,provided:string):boolean {
      if (!token || !timingSafeEqual(hash(provided),hash(token))) return false;
      for (const [key,expiry] of sessions) if (expiry<=Date.now()) sessions.delete(key);
      if (sessions.size>100) sessions.clear();
      const id=randomBytes(32).toString("base64url");sessions.set(id,Date.now()+8*60*60_000);
      const secure=("encrypted" in req.socket && req.socket.encrypted) || req.headers["x-forwarded-proto"]==="https";
      res.setHeader("set-cookie",`triverse_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure ? "; Secure" : ""}`);return true;
    },
  };
}
export function validOrigin(req:IncomingMessage):boolean {
  const origin=req.headers.origin;
  if (!origin) return !req.headers["sec-fetch-site"] || req.headers["sec-fetch-site"]!=="cross-site";
  try {return new URL(origin).host===req.headers.host && ["http:","https:"].includes(new URL(origin).protocol);} catch {return false;}
}
