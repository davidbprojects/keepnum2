###############################################################################
# API Gateway Module — Outputs
###############################################################################

output "api_gateway_id" {
  description = "REST API ID"
  value       = aws_api_gateway_rest_api.main.id
}

output "api_gateway_url" {
  description = "Base invoke URL for the deployed stage"
  value       = aws_api_gateway_stage.main.invoke_url
}

output "stage_name" {
  description = "Deployed stage name"
  value       = aws_api_gateway_stage.main.stage_name
}

output "execution_arn" {
  description = "Execution ARN of the REST API (for Lambda permissions)"
  value       = aws_api_gateway_rest_api.main.execution_arn
}
