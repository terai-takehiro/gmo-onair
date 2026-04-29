# Cloud Run services and Artifact Registry for container images.
#
# In Phase 0 we only provision the Artifact Registry repo and a placeholder
# Cloud Run service with a stub image. The real backend / frontend images are
# built and deployed in Phase 1+ via GitHub Actions.

resource "google_artifact_registry_repository" "containers" {
  project       = var.project_id
  location      = var.region
  repository_id = "${local.name_suffix}-containers"
  description   = "Container images for the interpretation system."
  format        = "DOCKER"
  labels        = local.common_labels

  depends_on = [google_project_service.enabled]
}

# Backend (FastAPI). Concrete image is deployed via CI; here we declare the
# service with a hello-world stub so the URL exists and IAM is configured.
resource "google_cloud_run_v2_service" "backend" {
  name     = "${local.name_suffix}-backend"
  project  = var.project_id
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.backend_runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }

    vpc_access {
      connector = google_vpc_access_connector.main.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }

    timeout = "3600s" # WebSocket-friendly; tighten in prod
  }

  labels = local.common_labels

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image, # image managed by CI
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.enabled,
    google_artifact_registry_repository.containers,
  ]
}

# Frontend (Next.js operator UI).
resource "google_cloud_run_v2_service" "frontend" {
  name     = "${local.name_suffix}-frontend"
  project  = var.project_id
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.frontend_runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  labels = local.common_labels

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.enabled,
    google_artifact_registry_repository.containers,
  ]
}
