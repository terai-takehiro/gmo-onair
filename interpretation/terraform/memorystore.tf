# Memorystore for Redis — used as Pub/Sub fanout for the per-language
# translation pipeline (1 publisher -> N language subscribers).

resource "google_redis_instance" "main" {
  name           = "${local.name_suffix}-redis"
  project        = var.project_id
  region         = var.region
  tier           = var.memorystore_tier
  memory_size_gb = var.memorystore_memory_size_gb

  authorized_network = google_compute_network.main.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  redis_version     = "REDIS_7_2"
  display_name      = "Interpretation Pub/Sub (${var.environment})"
  transit_encryption_mode = "SERVER_AUTHENTICATION"
  auth_enabled            = true

  labels = local.common_labels

  depends_on = [
    google_project_service.enabled,
    google_service_networking_connection.psa,
  ]
}
