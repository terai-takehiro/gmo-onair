locals {
  name_suffix = "${var.name_prefix}-${var.environment}"

  common_labels = merge(
    var.labels,
    {
      environment = var.environment
    }
  )
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

data "google_project" "current" {
  project_id = var.project_id
}
