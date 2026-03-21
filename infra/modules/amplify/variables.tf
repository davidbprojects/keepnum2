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
  description = "GitHub personal access token for Amplify (deprecated — use GitHub App integration)"
  type        = string
  sensitive   = true
  default     = ""
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

variable "rum_identity_pool_id" {
  description = "Cognito Identity Pool ID for CloudWatch RUM"
  type        = string
  default     = ""
}

variable "rum_web_app_monitor_id" {
  description = "CloudWatch RUM App Monitor ID for web app"
  type        = string
  default     = ""
}

variable "rum_admin_app_monitor_id" {
  description = "CloudWatch RUM App Monitor ID for admin app"
  type        = string
  default     = ""
}

variable "rum_sales_app_monitor_id" {
  description = "CloudWatch RUM App Monitor ID for sales app"
  type        = string
  default     = ""
}

variable "rum_guest_role_arn" {
  description = "IAM role ARN for unauthenticated RUM access"
  type        = string
  default     = ""
}

variable "custom_domain" {
  description = "Custom domain name for Amplify apps (e.g. keepnum.com). Leave empty to skip custom domain setup."
  type        = string
  default     = ""
}
