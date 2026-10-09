import { loadSkills } from "@earendil-works/pi-coding-agent";
import type { Capabilities } from "@triverse/protocol";
import path from "node:path";
import { runtimeCapabilities, skillStatus } from "./skill-status.js";
import { createAgentTools } from "./agent.js";
import { agentDirFor, discoverMcpTools, mcpStatus } from "./mcp.js";
import { copySkills, projectPaths } from "./projects.js";
import type { ServerConfig } from "./server.js";

export async function readCapabilities(config: ServerConfig, projectId?: string): Promise<Capabilities> {
  const paths = projectPaths(config.dataDir, projectId ?? "capabilities");
  if (projectId) await copySkills(config.skillsDir, paths.workspace);
  const skillPaths = projectId ? [path.join(paths.workspace, ".triverse", "skills")] : [config.skillsDir];
  const { skills } = loadSkills({ cwd: paths.workspace, agentDir: path.join(config.dataDir, ".pi"), skillPaths, includeDefaults: false });
  const tools = createAgentTools({ workspace: paths.workspace });
  const server = mcpStatus(agentDirFor(config.dataDir));
  const remote = await discoverMcpTools(agentDirFor(config.dataDir));
  const runtimes = await runtimeCapabilities();
  const available = [...tools.map((tool) => tool.name), ...remote.tools.map((tool) => `mcp__triverse__${tool.name}`), ...runtimes];
  return {
    skills: skills.map((skill) => skillStatus(skill, available)).sort((a, b) => a.name.localeCompare(b.name)),
    tools: [
      ...tools.map(({ name, description }) => ({ name, description, category: "workspace" as const, configured: name === "generate_image" ? Boolean(config.teamoKey) : true })),
      ...remote.tools.map(({ name, description }) => ({ name: `mcp__triverse__${name}`, description: description ?? "Triverse MCP tool", category: "triverse" as const, configured: true })),
    ],
    services: [{ name: "AI model service", configured: Boolean(config.teamoKey) }, { name: "Triverse MCP", configured: remote.connected }],
    mcpServers: [server].map(({ name, status }) => ({ name, status, connected: remote.connected, toolCount: remote.tools.length, error: remote.error })),
  };
}
