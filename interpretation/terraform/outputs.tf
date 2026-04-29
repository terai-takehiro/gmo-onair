output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}

output "vpc_network" {
  value = google_compute_network.main.name
}

output "vpc_connector" {
  value = google_vpc_access_connector.main.name
}

output "redis_host" {
  value     = google_redis_instance.main.host
  sensitive = true
}

output "redis_port" {
  value = google_redis_instance.main.port
}

output "cloud_sql_connection_name" {
  value = google_sql_database_instance.main.connection_name
}

output "cloud_sql_private_ip" {
  value     = google_sql_database_instance.main.private_ip_address
  sensitive = true
}

output "artifact_registry_repo" {
  value = google_artifact_registry_repository.containers.repository_id
}

output "backend_service_url" {
  value = google_cloud_run_v2_service.backend.uri
}

output "frontend_service_url" {
  value = google_cloud_run_v2_service.frontend.uri
}

output "backend_service_account" {
  value = google_service_account.backend_runtime.email
}

output "frontend_service_account" {
  value = google_service_account.frontend_runtime.email
}

output "cicd_service_account" {
  value = google_service_account.cicd_deployer.email
}
