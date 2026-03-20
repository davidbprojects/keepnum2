###############################################################################
# Adyen IP Set — allowlist for webhook traffic
###############################################################################
resource "aws_wafv2_ip_set" "adyen_ips" {
  name               = "${var.project_name}-${var.environment}-adyen-ips"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = var.adyen_ip_cidrs

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

###############################################################################
# WAFv2 WebACL (REGIONAL — for API Gateway association)
###############################################################################
resource "aws_wafv2_web_acl" "main" {
  name        = "${var.project_name}-${var.environment}-web-acl"
  scope       = "REGIONAL"
  description = "WAF WebACL for ${var.project_name} ${var.environment}"

  default_action {
    allow {}
  }

  #---------------------------------------------------------------------------
  # Rule 0 (priority 0): Adyen IP allowlist — allow webhook traffic from
  # Adyen IPs on /webhooks/adyen path
  #---------------------------------------------------------------------------
  rule {
    name     = "adyen-ip-allowlist"
    priority = 0

    action {
      allow {}
    }

    statement {
      and_statement {
        statement {
          ip_set_reference_statement {
            arn = aws_wafv2_ip_set.adyen_ips.arn
          }
        }

        statement {
          byte_match_statement {
            search_string         = "/webhooks/adyen"
            positional_constraint = "STARTS_WITH"

            field_to_match {
              uri_path {}
            }

            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-${var.environment}-adyen-allowlist"
      sampled_requests_enabled   = true
    }
  }

  #---------------------------------------------------------------------------
  # Rule 1 (priority 1): AWS Managed Rules — Common Rule Set
  #---------------------------------------------------------------------------
  rule {
    name     = "aws-managed-common-rules"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-${var.environment}-common-rules"
      sampled_requests_enabled   = true
    }
  }

  #---------------------------------------------------------------------------
  # Rule 2 (priority 2): AWS Managed Rules — Known Bad Inputs
  #---------------------------------------------------------------------------
  rule {
    name     = "aws-managed-known-bad-inputs"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-${var.environment}-known-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  #---------------------------------------------------------------------------
  # Rule 3 (priority 3): Rate limiting per IP
  #---------------------------------------------------------------------------
  rule {
    name     = "rate-limit-per-ip"
    priority = 3

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-${var.environment}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-${var.environment}-web-acl"
    sampled_requests_enabled   = true
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}
