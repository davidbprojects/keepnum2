###############################################################################
# Amplify Hosting — Web App (apps/web)
# Requirements: 13.1, 18.7
###############################################################################
resource "aws_amplify_app" "web" {
  name       = "${var.project_name}-${var.environment}-web"
  repository = var.repository_url

  # GitHub App integration managed via AWS Console — no oauth_token needed

  environment_variables = {
    REACT_APP_COGNITO_USER_POOL_ID = var.cognito_user_pool_id
    REACT_APP_COGNITO_CLIENT_ID    = var.cognito_client_id
    REACT_APP_API_URL              = var.api_gateway_url
    REACT_APP_AWS_REGION           = var.aws_region
    REACT_APP_RUM_APP_MONITOR_ID   = var.rum_web_app_monitor_id
    REACT_APP_RUM_IDENTITY_POOL_ID = var.rum_identity_pool_id
    REACT_APP_RUM_GUEST_ROLE_ARN   = var.rum_guest_role_arn
  }

  build_spec = <<-YAML
    version: 1
    applications:
      - frontend:
          phases:
            preBuild:
              commands:
                - npm ci
            build:
              commands:
                - npm run build
          artifacts:
            baseDirectory: apps/web/build
            files:
              - '**/*'
          cache:
            paths:
              - node_modules/**/*
        appRoot: .
  YAML

  tags = {
    Project     = var.project_name
    Environment = var.environment
    App         = "web"
  }
}

resource "aws_amplify_branch" "web_main" {
  app_id      = aws_amplify_app.web.id
  branch_name = "main"

  stage = "PRODUCTION"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    App         = "web"
  }
}

###############################################################################
# Amplify Hosting — Admin App (apps/admin)
# Requirements: 15.1
###############################################################################
resource "aws_amplify_app" "admin" {
  name       = "${var.project_name}-${var.environment}-admin"
  repository = var.repository_url

  # GitHub App integration managed via AWS Console — no oauth_token needed

  environment_variables = {
    REACT_APP_COGNITO_USER_POOL_ID = var.cognito_user_pool_id
    REACT_APP_COGNITO_CLIENT_ID    = var.cognito_client_id
    REACT_APP_API_URL              = var.api_gateway_url
    REACT_APP_AWS_REGION           = var.aws_region
    REACT_APP_RUM_APP_MONITOR_ID   = var.rum_admin_app_monitor_id
    REACT_APP_RUM_IDENTITY_POOL_ID = var.rum_identity_pool_id
    REACT_APP_RUM_GUEST_ROLE_ARN   = var.rum_guest_role_arn
  }

  build_spec = <<-YAML
    version: 1
    applications:
      - frontend:
          phases:
            preBuild:
              commands:
                - npm ci
            build:
              commands:
                - npm run build
          artifacts:
            baseDirectory: apps/admin/build
            files:
              - '**/*'
          cache:
            paths:
              - node_modules/**/*
        appRoot: .
  YAML

  tags = {
    Project     = var.project_name
    Environment = var.environment
    App         = "admin"
  }
}

resource "aws_amplify_branch" "admin_main" {
  app_id      = aws_amplify_app.admin.id
  branch_name = "main"

  stage = "PRODUCTION"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    App         = "admin"
  }
}

###############################################################################
# Amplify Hosting — Sales Landing Page (apps/sales)
# Requirements: 18.7, 18.8
###############################################################################
resource "aws_amplify_app" "sales" {
  name       = "${var.project_name}-${var.environment}-sales"
  repository = var.repository_url

  # GitHub App integration managed via AWS Console — no oauth_token needed

  environment_variables = {
    REACT_APP_API_URL              = var.api_gateway_url
    REACT_APP_AWS_REGION           = var.aws_region
    REACT_APP_RUM_APP_MONITOR_ID   = var.rum_sales_app_monitor_id
    REACT_APP_RUM_IDENTITY_POOL_ID = var.rum_identity_pool_id
    REACT_APP_RUM_GUEST_ROLE_ARN   = var.rum_guest_role_arn
  }

  build_spec = <<-YAML
    version: 1
    applications:
      - frontend:
          phases:
            preBuild:
              commands:
                - npm ci
            build:
              commands:
                - npm run build
          artifacts:
            baseDirectory: apps/sales/build
            files:
              - '**/*'
          cache:
            paths:
              - node_modules/**/*
        appRoot: .
  YAML

  tags = {
    Project     = var.project_name
    Environment = var.environment
    App         = "sales"
  }
}

resource "aws_amplify_branch" "sales_main" {
  app_id      = aws_amplify_app.sales.id
  branch_name = "main"

  stage = "PRODUCTION"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    App         = "sales"
  }
}

###############################################################################
# WAF Association — Amplify uses CloudFront under the hood, WAF association
# requires us-east-1 WebACL. Skipped for regional deployments.
###############################################################################

###############################################################################
# Custom Domains — keepnum.com
###############################################################################

# app.keepnum.com → web app
resource "aws_amplify_domain_association" "web" {
  count = var.custom_domain != "" ? 1 : 0

  app_id                = aws_amplify_app.web.id
  domain_name           = var.custom_domain
  wait_for_verification = false

  sub_domain {
    branch_name = aws_amplify_branch.web_main.branch_name
    prefix      = "app"
  }
}

# admin.keepnum.com → admin app
resource "aws_amplify_domain_association" "admin" {
  count = var.custom_domain != "" ? 1 : 0

  app_id                = aws_amplify_app.admin.id
  domain_name           = var.custom_domain
  wait_for_verification = false

  sub_domain {
    branch_name = aws_amplify_branch.admin_main.branch_name
    prefix      = "admin"
  }
}

# keepnum.com + www.keepnum.com → sales landing page
resource "aws_amplify_domain_association" "sales" {
  count = var.custom_domain != "" ? 1 : 0

  app_id                = aws_amplify_app.sales.id
  domain_name           = var.custom_domain
  wait_for_verification = false

  sub_domain {
    branch_name = aws_amplify_branch.sales_main.branch_name
    prefix      = ""
  }

  sub_domain {
    branch_name = aws_amplify_branch.sales_main.branch_name
    prefix      = "www"
  }
}
