###############################################################################
# Lambda Module — 12 functions with least-privilege IAM, VPC, SSM references
###############################################################################

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

###############################################################################
# Local config map — one entry per Lambda function
###############################################################################
locals {
  lambda_functions = {
    auth-service = {
      description = "Authentication service — Cognito + Aurora"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = true
      needs_cognito       = true
      needs_aurora        = true
      needs_telnyx_ssm    = false
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = []
      invoke_functions    = []
    }
    number-service = {
      description = "Number management — Telnyx + Aurora"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = true
      needs_cognito       = false
      needs_aurora        = true
      needs_telnyx_ssm    = true
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = []
      invoke_functions    = []
    }
    call-service = {
      description = "Inbound call webhook handler"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = false
      needs_cognito       = false
      needs_aurora        = false
      needs_telnyx_ssm    = true
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = ["call_logs", "sms_logs"]
      invoke_functions    = ["spam-filter-service", "call-screening-service", "ivr-service", "auto-reply-service", "caller-id-service", "notification-service"]
    }
    sms-service = {
      description = "Inbound SMS webhook handler"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = false
      needs_cognito       = false
      needs_aurora        = false
      needs_telnyx_ssm    = true
      needs_adyen_ssm     = false
      needs_ses           = true
      dynamodb_tables     = ["call_logs", "sms_logs"]
      invoke_functions    = ["spam-filter-service"]
    }
    voicemail-service = {
      description = "Voicemail processing — Telnyx + Aurora + SES"
      timeout     = 60
      memory      = var.lambda_memory_mb
      needs_vpc   = true
      needs_cognito       = false
      needs_aurora        = true
      needs_telnyx_ssm    = true
      needs_adyen_ssm     = false
      needs_ses           = true
      dynamodb_tables     = []
      invoke_functions    = ["notification-service", "sms-service"]
    }
    log-service = {
      description = "Call and SMS log read/write — DynamoDB"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = false
      needs_cognito       = false
      needs_aurora        = false
      needs_telnyx_ssm    = false
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = ["call_logs", "sms_logs"]
      invoke_functions    = []
    }
    spam-filter-service = {
      description = "Spam evaluation — Telnyx + DynamoDB"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = false
      needs_cognito       = false
      needs_aurora        = false
      needs_telnyx_ssm    = true
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = ["spam_log"]
      invoke_functions    = []
    }
    call-screening-service = {
      description = "Call screening — Telnyx call control"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = false
      needs_cognito       = false
      needs_aurora        = false
      needs_telnyx_ssm    = true
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = []
      invoke_functions    = []
    }
    retention-job = {
      description = "Daily retention cleanup — Aurora + DynamoDB + Telnyx"
      timeout     = 300
      memory      = var.lambda_memory_mb
      needs_vpc   = true
      needs_cognito       = false
      needs_aurora        = true
      needs_telnyx_ssm    = true
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = ["call_logs", "sms_logs"]
      invoke_functions    = []
    }
    download-service = {
      description = "Download pre-signed URLs — Telnyx + Aurora"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = true
      needs_cognito       = false
      needs_aurora        = true
      needs_telnyx_ssm    = true
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = []
      invoke_functions    = []
    }
    admin-service = {
      description = "Admin panel operations — Cognito + Aurora"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = true
      needs_cognito       = true
      needs_aurora        = true
      needs_telnyx_ssm    = false
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = []
      invoke_functions    = []
    }
    billing-service = {
      description = "Billing and subscriptions — Adyen + Aurora + SES"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = true
      needs_cognito       = false
      needs_aurora        = true
      needs_telnyx_ssm    = false
      needs_adyen_ssm     = true
      needs_ses           = true
      dynamodb_tables     = []
      invoke_functions    = []
    }
    virtual-number-service = {
      description = "Virtual number management — Telnyx + Aurora"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = true
      needs_cognito       = false
      needs_aurora        = true
      needs_telnyx_ssm    = true
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = []
      invoke_functions    = []
    }
    ivr-service = {
      description = "IVR auto-attendant — Telnyx + Aurora"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = true
      needs_cognito       = false
      needs_aurora        = true
      needs_telnyx_ssm    = true
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = []
      invoke_functions    = []
    }
    auto-reply-service = {
      description = "Auto-reply SMS — Telnyx + Aurora + DynamoDB"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = true
      needs_cognito       = false
      needs_aurora        = true
      needs_telnyx_ssm    = true
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = ["auto_reply_log"]
      invoke_functions    = []
    }
    unified-inbox-service = {
      description = "Unified inbox — DynamoDB + Aurora"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = true
      needs_cognito       = false
      needs_aurora        = true
      needs_telnyx_ssm    = false
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = ["unified_inbox_items"]
      invoke_functions    = []
    }
    privacy-scan-service = {
      description = "Privacy scan — Aurora"
      timeout     = 60
      memory      = var.lambda_memory_mb
      needs_vpc   = true
      needs_cognito       = false
      needs_aurora        = true
      needs_telnyx_ssm    = false
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = []
      invoke_functions    = []
    }
    caller-id-service = {
      description = "Caller ID lookup — Aurora + SSM"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = true
      needs_cognito       = false
      needs_aurora        = true
      needs_telnyx_ssm    = false
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = []
      invoke_functions    = []
    }
    conference-service = {
      description = "Conference calling — Telnyx + Aurora + DynamoDB"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = true
      needs_cognito       = false
      needs_aurora        = true
      needs_telnyx_ssm    = true
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = ["conference_logs"]
      invoke_functions    = []
    }
    notification-service = {
      description = "Push notifications — SNS + DynamoDB + Telnyx"
      timeout     = var.lambda_timeout_sec
      memory      = var.lambda_memory_mb
      needs_vpc   = false
      needs_cognito       = false
      needs_aurora        = true
      needs_telnyx_ssm    = true
      needs_adyen_ssm     = false
      needs_ses           = false
      dynamodb_tables     = ["device_tokens", "notification_settings"]
      invoke_functions    = []
    }
  }

  # Helper: map DynamoDB table short names to ARNs
  dynamodb_table_arns = {
    call_logs             = var.dynamodb_call_logs_table_arn
    sms_logs              = var.dynamodb_sms_logs_table_arn
    spam_log              = var.dynamodb_spam_log_table_arn
    auto_reply_log        = var.dynamodb_auto_reply_log_table_arn
    unified_inbox_items   = var.dynamodb_unified_inbox_items_table_arn
    device_tokens         = var.dynamodb_device_tokens_table_arn
    notification_settings = var.dynamodb_notification_settings_table_arn
    conference_logs       = var.dynamodb_conference_logs_table_arn
  }

  # Helper: map DynamoDB table short names to table names
  dynamodb_table_names = {
    call_logs             = var.dynamodb_call_logs_table_name
    sms_logs              = var.dynamodb_sms_logs_table_name
    spam_log              = var.dynamodb_spam_log_table_name
    auto_reply_log        = var.dynamodb_auto_reply_log_table_name
    unified_inbox_items   = var.dynamodb_unified_inbox_items_table_name
    device_tokens         = var.dynamodb_device_tokens_table_name
    notification_settings = var.dynamodb_notification_settings_table_name
    conference_logs       = var.dynamodb_conference_logs_table_name
  }
}

