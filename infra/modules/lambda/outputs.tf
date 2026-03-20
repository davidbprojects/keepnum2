output "function_arns" {
  description = "Map of function names to their ARNs"
  value = {
    for k, v in aws_lambda_function.this : k => v.arn
  }
}

output "function_invoke_arns" {
  description = "Map of function names to their invoke ARNs"
  value = {
    for k, v in aws_lambda_function.this : k => v.invoke_arn
  }
}

output "lambda_security_group_id" {
  description = "Security group ID shared by Lambda functions in the VPC"
  value       = var.lambda_security_group_id
}
