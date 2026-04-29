#!/usr/bin/env bash
#
# Bootstrap a fresh GCP project for the interpretation system.
#
# Run this BEFORE `terraform init` / `terraform apply`.
# It performs the prerequisites Terraform cannot do on a brand-new project:
#   1. Create the project (idempotent)
#   2. Link a billing account
#   3. Create the GCS bucket for Terraform remote state
#   4. (optional) Create initial Secret Manager values you need to seed
#
# Usage:
#   PROJECT_ID=gmo-interpretation-dev \
#   BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX \
#   ORGANIZATION_ID=000000000000 \
#   ./bootstrap-gcp.sh

set -euo pipefail

PROJECT_ID="${PROJECT_ID:?PROJECT_ID env var required}"
BILLING_ACCOUNT="${BILLING_ACCOUNT:?BILLING_ACCOUNT env var required}"
ORGANIZATION_ID="${ORGANIZATION_ID:-}"
REGION="${REGION:-asia-northeast1}"
TFSTATE_BUCKET="${TFSTATE_BUCKET:-${PROJECT_ID}-tfstate}"

echo "[bootstrap] project=${PROJECT_ID} region=${REGION} bucket=gs://${TFSTATE_BUCKET}"

# 1. Create project (no-op if it already exists)
if gcloud projects describe "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "[bootstrap] project exists; skipping create"
else
  if [[ -n "${ORGANIZATION_ID}" ]]; then
    gcloud projects create "${PROJECT_ID}" \
      --name="GMO Interpretation" \
      --organization="${ORGANIZATION_ID}"
  else
    gcloud projects create "${PROJECT_ID}" --name="GMO Interpretation"
  fi
fi

# 2. Link billing
gcloud beta billing projects link "${PROJECT_ID}" \
  --billing-account="${BILLING_ACCOUNT}"

# 3. tfstate bucket
if gsutil ls -b "gs://${TFSTATE_BUCKET}" >/dev/null 2>&1; then
  echo "[bootstrap] tfstate bucket exists"
else
  gsutil mb -p "${PROJECT_ID}" -l "${REGION}" "gs://${TFSTATE_BUCKET}"
fi
gsutil versioning set on "gs://${TFSTATE_BUCKET}"
gsutil uniformbucketlevelaccess set on "gs://${TFSTATE_BUCKET}"

# 4. Set the active project for subsequent gcloud commands
gcloud config set project "${PROJECT_ID}"

cat <<EOF

[bootstrap] DONE.

Next steps:
  cd interpretation/terraform
  cp terraform.tfvars.example terraform.tfvars   # edit values
  terraform init \\
    -backend-config="bucket=${TFSTATE_BUCKET}" \\
    -backend-config="prefix=interpretation/<env>"
  terraform plan
  terraform apply

After apply, seed Secret Manager values, e.g.:
  echo -n "<random-strong-password>" | \\
    gcloud secrets versions add interp-dev-db-app-password --data-file=-

Then disable Vertex AI cache:
  PROJECT_ID=${PROJECT_ID} ../scripts/disable-vertex-cache.sh
EOF
