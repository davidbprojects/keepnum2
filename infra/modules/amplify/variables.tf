variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g. dev, prod)"
  type        = string
}

variable "repository_url" {
  description = "URL of the source code repository (e.g. GitHub HTTPS URL)"
  type        = string
}

variable "github_access_token" {
  description = "GitHub personal access token for Amplify to access the repository"
  type        = string
  sensitive   = true
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID for web and admin apps"
  type        = string
}

variable "cognito_client_id" {
  description = "Cognito App Client ID for web and admin apps"
  type        = string
}

variable "api_gateway_url" {
  description = "API Gateway invoke URL for the sales landing page"
  type        = string
}

variable "aws_region" {
  description = "AWS region for Amplify configuration"
  type        = string
}

variable "waf_web_acl_arn" {
  description = "ARN of the WAFv2 WebACL to associate with Amplify apps"
  type        = string
  default     = ""
}
