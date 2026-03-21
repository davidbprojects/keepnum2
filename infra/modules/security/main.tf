###############################################################################
# Security Hardening Module — SOC 2 Compliance (Affordable Tier)
# - CloudTrail for audit logging
# - GuardDuty for threat detection
# - S3 access logging bucket
# - Cognito advanced security
###############################################################################

data "aws_caller_identity" "current" {}

###############################################################################
# S3 Bucket for CloudTrail logs
###############################################################################
resource "aws_s3_bucket" "cloudtrail_logs" {
  bucket = "${var.project_name}-${var.environment}-cloudtrail-logs-${data.aws_caller_identity.current.account_id}"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Purpose     = "cloudtrail-audit-logs"
  }
}

resource "aws_s3_bucket_versioning" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  rule {
    id     = "expire-old-logs"
    status = "Enabled"

    filter {
      prefix = ""
    }

    expiration {
      days = var.environment == "prod" ? 365 : 90
    }

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
  }
}

resource "aws_s3_bucket_policy" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AWSCloudTrailAclCheck"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.cloudtrail_logs.arn
      },
      {
        Sid       = "AWSCloudTrailWrite"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.cloudtrail_logs.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
        Condition = {
          StringEquals = { "s3:x-amz-acl" = "bucket-owner-full-control" }
        }
      }
    ]
  })
}

###############################################################################
# CloudTrail — audit logging for all API calls
###############################################################################
resource "aws_cloudtrail" "main" {
  name                       = "${var.project_name}-${var.environment}-trail"
  s3_bucket_name             = aws_s3_bucket.cloudtrail_logs.id
  include_global_service_events = true
  is_multi_region_trail      = false
  enable_logging             = true

  event_selector {
    read_write_type           = "All"
    include_management_events = true
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }

  depends_on = [aws_s3_bucket_policy.cloudtrail_logs]
}

###############################################################################
# GuardDuty — threat detection (free 30-day trial, then ~$1/GB)
###############################################################################
resource "aws_guardduty_detector" "main" {
  enable = true

  finding_publishing_frequency = "FIFTEEN_MINUTES"

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}
