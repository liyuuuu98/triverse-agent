# 以 root 运行：工作区挂的是宿主机目录，非 root 在 hostPath 上经常没有写权限。
# 镜像自带代码和依赖，不把整块 JuiceFS 挂进容器。
FROM docker.1ms.run/library/python:3.12-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY agent /app/agent
RUN pip install --no-cache-dir -r /app/agent/requirements.txt

ENV PYTHONPATH=/app/agent \
    WORKSPACE_ROOT=/data/workspaces \
    PORT=8080 \
    LLM_MODEL=gpt-6-sol \
    AGENT_ENGINE=auto

EXPOSE 8080
CMD ["python", "-m", "uvicorn", "triverse_agent.server:app", "--host", "0.0.0.0", "--port", "8080"]
