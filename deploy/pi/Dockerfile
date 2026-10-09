# 以后的镜像。当前集群清单不构建、也不运行这个文件。
# Pod 使用 docker.1ms.run/library/node:22-bookworm，并只读挂载已构建的目录。
FROM docker.1ms.run/library/node:22-bookworm

WORKDIR /opt/triverse

COPY package.json package-lock.json ./
COPY packages packages
COPY apps apps
COPY skills skills

RUN npm ci --ignore-scripts && npm run build

ENV PORT=8080 \
    DATA_DIR=/data \
    WEB_DIST=/opt/triverse/apps/web/dist \
    SKILLS_DIR=/opt/triverse/skills \
    TEAMO_BASE_URL=https://api.teamorouter.cn/v1 \
    TRIVERSE_MCP_URL=https://dev-mcp.triverse.ai/mcp \
    MCP_CALLBACK_HOST=0.0.0.0 \
    MCP_CALLBACK_PORT=8791 \
    HOST=0.0.0.0

EXPOSE 8080

CMD ["node", "apps/gateway/dist/server.js"]
