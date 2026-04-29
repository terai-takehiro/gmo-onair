# Enable the GCP APIs required by the interpretation system.
#
# We disable_on_destroy = false so that `terraform destroy` does not turn off
# APIs that may be shared with other resources/services in the project.

locals {
  required_apis = [
    # Core AI APIs
    "speech.googleapis.com",          # Cloud Speech-to-Text V2 (Chirp 3)
    "texttospeech.googleapis.com",    # Cloud Text-to-Speech (Chirp 3 HD / Gemini Flash TTS)
    "aiplatform.googleapis.com",      # Vertex AI (Gemini 2.5 Flash)

    # Compute / runtime
    "run.googleapis.com",             # Cloud Run
    "cloudbuild.googleapis.com",      # Cloud Build (CI/CD)
    "artifactregistry.googleapis.com",# Artifact Registry (container images)

    # Data / messaging
    "sqladmin.googleapis.com",        # Cloud SQL admin API
    "redis.googleapis.com",           # Memorystore Redis
    "servicenetworking.googleapis.com", # Private Service Connect for Cloud SQL / Memorystore

    # Networking
    "compute.googleapis.com",         # VPC, firewall, addresses
    "vpcaccess.googleapis.com",       # Serverless VPC Access (Cloud Run -> Memorystore / Cloud SQL)

    # Operations / security
    "secretmanager.googleapis.com",   # Secret Manager
    "iam.googleapis.com",             # IAM
    "iamcredentials.googleapis.com",  # Workload Identity Federation (CI)
    "logging.googleapis.com",         # Cloud Logging
    "monitoring.googleapis.com",      # Cloud Monitoring
    "cloudtrace.googleapis.com",      # Cloud Trace
  ]
}

resource "google_project_service" "enabled" {
  for_each = toset(local.required_apis)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}