###############################################################################
# IAM — Assume role policy for Lambda
###############################################################################
data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

###############################################################################
# Per-function IAM execution role
###############################################################################
resource "aws_iam_role" "lambda" {
  for_each = local.lambda_functions

  name               = "${var.project_name}-${var.environment}-${each.key}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Function    = each.key
  }
}

###############################################################################
# CloudWatch Logs policy — attached to every function
###############################################################################
resource "aws_iam_role_policy" "cloudwatch_logs" {
  for_each = local.lambda_functions

  name = "cloudwatch-logs"
  role = aws_iam_role.lambda[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.project_name}-${var.environment}-${each.key}:*"
      }
    ]
  })
}

###############################################################################
# VPC access policy — only for functions that need Aurora
###############################################################################
resource "aws_iam_role_policy" "vpc_access" {
  for_each = { for k, v in local.lambda_functions : k => v if v.needs_vpc }

  name = "vpc-access"
  role = aws_iam_role.lambda[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface"
        ]
        Resource = "*"
      }
    ]
  })
}

###############################################################################
# DynamoDB policy — per-function, only tables the function needs
###############################################################################
resource "aws_iam_role_policy" "dynamodb" {
  for_each = {
    for k, v in local.lambda_functions : k => v
    if length(v.dynamodb_tables) > 0
  }

  name = "dynamodb-access"
  role = aws_iam_role.lambda[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          for table in each.value.dynamodb_tables : local.dynamodb_table_arns[table]
        ]
      }
    ]
  })
}

###############################################################################
# SSM read policy — Telnyx API key
###############################################################################
resource "aws_iam_role_policy" "ssm_telnyx" {
  for_each = { for k, v in local.lambda_functions : k => v if v.needs_telnyx_ssm }

  name = "ssm-telnyx"
  role = aws_iam_role.lambda[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = var.telnyx_api_key_ssm_arn
      }
    ]
  })
}

###############################################################################
# SSM read policy — Adyen API key + HMAC key
###############################################################################
resource "aws_iam_role_policy" "ssm_adyen" {
  for_each = { for k, v in local.lambda_functions : k => v if v.needs_adyen_ssm }

  name = "ssm-adyen"
  role = aws_iam_role.lambda[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = [
          var.adyen_api_key_ssm_arn,
          var.adyen_hmac_key_ssm_arn
        ]
      }
    ]
  })
}

###############################################################################
# SES send policy
###############################################################################
resource "aws_iam_role_policy" "ses" {
  for_each = { for k, v in local.lambda_functions : k => v if v.needs_ses }

  name = "ses-send"
  role = aws_iam_role.lambda[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = var.ses_identity_arn
      }
    ]
  })
}

