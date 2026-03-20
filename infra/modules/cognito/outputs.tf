output "user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_arn" {
  description = "Cognito User Pool ARN"
  value       = aws_cognito_user_pool.main.arn
}

output "app_client_id" {
  description = "Cognito App Client ID (no secret)"
  value       = aws_cognito_user_pool_client.app_client.id
}

output "admin_group_name" {
  description = "Name of the Cognito admin group"
  value       = aws_cognito_user_group.admin.name
}
