#!/usr/bin/env bash
# Run goss container tests against a local Docker build.
# Usage: IMAGE_NAME=my-image:tag bash scripts/test-docker.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="${IMAGE_NAME:-ccr-test:latest}"

cd "$ROOT_DIR"

if [ ! -d "packages/ui/dist" ]; then
  echo "Building UI package (required by Dockerfile COPY)..."
  pnpm build:ui
fi

echo "Building Docker image: $IMAGE_NAME"
docker build -f packages/server/Dockerfile -t "$IMAGE_NAME" .

echo "Running goss container tests..."
GOSS_SLEEP="${GOSS_SLEEP:-8}" \
  GOSS_FILES_PATH="$ROOT_DIR/packages/server" \
  dgoss run "$IMAGE_NAME"

echo "All tests passed."
