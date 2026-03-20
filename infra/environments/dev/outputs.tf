###############################################################################
# Key Outputs — Dev
###############################################################################

# API Gateway
output "api_gateway_url" {
  description = "Base invoke URL for the API Gateway stage"
  value       = module.api_gateway.api_gateway_url
}

# Cognito
output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = module.cognito.user_pool_id
}

output "cognito_app_client_id" {
  description = "Cognito App Client ID"
  value       = module.cognito.app_client_id
}

# Amplify
output "web_app_url" {
  description = "Default URL for the web application"
  value       = module.amplify.web_app_default_domain
}

output "admin_app_url" {
  description = "Default URL for the admin application"
  value       = module.amplify.admin_app_default_domain
}

output "sales_app_url" {
  description = "Default URL for the sales landing page"
  value       = module.amplify.sales_app_default_domain
}

# Aurora
output "aurora_cluster_endpoint" {
  description = "Aurora writer endpoint"
  value       = module.aurora.cluster_endpoint
}

# DynamoDB
output "dynamodb_call_logs_table" {
  description = "DynamoDB call_logs table name"
  value       = module.dynamodb.call_logs_table_name
}
