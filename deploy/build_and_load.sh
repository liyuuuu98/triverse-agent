#!/usr/bin/env bash
# 在 master01 上执行。
# master03 没有 buildctl / buildkitd。不要为了构建去安装它，也不要修改任何节点的 containerd。
# 应用使用集群已经能拉取的 python 镜像，Python 依赖写到 JuiceFS 的 venv。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "this script does not edit /etc/containerd or config.toml on master01, master02, or master03"

kubectl apply -f "${ROOT}/deploy/k8s/namespace.yaml"
kubectl apply -f "${ROOT}/deploy/k8s/registry.yaml"
kubectl apply -f "${ROOT}/deploy/k8s/app.yaml"
kubectl apply -f "${ROOT}/deploy/k8s/openhands-canvas.yaml"
kubectl -n triverse-agent rollout status deploy/triverse-registry --timeout=180s
kubectl -n triverse-agent rollout status deploy/openhands-canvas --timeout=180s
kubectl -n triverse-agent get pods,svc -o wide
