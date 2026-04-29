variable "project_id" {
  description = "GCP project ID. Create the project manually before running Terraform."
  type        = string
}

variable "region" {
  description = "Primary GCP region for resources."
  type        = string
  default     = "asia-northeast1"
}

variable "zone" {
  description = "Primary GCP zone for zonal resources."
  type        = string
  default     = "asia-northeast1-a"
}

variable "environment" {
  description = "Deployment environment (dev / stg / prod). Used as a resource label / suffix."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "stg", "prod"], var.environment)
    error_message = "environment must be one of dev, stg, prod."
  }
}

variable "name_prefix" {
  description = "Prefix prepended to every resource name to avoid collisions."
  type        = string
  default     = "interp"
}

variable "labels" {
  description = "Common labels applied to all taggable resources."
  type        = map(string)
  default = {
    system     = "interpretation"
    managed_by = "terraform"
  }
}

variable "vertex_ai_region" {
  description = "Region for Vertex AI Gemini calls. Tokyo region supports Gemini 2.5 Flash."
  type        = string
  default     = "asia-northeast1"
}

variable "stt_region" {
  description = "Speech-to-Text V2 recognizer region."
  type        = string
  default     = "asia-northeast1"
}

variable "tts_region" {
  description = "Text-to-Speech region. Use global if regional endpoint unavailable."
  type        = string
  default     = "global"
}

variable "cloud_sql_tier" {
  description = "Cloud SQL machine tier (small for Phase 0 / 1)."
  type        = string
  default     = "db-f1-micro"
}

variable "memorystore_tier" {
  description = "Memorystore Redis tier (BASIC for Phase 0)."
  type        = string
  default     = "BASIC"

  validation {
    condition     = contains(["BASIC", "STANDARD_HA"], var.memorystore_tier)
    error_message = "memorystore_tier must be BASIC or STANDARD_HA."
  }
}

variable "memorystore_memory_size_gb" {
  description = "Memorystore Redis memory size in GB."
  type        = number
  default     = 1
}
