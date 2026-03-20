###############################################################################
# General
###############################################################################

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, prod)"
  type        = string
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
}

###############################################################################
# Networking (provided externally or via a VPC module)
###############################################################################

variable "vpc_id" {
  description = "VPC ID for Aurora and Lambda"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for Aurora subnet group and Lambda VPC config"
  type        = list(string)
}

variable "lambda_security_group_id" {
  description = "Security group ID shared by Lambda functions in the VPC"
  type        = string
}

###############################################################################
# Aurora
###############################################################################

variable "aurora_master_username" {
  description = "Master username for the Aurora cluster"
  type        = string
  sensitive   = true
}

variable "aurora_master_password" {
  description = "Master password for the Aurora cluster"
  type        = string
  sensitive   = true
}

variable "aurora_min_capacity" {
  description = "Minimum ACU capacity for Aurora Serverless v2"
  type        = number
}

variable "aurora_max_capacity" {
  description = "Maximum ACU capacity for Aurora Serverless v2"
  type        = number
}

###############################################################################
# WAF
###############################################################################

variable "rate_limit" {
  description = "Maximum requests per 5-minute window per IP for WAF rate limiting"
  type        = number
}

variable "adyen_ip_cidrs" {
  description = "Adyen IP CIDR ranges to allowlist for webhook traffic"
  type        = list(string)
  default     = []
}

###############################################################################
# SSM Parameter ARNs
###############################################################################

variable "telnyx_api_key_ssm_arn" {
  description = "ARN of the SSM parameter storing the Telnyx API key"
  type        = string
}

variable "adyen_api_key_ssm_arn" {
  description = "ARN of the SSM parameter storing the Adyen API key"
  type        = string
}

variable "adyen_hmac_key_ssm_arn" {
  description = "ARN of the SSM parameter storing the Adyen webhook HMAC key"
  type        = string
}

variable "ses_identity_arn" {
  description = "ARN of the SES verified identity used for sending emails"
  type        = string
}

###############################################################################
# Amplify
###############################################################################

variable "repository_url" {
  description = "GitHub repository URL for Amplify source"
  type        = string
}

variable "github_access_token" {
  description = "GitHub personal access token for Amplify"
  type        = string
  sensitive   = true
}
