# VPC, subnet, Serverless VPC Access connector, and Private Service Connection
# for managed services (Cloud SQL / Memorystore).

resource "google_compute_network" "main" {
  name                    = "${local.name_suffix}-vpc"
  auto_create_subnetworks = false
  project                 = var.project_id

  depends_on = [google_project_service.enabled]
}

resource "google_compute_subnetwork" "main" {
  name                     = "${local.name_suffix}-subnet"
  project                  = var.project_id
  region                   = var.region
  network                  = google_compute_network.main.id
  ip_cidr_range            = "10.10.0.0/20"
  private_ip_google_access = true
}

# Serverless VPC Access connector — Cloud Run egress into the VPC so the
# backend can reach Memorystore and Cloud SQL via private IP.
resource "google_vpc_access_connector" "main" {
  name           = "${local.name_suffix}-vpcconn"
  project        = var.project_id
  region         = var.region
  network        = google_compute_network.main.name
  ip_cidr_range  = "10.20.0.0/28"
  min_throughput = 200
  max_throughput = 300

  depends_on = [google_project_service.enabled]
}

# Private Service Connection for Cloud SQL / Memorystore peering.
resource "google_compute_global_address" "private_service_range" {
  name          = "${local.name_suffix}-psa-range"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "psa" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_range.name]

  depends_on = [google_project_service.enabled]
}
