import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
const gateway=process.env.GATEWAY_URL || "http://127.0.0.1:8080";
function proxy() {
  return {target:gateway,changeOrigin:true,configure(server:any) {
    server.on("proxyReq",(outgoing:any,incoming:any)=>{
      const origin=incoming.headers.origin;
      // Preserve the gateway's origin checks across the trusted development proxy.
      try {if(origin && new URL(origin).host===incoming.headers.host) outgoing.setHeader("origin",new URL(gateway).origin);} catch {}
    });
  }};
}
export default defineConfig({plugins:[react()],server:{proxy:{"/api":proxy(),"/health":proxy()}}});
