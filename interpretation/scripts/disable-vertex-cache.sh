#!/usr/bin/env bash
#
# Disable Vertex AI generative caching at the project level.
#
# Per the requirements doc (section 6.3), Vertex AI requests must NOT use
# in-memory caching so that customer prompts/responses are never retained.
# This script PATCHes the project-level cacheConfig with disableCache=true.
#
# Run once per project (and after every project recreation). Idempotent.
#
# Usage:
#   PROJECT_ID=gmo-interpretation-dev ./disable-vertex-cache.sh
#   PROJECT_ID=gmo-interpretation-dev VERTEX_REGION=asia-northeast1 \
#     ./disable-vertex-cache.sh
#
# Prerequisites:
#   - gcloud CLI authenticated as a user/SA with roles/aiplatform.admin
#   - aiplatform.googleapis.com enabled (Terraform handles this)

set -euo pipefail

PROJECT_ID="${PROJECT_ID:?PROJECT_ID env var required}"
VERTEX_REGION="${VERTEX_REGION:-us-central1}"

echo "[disable-vertex-cache] project=${PROJECT_ID} region=${VERTEX_REGION}"

ACCESS_TOKEN="$(gcloud auth print-access-token)"

# PATCH cacheConfig
RESPONSE=$(curl -sS -X PATCH \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  "https://${VERTEX_REGION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/cacheConfig" \
  -d "{\"name\": \"projects/${PROJECT_ID}/cacheConfig\", \"disableCache\": true}")

echo "[disable-vertex-cache] PATCH response:"
echo "${RESPONSE}"

# Verify
echo "[disable-vertex-cache] verifying..."
VERIFY=$(curl -sS \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "https://${VERTEX_REGION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/cacheConfig")

echo "${VERIFY}"

if echo "${VERIFY}" | grep -q '"disableCache": true'; then
  echo "[disable-vertex-cache] OK: caching disabled"
else
  echo "[disable-vertex-cache] WARNING: could not confirm disableCache=true. Inspect output above." >&2
  exit 1
fi
