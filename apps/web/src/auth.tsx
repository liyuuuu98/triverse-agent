import { useEffect, useState } from "react";
import { App } from "./App";
export function AuthenticatedApp() {
  const [ready,setReady]=useState(false),[token,setToken]=useState(""),[error,setError]=useState("");
  useEffect(()=>{void fetch("/api/auth/state").then(response=>response.json()).then(state=>setReady(state.authenticated)).catch(()=>setError("Cannot connect to workspace"));},[]);
  if (ready) return <App />;
  return <div className="welcome"><form className="welcome-card" onSubmit={async(event)=>{event.preventDefault();try {const response=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token})});if(!response.ok) throw new Error("Invalid workspace access key");setToken("");setReady(true);} catch(error) {setError(error instanceof Error ? error.message : "Sign-in failed");}}}><h1>Workspace access</h1><label>Access key<input type="password" autoComplete="current-password" required value={token} onChange={event=>setToken(event.target.value)} /></label><button type="submit">Open workspace</button>{error ? <p role="alert">{error}</p> : null}</form></div>;
}
