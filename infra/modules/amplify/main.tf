###############################################################################
# Amplify Hosting — Web App (apps/web)
# Requirements: 13.1, 18.7
###############################################################################
resource "aws_amplify_app" "web" {
  name       = "${var.project_name}-${var.environment}-web"
  repository = var.repository_url

  oauth_token = var.github_access_token

  environment_variables = {
    REACT_APP_COGNITO_USER_POOL_ID = var.cognito_user_pool_id
    REACT_APP_COGNITO_CLIENT_ID    = var.cognito_client_id
    REACT_APP_API_URL              = var.api_gateway_url
    REACT_APP_AWS_REGION           = var.aws_region
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

  oauth_token = var.github_access_token

  environment_variables = {
    REACT_APP_COGNITO_USER_POOL_ID = var.cognito_user_pool_id
    REACT_APP_COGNITO_CLIENT_ID    = var.cognito_client_id
    REACT_APP_API_URL              = var.api_gateway_url
    REACT_APP_AWS_REGION           = var.aws_region
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

  oauth_token = var.github_access_token

  environment_variables = {
    REACT_APP_API_URL    = var.api_gateway_url
    REACT_APP_AWS_REGION = var.aws_region
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
# WAF Association — protect all three Amplify apps
# Requirements: 13.3, 14.5, 18.7
###############################################################################
resource "aws_wafv2_web_acl_association" "web" {
  resource_arn = aws_amplify_app.web.arn
  web_acl_arn  = var.waf_web_acl_arn
}

resource "aws_wafv2_web_acl_association" "admin" {
  resource_arn = aws_amplify_app.admin.arn
  web_acl_arn  = var.waf_web_acl_arn
}

resource "aws_wafv2_web_acl_association" "sales" {
  resource_arn = aws_amplify_app.sales.arn
  web_acl_arn  = var.waf_web_acl_arn
}
