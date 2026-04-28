#!/usr/bin/env bash
# Run goss container tests against a local Docker build.
# Usage: IMAGE_NAME=my-image:tag bash scripts/test-docker.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="${IMAGE_NAME:-ccr-test:latest}"
GOSS_CACHE_DIR="${ROOT_DIR}/.goss-cache"
GOSS_VERSION="${GOSS_VERSION:-v0.4.9}"

# dgoss copies GOSS_PATH into the container — must be a Linux binary, not the macOS host binary.
# Detect the container arch (matches the host on Apple Silicon / x86).
case "$(uname -m)" in
  arm64|aarch64) LINUX_ARCH="arm64" ;;
  *)             LINUX_ARCH="amd64" ;;
esac

LINUX_GOSS="${GOSS_CACHE_DIR}/goss-linux-${LINUX_ARCH}"

if [ ! -f "$LINUX_GOSS" ]; then
  echo "Downloading Linux goss binary (${LINUX_ARCH}) to .goss-cache/..."
  mkdir -p "$GOSS_CACHE_DIR"
  curl -fsSL \
    "https://github.com/goss-org/goss/releases/download/${GOSS_VERSION}/goss-linux-${LINUX_ARCH}" \
    -o "$LINUX_GOSS"
  chmod +x "$LINUX_GOSS"
fi

cd "$ROOT_DIR"

if [ ! -d "packages/ui/dist" ]; then
  echo "Building UI package (required by Dockerfile COPY)..."
  pnpm build:ui
fi

echo "Building Docker image: $IMAGE_NAME"
docker build -f packages/server/Dockerfile -t "$IMAGE_NAME" .

echo "Running goss container tests..."
GOSS_PATH="$LINUX_GOSS" \
  GOSS_SLEEP="${GOSS_SLEEP:-35}" \
  GOSS_FILES_PATH="$ROOT_DIR/packages/server" \
  dgoss run "$IMAGE_NAME"

echo "All tests passed."
