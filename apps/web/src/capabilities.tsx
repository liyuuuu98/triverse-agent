import type { Capabilities } from "@triverse/protocol";
import { useEffect, useRef, useState } from "react";
import { getCapabilities, getMcp, startMcpLogin, submitMcpRedirect } from "./api";
import { Icon } from "./brand";

const TABS = ["Skills", "Tools", "MCP"] as const;

export function McpPanel({ initial, onSignedIn }: { initial: Capabilities["mcpServers"]; onSignedIn: () => void }) {
  const [servers, setServers] = useState(initial);
  const lastStatus = useRef(initial[0]?.status);
  const [redirect, setRedirect] = useState("");
  const [message, setMessage] = useState("");
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setServers(initial), [initial]);
  useEffect(() => {
    let active = true;
    const tick = () => {
      void getMcp().then((body) => {
        if (!active) return;
        setServers((previous) => [{ ...previous[0], name: body.server.name, status: body.server.status }]);
        if (body.server.error) setMessage(body.server.error);
        if (body.server.status === "signed-in" && lastStatus.current !== "signed-in") onSignedIn();
        lastStatus.current = body.server.status;
      }).catch(() => undefined);
    };
    const timer = window.setInterval(tick, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [onSignedIn]);
  const signIn = async () => {
    const popup = window.open("", "_blank");
    setBusy(true);
    setMessage("");
    try {
      const body = await startMcpLogin();
      if (body.authorizationUrl) {
        setAuthorizationUrl(body.authorizationUrl);
        if (popup) popup.location.replace(body.authorizationUrl);
      } else {
        popup?.close();
      }
      setMessage(body.authorizationUrl ? "Finish sign-in in the browser. If it cannot reach this machine, paste the redirected address below." : "Signed in.");
      const latest = await getMcp();
      setServers([{ name: latest.server.name, status: latest.server.status }]);
    } catch (reason) {
      popup?.close();
      setMessage(reason instanceof Error ? reason.message : "Could not start sign-in");
    } finally {
      setBusy(false);
    }
  };
  const sendRedirect = async () => {
    setBusy(true);
    setMessage("");
    try {
      await submitMcpRedirect(redirect);
      setMessage("Checking the redirected address…");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not use that address");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mcp-panel">
      <p className="capability-note">Connect Triverse creation tools through MCP. Sign in once for this workspace; on a remote workspace, paste the redirected address below if the callback cannot reach it.</p>
      {servers.map((server) => <div key={server.name}><div className="capability-item mcp-server"><span><Icon name="plug" size={14} />{server.name}{server.connected ? ` · ${server.toolCount} tools` : ""}</span><span className={server.connected ? "tool-state" : "tool-state unavailable"}>{server.connected ? "Connected" : server.status === "signed-in" ? "Signed in" : server.status === "signing-in" ? "Waiting for sign-in" : "Sign-in required"}</span></div>{server.error ? <p className="mcp-message">{server.error}</p> : null}</div>)}
      {servers.some((server) => server.status !== "signed-in") ? <div className="mcp-actions"><button type="button" onClick={() => void signIn()} disabled={busy}>Sign in</button>{authorizationUrl ? <a href={authorizationUrl} target="_blank" rel="noreferrer">Open the sign-in page</a> : null}<label>Redirect address<input value={redirect} onChange={(event) => setRedirect(event.target.value)} placeholder="http://127.0.0.1:8791/callback/…" aria-label="Redirect address" /></label><button type="button" onClick={() => void sendRedirect()} disabled={busy || !redirect.trim()}>Use address</button></div> : null}
      {message ? <p className="mcp-message">{message}</p> : null}
    </div>
  );
}

export function CapabilitiesPanel({ projectId, onClose }: { projectId?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<Capabilities | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]>("Skills");
  const [search, setSearch] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    void getCapabilities(projectId).then((value) => { if (active) setData(value); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load capabilities"); });
    return () => { active = false; };
  }, [projectId]);
  const counts = { Skills: data?.skills.length, Tools: data?.tools.length, MCP: data?.mcpServers.length };
  const skills = data?.skills.filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  return (
    <dialog ref={dialog} className="capabilities-dialog" aria-labelledby="capabilities-title" onCancel={onClose} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}>
      <div className="capabilities-header"><div className="capabilities-symbol"><Icon name="layers" size={21} /></div><button className="icon-button" type="button" aria-label="Close capabilities" onClick={onClose}><Icon name="close" /></button></div>
      <h2 id="capabilities-title">Current capabilities</h2>
      <p className="capabilities-intro">A look inside your creative toolkit.</p>
      {error ? <p className="banner error">{error}</p> : !data ? <div className="capabilities-loading" role="status"><span className="pulse" /> Loading capabilities…</div> : <>
        <div className="service-list">{data.services.map((service) => <div key={service.name}><span>{service.name}</span><span className={service.configured ? "connection-state configured" : "connection-state"}><span />{service.name === "Triverse MCP" ? service.configured ? "Connected" : "Not connected" : service.configured ? "Configured" : "Not configured"}</span></div>)}</div>
        <div className="capability-tabs" role="tablist" aria-label="Capability categories">{TABS.map((item, index) => <button type="button" role="tab" id={`capability-${item}`} aria-selected={tab === item} aria-controls="capability-content" tabIndex={tab === item ? 0 : -1} key={item} onClick={() => setTab(item)} onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); const next = TABS[(index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length]!; setTab(next); document.getElementById(`capability-${next}`)?.focus(); } }}>{item}<span>{counts[item]}</span></button>)}</div>
        <div id="capability-content" className="capability-content" role="tabpanel" aria-labelledby={`capability-${tab}`}>
          {tab === "Skills" ? <><label className="capability-search"><Icon name="search" size={15} /><input aria-label="Search skills" placeholder="Find a skill…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><p className="capability-note">Ready workflows match current tools. Other workflows show the tools still needed.</p><div className="capability-list">{skills.map((skill) => <details className="capability-item" key={skill.name}><summary><Icon name="spark" size={14} /><span>{skill.name}</span><span className={`skill-status ${skill.status ?? "ready"}`}>{skill.status === "planning" ? "Planned" : skill.status === "needs-tools" ? "Needs tools" : "Ready"}</span><Icon name="chevron" size={13} /></summary><p>{skill.description}{skill.missingTools?.length ? <><br />Missing: {skill.missingTools.join(", ")}</> : null}</p></details>)}{!skills.length ? <div className="capability-empty">{search ? "No skills match your search." : "No skills installed."}</div> : null}</div></> : null}
          {tab === "Tools" ? <><p className="capability-note">Workspace tools and capabilities discovered from your connected MCP services.</p><div className="capability-list">{data.tools.map((tool) => <details className="capability-item" key={tool.name}><summary><Icon name={tool.category === "triverse" ? "plug" : "layers"} size={14} /><span>{tool.name}</span><Icon name="chevron" size={13} /></summary><p>{tool.description}</p></details>)}</div></> : null}
          {tab === "MCP" ? <McpPanel initial={data.mcpServers} onSignedIn={() => { void getCapabilities(projectId).then(setData).catch(() => undefined); }} /> : null}
        </div>
      </>}
      <div className="capabilities-footer"><span className="brand-dot" /> {projectId ? "Current workspace" : "Triverse Agent"}<span>Live configuration</span></div>
    </dialog>
  );
}
