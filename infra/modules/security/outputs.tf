output "cloudtrail_arn" {
  description = "ARN of the CloudTrail trail"
  value       = aws_cloudtrail.main.arn
}

output "guardduty_detector_id" {
  description = "GuardDuty detector ID"
  value       = aws_guardduty_detector.main.id
}

output "cloudtrail_bucket_name" {
  description = "S3 bucket name for CloudTrail logs"
  value       = aws_s3_bucket.cloudtrail_logs.id
}
