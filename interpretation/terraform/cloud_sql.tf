# Cloud SQL for PostgreSQL — session history, glossary presets, users.

resource "google_sql_database_instance" "main" {
  name                = "${local.name_suffix}-pg"
  project             = var.project_id
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = var.environment == "prod"

  settings {
    tier              = var.cloud_sql_tier
    availability_type = var.environment == "prod" ? "REGIONAL" : "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = 20
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "18:00" # UTC = 03:00 JST
      transaction_log_retention_days = 7
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.main.id
      enable_private_path_for_google_cloud_services = true
    }

    user_labels = local.common_labels
  }

  depends_on = [
    google_project_service.enabled,
    google_service_networking_connection.psa,
  ]
}

resource "google_sql_database" "app" {
  name     = "interpretation"
  project  = var.project_id
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "app" {
  name     = "interpretation_app"
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  password = data.google_secret_manager_secret_version.db_password.secret_data
}

# Read the application user password from Secret Manager. Populate the secret
# version manually via `gcloud secrets versions add` before applying.
data "google_secret_manager_secret_version" "db_password" {
  secret  = google_secret_manager_secret.secrets["db-app-password"].id
  project = var.project_id
}
