output "app_monitor_ids" {
  description = "Map of app key to RUM app monitor ID"
  value       = { for k, v in aws_rum_app_monitor.apps : k => v.app_monitor_id }
}

output "identity_pool_id" {
  description = "Cognito Identity Pool ID for RUM"
  value       = aws_cognito_identity_pool.rum.id
}

output "guest_role_arn" {
  description = "IAM role ARN for unauthenticated RUM access"
  value       = aws_iam_role.rum_unauth.arn
}
