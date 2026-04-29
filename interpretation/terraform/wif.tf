# Workload Identity Federation for GitHub Actions.
#
# Lets the `interp-{env}-cicd` service account be impersonated by the
# specified GitHub repository's workflow runs without long-lived service
# account keys.

variable "github_owner" {
  description = "GitHub organization or user that owns the repo (e.g. terai-takehiro)."
  type        = string
  default     = "terai-takehiro"
}

variable "github_repo" {
  description = "GitHub repo name (e.g. gmo-onair)."
  type        = string
  default     = "gmo-onair"
}

variable "github_allowed_branches" {
  description = "Branches allowed to assume the CI/CD SA."
  type        = list(string)
  default     = ["dev", "main"]
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "${local.name_suffix}-gha"
  display_name              = "GitHub Actions (${var.environment})"
  description               = "OIDC pool for GitHub Actions of ${var.github_owner}/${var.github_repo}."

  depends_on = [google_project_service.enabled]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "${local.name_suffix}-gha-provider"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
    "attribute.actor"      = "assertion.actor"
  }

  # Restrict to this exact repository.
  attribute_condition = "assertion.repository == \"${var.github_owner}/${var.github_repo}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Allow refs/heads/{branch} principals to impersonate the cicd SA.
resource "google_service_account_iam_member" "cicd_wif_binding" {
  for_each = toset(var.github_allowed_branches)

  service_account_id = google_service_account.cicd_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member = format(
    "principalSet://iam.googleapis.com/%s/attribute.repository/%s/%s",
    google_iam_workload_identity_pool.github.name,
    var.github_owner,
    var.github_repo,
  )
}

output "wif_provider_resource" {
  description = "Pass to google-github-actions/auth as workload_identity_provider."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "wif_service_account_email" {
  description = "Pass to google-github-actions/auth as service_account."
  value       = google_service_account.cicd_deployer.email
}
