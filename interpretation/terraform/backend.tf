# Remote state backend.
#
# Initialize with:
#   terraform init \
#     -backend-config="bucket=<PROJECT_ID>-tfstate" \
#     -backend-config="prefix=interpretation/<environment>"
#
# Create the bucket beforehand:
#   gsutil mb -l asia-northeast1 gs://<PROJECT_ID>-tfstate
#   gsutil versioning set on gs://<PROJECT_ID>-tfstate
#   gsutil uniformbucketlevelaccess set on gs://<PROJECT_ID>-tfstate

terraform {
  backend "gcs" {
    # bucket and prefix are supplied via -backend-config flags so that the
    # same configuration can be reused across dev / stg / prod.
  }
}
