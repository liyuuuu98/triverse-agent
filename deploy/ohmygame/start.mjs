import path from 'node:path';
import { createApp } from './dist/daemon/app.js';
import { ensureOhMyGamePiEnvironment } from './dist/daemon/pi-agent.js';
import { configureNetworkProxy } from './dist/daemon/proxy.js';
import { createGateway } from './web-gateway.mjs';

const dataDirectory = process.env.OHMYGAME_DATA_DIR ?? '/data';
const piAgentDirectory = path.join(dataDirectory, 'pi-agent');
process.env.PI_CODING_AGENT_DIR = piAgentDirectory;
const accessKey = process.env.OHMYGAME_WEB_ACCESS_KEY;
const daemonToken = process.env.OHMYGAME_DAEMON_TOKEN;
const teamoKey = process.env.TEAMO_API_KEY;
// Generated project subprocesses must not inherit deployment credentials.
for (const key of ['OHMYGAME_WEB_ACCESS_KEY', 'OHMYGAME_DAEMON_TOKEN', 'TEAMO_API_KEY']) delete process.env[key];
if (!accessKey || accessKey.length < 24 || !daemonToken || !teamoKey) throw new Error('Required deployment secrets are missing');
configureNetworkProxy();
await ensureOhMyGamePiEnvironment(piAgentDirectory);
const app = createApp({ dataDirectory, piAgentDirectory, accessToken: daemonToken, logger: true, interactiveStoryPlayerDirectory: path.resolve('dist/player') });
await app.ready();
const inject = async (method, url, payload) => {
  const response = await app.inject({ method, url, headers: { authorization: `Bearer ${daemonToken}` }, payload });
  if (response.statusCode >= 400) throw new Error(`Provider initialization failed: ${method} ${url} HTTP ${response.statusCode}`);
  return response.body ? response.json() : undefined;
};
const existing = await inject('GET', '/settings/providers');
const specs = [
  { id: 'custom-teamo', name: 'TeamoRouter', baseUrl: 'https://api.teamorouter.cn/v1', api: 'openai-responses', models: [
    { id: 'gpt-6-sol', name: 'GPT 6 Sol', api: 'openai-responses', contextWindow: 128000, maxTokens: 16384, reasoning: true, supportsImages: true, usages: { language: true } },
    { id: 'gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst', api: 'openai-completions', contextWindow: 128000, maxTokens: 16384, reasoning: false, supportsImages: false, usages: { image: { protocol: 'openai-images', resolutions: ['1K'], aspectRatios: ['1:1', '3:2', '2:3'], maxReferenceImages: 1, maxOutputs: 1 } } },
  ] },
  { id: 'custom-teamo-anthropic', name: 'TeamoRouter Claude', baseUrl: 'https://api.teamorouter.cn/v1', api: 'anthropic-messages', models: [
    { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', api: 'anthropic-messages', contextWindow: 200000, maxTokens: 16384, reasoning: false, supportsImages: true, usages: { language: true } },
  ] },
];
for (const { id, ...spec } of specs) {
  const previous = existing.find((item) => item.id === id);
  const saved = previous ? await inject('GET', `/settings/models/providers/${id}/custom`) : spec;
  await inject('PUT', `/settings/models/providers/${id}/custom`, { ...saved, authentication: 'api_key', preset: 'gateway', modelConfigurationVersion: 2, apiKey: teamoKey });
}
if (!existing.some((item) => item.id === 'custom-teamo-anthropic')) await inject('PUT', '/models/default', { model: { provider: 'custom-teamo-anthropic', id: 'claude-haiku-5-5' }, reasoningLevel: 'off' });
await app.listen({ host: '127.0.0.1', port: 43110 });
const ports = new Set();
// Only a currently running project preview is proxyable; daemon and arbitrary loopback services are excluded.
const refreshPorts = async () => {
  const projects = await inject('GET', '/projects');
  ports.clear();
  for (const project of projects) {
    const match = /^\/preview\/(\d+)\//.exec(project.preview?.url ?? '');
    if (project.preview?.status === 'ready' && match) ports.add(Number(match[1]));
  }
};
const gateway = createGateway({ rendererDirectory: path.resolve('dist/renderer'), accessKey, daemonToken, allowedHosts: new Set((process.env.OHMYGAME_WEB_HOSTS ?? '').split(',')), previewPorts: async () => { await refreshPorts(); return ports; } });
await new Promise((resolve) => gateway.listen(Number(process.env.PORT ?? 8080), '0.0.0.0', resolve));
console.log('OhMyGame protected web gateway ready');
let stopping = false;
const stop = async () => { if (stopping) return; stopping = true; gateway.closeAllConnections(); gateway.close(); await app.close(); process.exit(0); };
process.once('SIGTERM', stop); process.once('SIGINT', stop);
