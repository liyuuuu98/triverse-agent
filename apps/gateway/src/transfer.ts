import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a,b]=address.split(".").map(Number);
    return !([0,10,127].includes(a) || a>=224 || (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && (b===168 || b===0)) || (a===100 && b>=64 && b<=127) || (a===198 && [18,19,51].includes(b)) || (a===203 && b===0));
  }
  // Only globally routable IPv6; reject mapped IPv4, local and transition ranges.
  return isIP(address)===6 && /^2[0-9a-f]{3}:/i.test(address) && !/^200[12]:/i.test(address) && !/^2001:db8:/i.test(address);
}
/** HTTPS only, pinned public DNS, no redirects, bounded bytes and duration. */
export async function transfer(urlValue: string, options: { bytes?: Buffer; headers?: Record<string,string>; limit?: number } = {}): Promise<Buffer> {
  const url=new URL(urlValue);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Transfer requires a public HTTPS URL on port 443.");
  const addresses=await lookup(url.hostname,{all:true});
  if (!addresses.length || addresses.some(({address})=>!publicAddress(address))) throw new Error("Transfer target is not a public address.");
  const pinned=addresses[0], limit=options.limit ?? 200_000_000;
  const headers={...options.headers};
  for (const key of Object.keys(headers)) if (/^(host|connection|transfer-encoding|proxy-|cookie)/i.test(key)) throw new Error("Unsupported transfer header");
  if (options.bytes) headers["content-length"]=String(options.bytes.length);
  return new Promise((resolve,reject)=>{
    const req=request(url,{method:options.bytes ? "PUT" : "GET",headers,lookup:((_hostname: string,_options: any,callback: any)=>callback(null,pinned.address,pinned.family)) as any},res=>{
      if (!res.statusCode || res.statusCode<200 || res.statusCode>=300) {res.resume();reject(new Error(`Transfer failed (${res.statusCode ?? "unknown"}); redirects are refused.`));return;}
      let size=0;const chunks: Buffer[]=[];
      res.on("data",(chunk: Buffer)=>{size+=chunk.length;if (size>limit) {req.destroy(new Error("Transfer exceeds byte limit"));return;}chunks.push(chunk);});
      res.on("error",reject); res.on("end",()=>resolve(Buffer.concat(chunks)));
    });
    const timeout=setTimeout(()=>req.destroy(new Error("Transfer timed out")),60_000);
    req.on("close",()=>clearTimeout(timeout));req.on("error",reject);
    req.end(options.bytes);
  });
}
