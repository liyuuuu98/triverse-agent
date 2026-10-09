import type { FileNode, ProjectSummary } from "@triverse/protocol";
import { useEffect, useRef, useState } from "react";
import * as api from "./api";
import { Icon } from "./brand";

export function ProjectCard({ project, onOpen }: { project: ProjectSummary; onOpen: (id: string) => void }) {
  const card = useRef<HTMLButtonElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void api.getTree(project.id).then((tree) => {
        if (active) setPreviews(renderImages(tree).slice(-4).reverse());
      }).catch(() => undefined);
    }, { rootMargin: "160px" });
    if (card.current) observer.observe(card.current);
    return () => { active = false; observer.disconnect(); };
  }, [project.id, project.updatedAt]);
  return (
    <button ref={card} className="project-card gallery-card" type="button" onClick={() => onOpen(project.id)} aria-label={`Open ${project.name}`}>
      <div className={`project-preview ${previews.length > 1 ? "preview-grid" : ""}`}>
        {previews.length ? previews.map((file) => <img key={file} alt="" src={api.fileUrl(project.id, file)} loading="lazy" onError={() => setPreviews((current) => current.filter((item) => item !== file))} />) : <div className="project-placeholder" aria-hidden="true"><div className="placeholder-halo" /><Icon name="cube" size={64} /></div>}
        {project.status !== "idle" ? <span className={`gallery-status status-${project.status}`}>{project.status === "running" ? "Working" : project.status === "error" ? "Error" : "Needs approval"}</span> : null}
        <span className="project-open" aria-hidden="true"><Icon name="arrow" size={17} /></span>
      </div>
      <div className="project-card-body"><strong title={project.name}>{project.name}</strong><time dateTime={project.updatedAt}>{new Date(project.updatedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</time></div>
    </button>
  );
}

function renderImages(node: FileNode): string[] {
  if (node.name.startsWith(".")) return [];
  if (node.kind === "file") return node.path.startsWith("renders/") && /\.(png|jpe?g|webp)$/i.test(node.path) ? [node.path] : [];
  return (node.children ?? []).flatMap(renderImages);
}