###############################################################################
# Cognito policy — for auth-service and admin-service
###############################################################################
resource "aws_iam_role_policy" "cognito" {
  for_each = { for k, v in local.lambda_functions : k => v if v.needs_cognito }

  name = "cognito-access"
  role = aws_iam_role.lambda[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminInitiateAuth",
          "cognito-idp:AdminRespondToAuthChallenge",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:ListUsers"
        ]
        Resource = "arn:aws:cognito-idp:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:userpool/${var.cognito_user_pool_id}"
      }
    ]
  })
}

###############################################################################
# CloudWatch Logs read policy — for admin-service to query logs
###############################################################################
resource "aws_iam_role_policy" "cloudwatch_logs_read" {
  count = contains(keys(local.lambda_functions), "admin-service") ? 1 : 0

  name = "cloudwatch-logs-read"
  role = aws_iam_role.lambda["admin-service"].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:StartQuery",
          "logs:GetQueryResults",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:GetLogEvents"
        ]
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.project_name}-${var.environment}-*:*"
      }
    ]
  })
}

###############################################################################
# Lambda invoke policy — for functions that invoke other Lambdas
###############################################################################
resource "aws_iam_role_policy" "lambda_invoke" {
  for_each = {
    for k, v in local.lambda_functions : k => v
    if length(v.invoke_functions) > 0
  }

  name = "lambda-invoke"
  role = aws_iam_role.lambda[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["lambda:InvokeFunction"]
        Resource = [
          for fn in each.value.invoke_functions :
          "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:${var.project_name}-${var.environment}-${fn}"
        ]
      }
    ]
  })
}

###############################################################################
# CloudWatch Log Groups — created before the functions
###############################################################################
resource "aws_cloudwatch_log_group" "lambda" {
  for_each = local.lambda_functions

  name              = "/aws/lambda/${var.project_name}-${var.environment}-${each.key}"
  retention_in_days = var.environment == "prod" ? 90 : 14

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Function    = each.key
  }
}

###############################################################################
# Lambda Functions
###############################################################################
resource "aws_lambda_function" "this" {
  for_each = local.lambda_functions

  function_name = "${var.project_name}-${var.environment}-${each.key}"
  description   = each.value.description
  role          = aws_iam_role.lambda[each.key].arn

  runtime     = "nodejs22.x"
  handler     = "index.handler"
  timeout     = each.value.timeout
  memory_size = each.value.memory

  # Placeholder — replaced by CI/CD deployment pipeline
  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment {
    variables = merge(
      # Common env vars
      {
        NODE_ENV    = var.environment
        AWS_REGION_ = data.aws_region.current.name
      },
      # Aurora env vars (only for VPC functions that access Aurora)
      each.value.needs_aurora ? {
        AURORA_ENDPOINT = var.aurora_cluster_endpoint
        AURORA_DATABASE = var.aurora_database_name
      } : {},
      # Cognito env vars
      each.value.needs_cognito ? {
        COGNITO_USER_POOL_ID = var.cognito_user_pool_id
      } : {},
      # Telnyx SSM param name
      each.value.needs_telnyx_ssm ? {
        TELNYX_API_KEY_SSM_ARN = var.telnyx_api_key_ssm_arn
      } : {},
      # Adyen SSM param names
      each.value.needs_adyen_ssm ? {
        ADYEN_API_KEY_SSM_ARN  = var.adyen_api_key_ssm_arn
        ADYEN_HMAC_KEY_SSM_ARN = var.adyen_hmac_key_ssm_arn
      } : {},
      # DynamoDB table names
      length(each.value.dynamodb_tables) > 0 ? {
        for table in each.value.dynamodb_tables :
        "DYNAMODB_${upper(replace(table, "-", "_"))}_TABLE" => local.dynamodb_table_names[table]
      } : {},
      # Invokable function names
      length(each.value.invoke_functions) > 0 ? {
        for fn in each.value.invoke_functions :
        "LAMBDA_${upper(replace(replace(fn, "-", "_"), "service", "SVC"))}" => "${var.project_name}-${var.environment}-${fn}"
      } : {},
      # SES identity
      each.value.needs_ses ? {
        SES_IDENTITY_ARN = var.ses_identity_arn
      } : {},
    )
  }

  # VPC config — only for functions that need Aurora access
  dynamic "vpc_config" {
    for_each = each.value.needs_vpc ? [1] : []
    content {
      subnet_ids         = var.vpc_subnet_ids
      security_group_ids = [var.lambda_security_group_id]
    }
  }

  depends_on = [
    aws_iam_role.lambda,
    aws_cloudwatch_log_group.lambda,
  ]

  tags = {
    Project     = var.project_name
    Environment = var.environment
    Function    = each.key
  }
}

###############################################################################
# Placeholder deployment package — empty zip for initial terraform apply
###############################################################################
data "archive_file" "placeholder" {
  type        = "zip"
  output_path = "${path.module}/placeholder.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 501, body: 'Not deployed yet' });"
    filename = "index.js"
  }
}
