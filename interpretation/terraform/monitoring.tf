# Cloud Monitoring alert policies for the interpretation backend.
#
# Notification channels are NOT created by Terraform — they are typically
# provisioned once per project via the Console (email, Slack, PagerDuty)
# and their resource names passed in via `var.notification_channels`.
# If left empty, alerts are still created (they just won't notify).

variable "notification_channels" {
  description = "Cloud Monitoring notification channel resource names."
  type        = list(string)
  default     = []
}

locals {
  backend_service_filter = format(
    "metric.labels.service_name=\"%s\" AND resource.labels.location=\"%s\"",
    google_cloud_run_v2_service.backend.name,
    var.region,
  )
}

# 5xx error rate over 5 minutes > 5% of requests.
resource "google_monitoring_alert_policy" "backend_5xx" {
  project      = var.project_id
  display_name = "[${var.environment}] interp-backend 5xx rate > 5%"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run 5xx ratio"
    condition_threshold {
      filter = format(
        "metric.type=\"run.googleapis.com/request_count\" AND %s AND metric.labels.response_code_class=\"5xx\"",
        local.backend_service_filter,
      )
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.5  # >0.5 req/s sustained 5xx (tune per traffic)

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = var.notification_channels

  documentation {
    content   = "Backend Cloud Run service ${google_cloud_run_v2_service.backend.name} sustained > 0.5 5xx req/s for 5 minutes. Check Cloud Logging for ERROR severity entries with the same X-Request-Id."
    mime_type = "text/markdown"
  }

  depends_on = [google_project_service.enabled]
}

# Request latency p95 over 5 minutes > 8s (e.g. WS upgrade can be slow but
# REST should be far below this).
resource "google_monitoring_alert_policy" "backend_latency" {
  project      = var.project_id
  display_name = "[${var.environment}] interp-backend p95 latency > 8s"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run p95 latency"
    condition_threshold {
      filter = format(
        "metric.type=\"run.googleapis.com/request_latencies\" AND %s",
        local.backend_service_filter,
      )
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 8000  # ms

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_PERCENTILE_95"
        cross_series_reducer = "REDUCE_MEAN"
      }
    }
  }

  notification_channels = var.notification_channels

  documentation {
    content   = "Backend p95 latency exceeded 8s. Investigate STT/Vertex/TTS upstream latency and check correlated `orchestrator.tts_done` log entries for first_audio_ms drift."
    mime_type = "text/markdown"
  }

  depends_on = [google_project_service.enabled]
}

# WebSocket lifetime / disconnect alerts depend on custom metrics or
# log-based metrics; out of scope for this iteration. Cloud Run's
# `request_count` covers WS upgrades (each upgrade is one request).
