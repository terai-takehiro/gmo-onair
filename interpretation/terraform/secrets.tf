# Secret Manager entries.
#
# Secret VALUES are never managed by Terraform. Only the secret containers
# are created here; populate them out-of-band via `gcloud secrets versions add`
# or the Cloud Console.

locals {
  secrets = [
    "db-app-password",         # Cloud SQL application user password
    "db-url",                  # Full DATABASE_URL (asyncpg) — populate after apply
    "redis-url",               # Full REDIS_URL with AUTH — populate after apply
    "auth-jwt-secret",         # Backend JWT signing key
    "auth-session-secret",     # Frontend session cookie secret
    "supabase-anon-key",       # (optional) Supabase Auth anon key
    "supabase-service-key",    # (optional) Supabase Auth service role
  ]
}

resource "google_secret_manager_secret" "secrets" {
  for_each = toset(local.secrets)

  project   = var.project_id
  secret_id = "${local.name_suffix}-${each.value}"

  replication {
    auto {}
  }

  labels = local.common_labels

  depends_on = [google_project_service.enabled]
}
