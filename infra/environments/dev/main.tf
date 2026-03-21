###############################################################################
# Dev Environment — Root Module
###############################################################################

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {}
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

###############################################################################
# Locals
###############################################################################

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

###############################################################################
# Cognito
###############################################################################

module "cognito" {
  source = "../../modules/cognito"

  project_name = var.project_name
  environment  = var.environment
}

###############################################################################
# DynamoDB
###############################################################################

module "dynamodb" {
  source = "../../modules/dynamodb"

  project_name = var.project_name
  environment  = var.environment
}

###############################################################################
# WAF
###############################################################################

module "waf" {
  source = "../../modules/waf"

  project_name  = var.project_name
  environment   = var.environment
  rate_limit    = var.rate_limit
  adyen_ip_cidrs = var.adyen_ip_cidrs
}

###############################################################################
# Aurora Serverless v2
###############################################################################

module "aurora" {
  source = "../../modules/aurora"

  project_name             = var.project_name
  environment              = var.environment
  vpc_id                   = var.vpc_id
  subnet_ids               = var.private_subnet_ids
  lambda_security_group_id = var.lambda_security_group_id
  master_username          = var.aurora_master_username
  master_password          = var.aurora_master_password
  min_capacity             = var.aurora_min_capacity
  max_capacity             = var.aurora_max_capacity
}

###############################################################################
# Lambda Functions
###############################################################################

module "lambda" {
  source = "../../modules/lambda"

  project_name             = var.project_name
  environment              = var.environment
  vpc_subnet_ids           = var.private_subnet_ids
  lambda_security_group_id = var.lambda_security_group_id

  aurora_cluster_endpoint = module.aurora.cluster_endpoint
  aurora_database_name    = module.aurora.database_name
  cognito_user_pool_id    = module.cognito.user_pool_id

  dynamodb_call_logs_table_name = module.dynamodb.call_logs_table_name
  dynamodb_sms_logs_table_name  = module.dynamodb.sms_logs_table_name
  dynamodb_spam_log_table_name  = module.dynamodb.spam_log_table_name
  dynamodb_call_logs_table_arn   = module.dynamodb.call_logs_table_arn
  dynamodb_sms_logs_table_arn    = module.dynamodb.sms_logs_table_arn
  dynamodb_spam_log_table_arn    = module.dynamodb.spam_log_table_arn

  dynamodb_auto_reply_log_table_name        = module.dynamodb.auto_reply_log_table_name
  dynamodb_auto_reply_log_table_arn          = module.dynamodb.auto_reply_log_table_arn
  dynamodb_unified_inbox_items_table_name    = module.dynamodb.unified_inbox_items_table_name
  dynamodb_unified_inbox_items_table_arn     = module.dynamodb.unified_inbox_items_table_arn
  dynamodb_device_tokens_table_name          = module.dynamodb.device_tokens_table_name
  dynamodb_device_tokens_table_arn           = module.dynamodb.device_tokens_table_arn
  dynamodb_notification_settings_table_name  = module.dynamodb.notification_settings_table_name
  dynamodb_notification_settings_table_arn   = module.dynamodb.notification_settings_table_arn
  dynamodb_conference_logs_table_name        = module.dynamodb.conference_logs_table_name
  dynamodb_conference_logs_table_arn         = module.dynamodb.conference_logs_table_arn

  telnyx_api_key_ssm_arn = var.telnyx_api_key_ssm_arn
  adyen_api_key_ssm_arn  = var.adyen_api_key_ssm_arn
  adyen_hmac_key_ssm_arn = var.adyen_hmac_key_ssm_arn
  ses_identity_arn       = var.ses_identity_arn
}

###############################################################################
# API Gateway
###############################################################################

module "api_gateway" {
  source = "../../modules/api-gateway"

  project_name        = var.project_name
  environment         = var.environment
  cognito_user_pool_arn = module.cognito.user_pool_arn
  waf_web_acl_arn     = module.waf.web_acl_arn
  lambda_invoke_arns  = module.lambda.function_invoke_arns
  lambda_function_arns = module.lambda.function_arns
}

###############################################################################
# Amplify Hosting
###############################################################################

module "amplify" {
  source = "../../modules/amplify"

  project_name         = var.project_name
  environment          = var.environment
  repository_url       = var.repository_url
  github_access_token  = var.github_access_token
  cognito_user_pool_id = module.cognito.user_pool_id
  cognito_client_id    = module.cognito.app_client_id
  api_gateway_url      = module.api_gateway.api_gateway_url
  aws_region           = var.aws_region
  waf_web_acl_arn      = module.waf.web_acl_arn
  custom_domain        = var.custom_domain

  # CloudWatch RUM
  rum_identity_pool_id     = module.cloudwatch_rum.identity_pool_id
  rum_guest_role_arn       = module.cloudwatch_rum.guest_role_arn
  rum_web_app_monitor_id   = module.cloudwatch_rum.app_monitor_ids["web"]
  rum_admin_app_monitor_id = module.cloudwatch_rum.app_monitor_ids["admin"]
  rum_sales_app_monitor_id = module.cloudwatch_rum.app_monitor_ids["sales"]
}

###############################################################################
# EventBridge — Retention Job Schedule
###############################################################################

module "eventbridge" {
  source = "../../modules/eventbridge"

  project_name                       = var.project_name
  environment                        = var.environment
  retention_job_lambda_arn            = module.lambda.function_arns["retention-job"]
  retention_job_lambda_function_name  = "${var.project_name}-${var.environment}-retention-job"
}

###############################################################################
# CloudWatch RUM — Real User Monitoring
###############################################################################

module "cloudwatch_rum" {
  source = "../../modules/cloudwatch-rum"

  project_name     = var.project_name
  environment      = var.environment
  aws_region       = var.aws_region
  web_app_domain   = "main.d1oif9zxzbu8sd.amplifyapp.com"
  admin_app_domain = "main.d1qc83ne8y1s9.amplifyapp.com"
  sales_app_domain = "main.d2gaenyfpvldsl.amplifyapp.com"
}

###############################################################################
# Security Hardening — CloudTrail + GuardDuty (SOC 2)
###############################################################################

module "security" {
  source = "../../modules/security"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
}
