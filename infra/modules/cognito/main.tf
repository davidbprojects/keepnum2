###############################################################################
# Cognito User Pool
###############################################################################
resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-${var.environment}-user-pool"

  # Sign-in with email
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy — min 8 chars, require uppercase, lowercase, numbers, symbols
  password_policy {
    minimum_length                   = 8
    require_uppercase                = true
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  # Account recovery via verified email
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Advanced security — adaptive authentication for SOC 2
  user_pool_add_ons {
    advanced_security_mode = "AUDIT"
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

###############################################################################
# App Client — no client secret (SPA / mobile)
###############################################################################
resource "aws_cognito_user_pool_client" "app_client" {
  name         = "${var.project_name}-${var.environment}-app-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
  ]

  supported_identity_providers = ["COGNITO"]

  # Token validity
  access_token_validity  = 1   # hours
  id_token_validity      = 1   # hours
  refresh_token_validity = 30  # days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

###############################################################################
# Admin group — for admin panel access (Requirement 15.2)
###############################################################################
resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Administrators with access to the admin panel"
}
