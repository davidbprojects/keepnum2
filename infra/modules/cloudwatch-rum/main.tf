###############################################################################
# CloudWatch RUM — Real User Monitoring for all 3 frontend apps
###############################################################################

data "aws_caller_identity" "current" {}

locals {
  apps = {
    web   = var.web_app_domain
    admin = var.admin_app_domain
    sales = var.sales_app_domain
  }
}

###############################################################################
# Cognito Identity Pool — unauthenticated access for RUM telemetry
###############################################################################
resource "aws_cognito_identity_pool" "rum" {
  identity_pool_name               = "${var.project_name}-${var.environment}-rum-identity"
  allow_unauthenticated_identities = true
  allow_classic_flow               = true

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

###############################################################################
# IAM Role for unauthenticated RUM access
###############################################################################
data "aws_iam_policy_document" "rum_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = ["cognito-identity.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "cognito-identity.amazonaws.com:aud"
      values   = [aws_cognito_identity_pool.rum.id]
    }

    condition {
      test     = "ForAnyValue:StringLike"
      variable = "cognito-identity.amazonaws.com:amr"
      values   = ["unauthenticated"]
    }
  }
}

resource "aws_iam_role" "rum_unauth" {
  name               = "${var.project_name}-${var.environment}-rum-unauth-role"
  assume_role_policy = data.aws_iam_policy_document.rum_assume_role.json

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_iam_role_policy" "rum_put_events" {
  name = "rum-put-events"
  role = aws_iam_role.rum_unauth.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["rum:PutRumEvents"]
        Resource = [
          for app_key, _ in local.apps :
          "arn:aws:rum:${var.aws_region}:${data.aws_caller_identity.current.account_id}:appmonitor/${var.project_name}-${var.environment}-${app_key}"
        ]
      }
    ]
  })
}

###############################################################################
# Identity Pool Role Attachment
###############################################################################
resource "aws_cognito_identity_pool_roles_attachment" "rum" {
  identity_pool_id = aws_cognito_identity_pool.rum.id

  roles = {
    unauthenticated = aws_iam_role.rum_unauth.arn
  }
}

###############################################################################
# CloudWatch RUM App Monitors
###############################################################################
resource "aws_rum_app_monitor" "apps" {
  for_each = local.apps

  name   = "${var.project_name}-${var.environment}-${each.key}"
  domain = each.value

  app_monitor_configuration {
    identity_pool_id       = aws_cognito_identity_pool.rum.id
    guest_role_arn         = aws_iam_role.rum_unauth.arn
    session_sample_rate    = 1.0
    telemetries            = ["errors", "performance", "http"]
    allow_cookies          = true
    enable_xray            = false
  }

  cw_log_enabled = true

  tags = {
    Project     = var.project_name
    Environment = var.environment
    App         = each.key
  }
}
