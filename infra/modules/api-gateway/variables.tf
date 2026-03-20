###############################################################################
# API Gateway Module — Variables
###############################################################################

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, prod)"
  type        = string
}

variable "cognito_user_pool_arn" {
  description = "ARN of the Cognito User Pool for the authorizer"
  type        = string
}

variable "waf_web_acl_arn" {
  description = "ARN of the WAFv2 WebACL to associate with the API stage"
  type        = string
}

variable "lambda_invoke_arns" {
  description = "Map of Lambda function name to invoke ARN"
  type        = map(string)
}

variable "lambda_function_arns" {
  description = "Map of Lambda function name to ARN (for permissions)"
  type        = map(string)
}
