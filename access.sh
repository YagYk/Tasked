#!/bin/bash
# Discover ArgoCD, Prometheus & Grafana endpoints + credentials for the Tasked cluster.

set -euo pipefail

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  cat <<'EOF' >&2
[access.sh] AWS credentials are missing or invalid.
Export AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (and optionally AWS_SESSION_TOKEN),
configure a default profile via 'aws configure', or ensure the instance role has
EKS access before running this script.
EOF
  exit 1
fi

CLUSTER_NAME="${CLUSTER_NAME:-tasked-cluster}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "Using cluster: ${CLUSTER_NAME} (region: ${AWS_REGION})"

# Ensure caller can see the cluster before attempting to write kubeconfig
aws eks describe-cluster \
  --region "${AWS_REGION}" \
  --name "${CLUSTER_NAME}" >/dev/null

# Refresh kubeconfig (alias keeps contexts distinct if multiple clusters exist)
aws eks update-kubeconfig \
  --region "${AWS_REGION}" \
  --name "${CLUSTER_NAME}" \
  --alias "${CLUSTER_NAME}" >/dev/null

current_context=$(kubectl config current-context || true)
if [[ -z "${current_context}" ]]; then
  echo "Failed to set kubeconfig context. Aborting." >&2
  exit 1
fi

echo "Current kubectl context: ${current_context}"

argo_user="admin"
argo_url=$(kubectl get svc argocd-server -n argocd -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)
argo_initial_password=$(argocd admin initial-password -n argocd 2>/dev/null | head -n 1 || true)
argo_password=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' 2>/dev/null | base64 --decode || true)

prometheus_svc="stable-kube-prometheus-sta-prometheus"
grafana_svc="stable-grafana"

prometheus_host=$(kubectl get svc "${prometheus_svc}" -n prometheus -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)
grafana_host=$(kubectl get svc "${grafana_svc}" -n prometheus -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)
grafana_user="admin"
grafana_password=$(kubectl get secret "${grafana_svc}" -n prometheus -o jsonpath='{.data.admin-password}' 2>/dev/null | base64 --decode || true)

echo "------------------------"
echo "ArgoCD URL: ${argo_url:-<pending>}"
echo "ArgoCD User: ${argo_user}"
echo "ArgoCD Initial Password: ${argo_initial_password:-<pending>}"
echo
if [[ -n "${prometheus_host}" ]]; then
  echo "Prometheus URL: http://${prometheus_host}:9090"
else
  echo "Prometheus URL: <pending>"
fi
echo
echo "Grafana URL: ${grafana_host:-<pending>}"
echo "Grafana User: ${grafana_user}"
echo "Grafana Password: ${grafana_password:-<pending>}"
echo "------------------------"

echo "Tip: export AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION before running this script."
