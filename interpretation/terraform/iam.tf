# Service accounts used by the interpretation system.
#
# - backend_runtime: runtime SA for the Cloud Run backend (FastAPI). Calls
#   STT / Vertex AI / TTS / Secret Manager / Cloud SQL / Memorystore.
# - frontend_runtime: runtime SA for the Cloud Run operator UI (Next.js).
#   Limited to Secret Manager read for runtime config.
# - cicd_deployer: SA assumed by GitHub Actions via Workload Identity
#   Federation to deploy Cloud Run revisions.

resource "google_service_account" "backend_runtime" {
  account_id   = "${local.name_suffix}-backend"
  display_name = "Interpretation backend runtime (${var.environment})"
  description  = "Runtime SA for Cloud Run backend. Calls STT, Vertex AI, TTS."
  project      = var.project_id

  depends_on = [google_project_service.enabled]
}

resource "google_service_account" "frontend_runtime" {
  account_id   = "${local.name_suffix}-frontend"
  display_name = "Interpretation frontend runtime (${var.environment})"
  description  = "Runtime SA for Cloud Run operator UI."
  project      = var.project_id

  depends_on = [google_project_service.enabled]
}

resource "google_service_account" "cicd_deployer" {
  account_id   = "${local.name_suffix}-cicd"
  display_name = "Interpretation CI/CD deployer (${var.environment})"
  description  = "Used by GitHub Actions via Workload Identity Federation."
  project      = var.project_id

  depends_on = [google_project_service.enabled]
}

# ---- Backend SA permissions ----

locals {
  backend_roles = [
    "roles/aiplatform.user",          # Vertex AI Gemini
    "roles/speech.client",            # Speech-to-Text V2
    "roles/cloudtts.user",            # Text-to-Speech (legacy role name)
    "roles/secretmanager.secretAccessor",
    "roles/cloudsql.client",
    "roles/redis.editor",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/cloudtrace.agent",
  ]
}

resource "google_project_iam_member" "backend_roles" {
  for_each = toset(local.backend_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.backend_runtime.email}"
}

# ---- Frontend SA permissions ----

resource "google_project_iam_member" "frontend_secret_access" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.frontend_runtime.email}"
}

resource "google_project_iam_member" "frontend_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.frontend_runtime.email}"
}

# ---- CI/CD SA permissions ----

locals {
  cicd_roles = [
    "roles/run.admin",
    "roles/artifactregistry.writer",
    "roles/cloudbuild.builds.editor",
    "roles/iam.serviceAccountUser", # to act as runtime SAs on deploy
    "roles/storage.objectAdmin",    # tfstate
  ]
}

resource "google_project_iam_member" "cicd_roles" {
  for_each = toset(local.cicd_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.cicd_deployer.email}"
}
