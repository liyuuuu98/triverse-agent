export function Brand({ compact = false }: { compact?: boolean }) {
  return <img className={compact ? "brand-logo compact" : "brand-logo"} src="/brand/triverse-logo.svg" alt="Triverse" width="154" height="24" />;
}

export function AgentWordmark() {
  return <span className="agent-wordmark">Agent</span>;
}

export function Icon({ name, size = 18 }: { name: "plus" | "cube" | "arrow" | "grid" | "reset" | "chevron" | "spark" | "close" | "search" | "layers" | "plug"; size?: number }) {
  const paths = {
    plus: "M12 5v14M5 12h14",
    cube: "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5M12 12v9M8 5.25l8 4.5",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    grid: "M4 4h16v16H4V4Zm0 8h16M12 4v16",
    reset: "M4 10a8 8 0 1 1 1 8M4 4v6h6",
    chevron: "m9 6 6 6-6 6",
    spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
    close: "m6 6 12 12M18 6 6 18",
    search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
    layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
    plug: "M9 3v5m6-5v5M7 8h10v4a5 5 0 0 1-10 0V8Zm5 9v4",
  };
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
