variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g. dev, prod)"
  type        = string
}

variable "vpc_subnet_ids" {
  description = "List of private subnet IDs for Lambda functions that access Aurora"
  type        = list(string)
}

variable "lambda_security_group_id" {
  description = "Security group ID for Lambda functions in the VPC"
  type        = string
}

variable "aurora_cluster_endpoint" {
  description = "Writer endpoint for the Aurora Postgres cluster"
  type        = string
}

variable "aurora_database_name" {
  description = "Name of the Aurora database"
  type        = string
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID for auth operations"
  type        = string
}

variable "dynamodb_call_logs_table_name" {
  description = "Name of the DynamoDB call_logs table"
  type        = string
}

variable "dynamodb_sms_logs_table_name" {
  description = "Name of the DynamoDB sms_logs table"
  type        = string
}

variable "dynamodb_spam_log_table_name" {
  description = "Name of the DynamoDB spam_log table"
  type        = string
}

variable "dynamodb_call_logs_table_arn" {
  description = "ARN of the DynamoDB call_logs table"
  type        = string
}

variable "dynamodb_sms_logs_table_arn" {
  description = "ARN of the DynamoDB sms_logs table"
  type        = string
}

variable "dynamodb_spam_log_table_arn" {
  description = "ARN of the DynamoDB spam_log table"
  type        = string
}

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

variable "lambda_memory_mb" {
  description = "Default memory allocation for Lambda functions in MB"
  type        = number
  default     = 256
}

variable "lambda_timeout_sec" {
  description = "Default timeout for Lambda functions in seconds"
  type        = number
  default     = 15
}

# New DynamoDB table variables
variable "dynamodb_auto_reply_log_table_name" {
  type = string
}
variable "dynamodb_auto_reply_log_table_arn" {
  type = string
}
variable "dynamodb_unified_inbox_items_table_name" {
  type = string
}
variable "dynamodb_unified_inbox_items_table_arn" {
  type = string
}
variable "dynamodb_device_tokens_table_name" {
  type = string
}
variable "dynamodb_device_tokens_table_arn" {
  type = string
}
variable "dynamodb_notification_settings_table_name" {
  type = string
}
variable "dynamodb_notification_settings_table_arn" {
  type = string
}
variable "dynamodb_conference_logs_table_name" {
  type = string
}
variable "dynamodb_conference_logs_table_arn" {
  type = string
}
