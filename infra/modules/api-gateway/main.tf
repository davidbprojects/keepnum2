###############################################################################
# API Gateway Module — REST API with Cognito authorizer, WAF, CORS
###############################################################################

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

###############################################################################
# REST API
###############################################################################
resource "aws_api_gateway_rest_api" "main" {
  name        = "${var.project_name}-${var.environment}-api"
  description = "KeepNum REST API - ${var.environment}"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

###############################################################################
# Cognito Authorizer
###############################################################################
resource "aws_api_gateway_authorizer" "cognito" {
  name            = "${var.project_name}-${var.environment}-cognito-auth"
  rest_api_id     = aws_api_gateway_rest_api.main.id
  type            = "COGNITO_USER_POOLS"
  identity_source = "method.request.header.Authorization"
  provider_arns   = [var.cognito_user_pool_arn]
}

###############################################################################
# Route configuration map
###############################################################################
locals {
  routes = {
    "POST /auth/register"                                    = { lambda_key = "auth-service", auth = false }
    "POST /auth/login"                                       = { lambda_key = "auth-service", auth = false }
    "POST /auth/refresh"                                     = { lambda_key = "auth-service", auth = false }
    "DELETE /auth/account"                                   = { lambda_key = "auth-service", auth = true }
    "GET /numbers/search"                                    = { lambda_key = "number-service", auth = true }
    "POST /numbers"                                          = { lambda_key = "number-service", auth = true }
    "GET /numbers"                                           = { lambda_key = "number-service", auth = true }
    "DELETE /numbers/{id}"                                   = { lambda_key = "number-service", auth = true }
    "PUT /numbers/{id}/forwarding-rule"                      = { lambda_key = "number-service", auth = true }
    "PUT /numbers/{id}/retention"                            = { lambda_key = "number-service", auth = true }
    "PUT /numbers/{id}/greeting"                             = { lambda_key = "number-service", auth = true }
    "POST /numbers/{id}/caller-rules"                        = { lambda_key = "number-service", auth = true }
    "DELETE /numbers/{id}/caller-rules/{ruleId}"             = { lambda_key = "number-service", auth = true }
    "POST /numbers/{id}/blocklist"                           = { lambda_key = "number-service", auth = true }
    "DELETE /numbers/{id}/blocklist/{callerId}"              = { lambda_key = "number-service", auth = true }
    "POST /numbers/{id}/dnd-schedules"                       = { lambda_key = "number-service", auth = true }
    "GET /numbers/{id}/dnd-schedules"                        = { lambda_key = "number-service", auth = true }
    "PUT /numbers/{id}/dnd-schedules/{scheduleId}"           = { lambda_key = "number-service", auth = true }
    "DELETE /numbers/{id}/dnd-schedules/{scheduleId}"        = { lambda_key = "number-service", auth = true }
    "PUT /numbers/{id}/dnd-schedules/{scheduleId}/toggle"    = { lambda_key = "number-service", auth = true }
    "POST /contacts/import"                                  = { lambda_key = "number-service", auth = true }
    "GET /contacts"                                          = { lambda_key = "number-service", auth = true }
    "PUT /contacts/{contactId}"                              = { lambda_key = "number-service", auth = true }
    "DELETE /contacts/{contactId}"                           = { lambda_key = "number-service", auth = true }
    "PUT /contacts/tier-actions"                             = { lambda_key = "number-service", auth = true }
    "GET /voicemails"                                        = { lambda_key = "voicemail-service", auth = true }
    "GET /voicemails/{id}"                                   = { lambda_key = "voicemail-service", auth = true }
    "PUT /voicemails/bulk/move"                              = { lambda_key = "voicemail-service", auth = true }
    "PUT /voicemails/bulk/read"                              = { lambda_key = "voicemail-service", auth = true }
    "DELETE /voicemails/bulk/delete"                         = { lambda_key = "voicemail-service", auth = true }
    "GET /voicemails/search"                                 = { lambda_key = "voicemail-service", auth = true }
    "POST /voicemails/{id}/share"                            = { lambda_key = "voicemail-service", auth = true }
    "DELETE /voicemails/{id}/share/{shareToken}"             = { lambda_key = "voicemail-service", auth = true }
    "PUT /voicemails/sms-config"                             = { lambda_key = "voicemail-service", auth = true }
    "GET /voicemails/sms-config"                             = { lambda_key = "voicemail-service", auth = true }
    "GET /recordings"                                        = { lambda_key = "voicemail-service", auth = true }
    "GET /recordings/{callId}"                               = { lambda_key = "voicemail-service", auth = true }
    "GET /download/recording/{callId}"                       = { lambda_key = "voicemail-service", auth = true }
    "GET /greetings/marketplace"                             = { lambda_key = "voicemail-service", auth = true }
    "GET /greetings/marketplace/{id}/preview"                = { lambda_key = "voicemail-service", auth = true }
    "POST /greetings/marketplace/{id}/apply"                 = { lambda_key = "voicemail-service", auth = true }
    "POST /greetings/custom-request"                         = { lambda_key = "voicemail-service", auth = true }
    "GET /logs/calls"                                        = { lambda_key = "log-service", auth = true }
    "GET /logs/sms"                                          = { lambda_key = "log-service", auth = true }
    "GET /download/voicemail/{id}"                           = { lambda_key = "download-service", auth = true }
    "GET /download/sms/{numberId}"                           = { lambda_key = "download-service", auth = true }
    "POST /billing/session"                                  = { lambda_key = "billing-service", auth = true }
    "POST /billing/subscriptions"                            = { lambda_key = "billing-service", auth = true }
    "PUT /billing/subscriptions/{id}"                        = { lambda_key = "billing-service", auth = true }
    "DELETE /billing/subscriptions/{id}"                     = { lambda_key = "billing-service", auth = true }
    "POST /billing/subscriptions/{id}/reactivate"            = { lambda_key = "billing-service", auth = true }
    "GET /billing/invoices"                                  = { lambda_key = "billing-service", auth = true }
    "GET /admin/users"                                       = { lambda_key = "admin-service", auth = true }
    "GET /admin/users/{id}"                                  = { lambda_key = "admin-service", auth = true }
    "PUT /admin/users/{id}/status"                           = { lambda_key = "admin-service", auth = true }
    "PUT /admin/users/{id}/package"                          = { lambda_key = "admin-service", auth = true }
    "PUT /admin/users/{id}/feature-flags"                    = { lambda_key = "admin-service", auth = true }
    "GET /admin/users/{id}/billing"                          = { lambda_key = "admin-service", auth = true }
    "GET /admin/packages"                                    = { lambda_key = "admin-service", auth = true }
    "POST /admin/packages"                                   = { lambda_key = "admin-service", auth = true }
    "PUT /admin/packages/{id}"                               = { lambda_key = "admin-service", auth = true }
    "DELETE /admin/packages/{id}"                            = { lambda_key = "admin-service", auth = true }
    "GET /admin/feature-flags/defaults"                      = { lambda_key = "admin-service", auth = true }
    "PUT /admin/feature-flags/defaults"                      = { lambda_key = "admin-service", auth = true }
    "GET /admin/audit-log"                                   = { lambda_key = "admin-service", auth = true }
    "GET /admin/logs"                                        = { lambda_key = "admin-service", auth = true }
    "GET /admin/logs/auth"                                   = { lambda_key = "admin-service", auth = true }
    "GET /admin/greetings"                                   = { lambda_key = "admin-service", auth = true }
    "POST /admin/greetings"                                  = { lambda_key = "admin-service", auth = true }
    "PUT /admin/greetings/{id}"                              = { lambda_key = "admin-service", auth = true }
    "DELETE /admin/greetings/{id}"                           = { lambda_key = "admin-service", auth = true }
    "GET /packages/public"                                   = { lambda_key = "admin-service", auth = false }
    "POST /webhooks/telnyx/call"                             = { lambda_key = "call-service", auth = false }
    "POST /webhooks/telnyx/sms"                              = { lambda_key = "sms-service", auth = false }
    "POST /webhooks/telnyx/voicemail"                        = { lambda_key = "voicemail-service", auth = false }
    "POST /webhooks/adyen"                                   = { lambda_key = "billing-service", auth = false }
    "POST /webhooks/telnyx/ivr"                              = { lambda_key = "ivr-service", auth = false }
    "POST /webhooks/telnyx/conference"                       = { lambda_key = "conference-service", auth = false }
    "GET /virtual-numbers/search"                            = { lambda_key = "virtual-number-service", auth = true }
    "POST /virtual-numbers"                                  = { lambda_key = "virtual-number-service", auth = true }
    "GET /virtual-numbers"                                   = { lambda_key = "virtual-number-service", auth = true }
    "GET /virtual-numbers/{id}"                              = { lambda_key = "virtual-number-service", auth = true }
    "DELETE /virtual-numbers/{id}"                           = { lambda_key = "virtual-number-service", auth = true }
    "PUT /virtual-numbers/{id}/greeting"                     = { lambda_key = "virtual-number-service", auth = true }
    "PUT /virtual-numbers/{id}/forwarding-rule"              = { lambda_key = "virtual-number-service", auth = true }
    "POST /virtual-numbers/{id}/caller-rules"                = { lambda_key = "virtual-number-service", auth = true }
    "DELETE /virtual-numbers/{id}/caller-rules/{ruleId}"     = { lambda_key = "virtual-number-service", auth = true }
    "POST /virtual-numbers/{id}/blocklist"                   = { lambda_key = "virtual-number-service", auth = true }
    "DELETE /virtual-numbers/{id}/blocklist/{callerId}"      = { lambda_key = "virtual-number-service", auth = true }
    "POST /virtual-numbers/{id}/outbound-call"               = { lambda_key = "virtual-number-service", auth = true }
    "POST /virtual-numbers/{id}/outbound-sms"                = { lambda_key = "virtual-number-service", auth = true }
    "POST /ivr-menus"                                        = { lambda_key = "ivr-service", auth = true }
    "GET /ivr-menus"                                         = { lambda_key = "ivr-service", auth = true }
    "GET /ivr-menus/{id}"                                    = { lambda_key = "ivr-service", auth = true }
    "PUT /ivr-menus/{id}"                                    = { lambda_key = "ivr-service", auth = true }
    "DELETE /ivr-menus/{id}"                                 = { lambda_key = "ivr-service", auth = true }
    "POST /auto-reply-templates"                             = { lambda_key = "auto-reply-service", auth = true }
    "GET /auto-reply-templates"                              = { lambda_key = "auto-reply-service", auth = true }
    "PUT /auto-reply-templates/{id}"                         = { lambda_key = "auto-reply-service", auth = true }
    "DELETE /auto-reply-templates/{id}"                      = { lambda_key = "auto-reply-service", auth = true }
    "GET /unified-inbox"                                     = { lambda_key = "unified-inbox-service", auth = true }
    "GET /unified-inbox/unread-count"                        = { lambda_key = "unified-inbox-service", auth = true }
    "GET /unified-inbox/{itemId}"                            = { lambda_key = "unified-inbox-service", auth = true }
    "POST /privacy-scans"                                    = { lambda_key = "privacy-scan-service", auth = true }
    "GET /privacy-scans"                                     = { lambda_key = "privacy-scan-service", auth = true }
    "GET /privacy-scans/{scanId}"                            = { lambda_key = "privacy-scan-service", auth = true }
    "GET /privacy-scans/{scanId}/compare"                    = { lambda_key = "privacy-scan-service", auth = true }
    "GET /caller-id/lookup/{phoneNumber}"                    = { lambda_key = "caller-id-service", auth = true }
    "POST /caller-id/lookup"                                 = { lambda_key = "caller-id-service", auth = true }
    "POST /conferences"                                      = { lambda_key = "conference-service", auth = true }
    "GET /conferences"                                       = { lambda_key = "conference-service", auth = true }
    "GET /conferences/{id}"                                  = { lambda_key = "conference-service", auth = true }
    "DELETE /conferences/{id}"                               = { lambda_key = "conference-service", auth = true }
    "PUT /conferences/{id}/participants/{participantId}"     = { lambda_key = "conference-service", auth = true }
    "DELETE /conferences/{id}/participants/{participantId}"  = { lambda_key = "conference-service", auth = true }
    "POST /conferences/{id}/merge"                           = { lambda_key = "conference-service", auth = true }
    "POST /devices"                                          = { lambda_key = "notification-service", auth = true }
    "DELETE /devices/{deviceId}"                             = { lambda_key = "notification-service", auth = true }
    "PUT /notifications/settings"                            = { lambda_key = "notification-service", auth = true }
    "GET /notifications/settings"                            = { lambda_key = "notification-service", auth = true }
    "GET /shared/voicemail/{shareToken}"                     = { lambda_key = "voicemail-service", auth = false }
  }

  route_parsed = {
    for key, cfg in local.routes : key => {
      method     = split(" ", key)[0]
      full_path  = split(" ", key)[1]
      parts      = split("/", trimprefix(split(" ", key)[1], "/"))
      lambda_key = cfg.lambda_key
      auth       = cfg.auth
    }
  }

  all_resource_paths = distinct(flatten([
    for key, r in local.route_parsed : [
      for i in range(1, length(r.parts) + 1) :
      join("/", slice(r.parts, 0, i))
    ]
  ]))

  # Split paths into levels to avoid Terraform cycle errors
  level1_paths = { for p in local.all_resource_paths : p => element(split("/", p), length(split("/", p)) - 1) if length(split("/", p)) == 1 }
  level2_paths = { for p in local.all_resource_paths : p => {
    path_part = element(split("/", p), length(split("/", p)) - 1)
    parent    = join("/", slice(split("/", p), 0, length(split("/", p)) - 1))
  } if length(split("/", p)) == 2 }
  level3_paths = { for p in local.all_resource_paths : p => {
    path_part = element(split("/", p), length(split("/", p)) - 1)
    parent    = join("/", slice(split("/", p), 0, length(split("/", p)) - 1))
  } if length(split("/", p)) == 3 }
  level4_paths = { for p in local.all_resource_paths : p => {
    path_part = element(split("/", p), length(split("/", p)) - 1)
    parent    = join("/", slice(split("/", p), 0, length(split("/", p)) - 1))
  } if length(split("/", p)) == 4 }
  level5_paths = { for p in local.all_resource_paths : p => {
    path_part = element(split("/", p), length(split("/", p)) - 1)
    parent    = join("/", slice(split("/", p), 0, length(split("/", p)) - 1))
  } if length(split("/", p)) == 5 }

  # Unified lookup map for resource IDs
  all_resource_ids = merge(
    { for k, v in aws_api_gateway_resource.level1 : k => v.id },
    { for k, v in aws_api_gateway_resource.level2 : k => v.id },
    { for k, v in aws_api_gateway_resource.level3 : k => v.id },
    { for k, v in aws_api_gateway_resource.level4 : k => v.id },
    { for k, v in aws_api_gateway_resource.level5 : k => v.id },
  )

  unique_lambda_keys = distinct([for k, r in local.route_parsed : r.lambda_key])
}

###############################################################################
# API Resources — split by depth level to avoid cycles
###############################################################################
resource "aws_api_gateway_resource" "level1" {
  for_each    = local.level1_paths
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = each.value
}

resource "aws_api_gateway_resource" "level2" {
  for_each    = local.level2_paths
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.level1[each.value.parent].id
  path_part   = each.value.path_part
}

resource "aws_api_gateway_resource" "level3" {
  for_each    = local.level3_paths
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.level2[each.value.parent].id
  path_part   = each.value.path_part
}

resource "aws_api_gateway_resource" "level4" {
  for_each    = local.level4_paths
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.level3[each.value.parent].id
  path_part   = each.value.path_part
}

resource "aws_api_gateway_resource" "level5" {
  for_each    = local.level5_paths
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.level4[each.value.parent].id
  path_part   = each.value.path_part
}

###############################################################################
# Methods
###############################################################################
resource "aws_api_gateway_method" "routes" {
  for_each = local.route_parsed

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = local.all_resource_ids[join("/", each.value.parts)]
  http_method = each.value.method

  authorization = each.value.auth ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id = each.value.auth ? aws_api_gateway_authorizer.cognito.id : null

  request_parameters = {
    "method.request.header.Authorization" = each.value.auth
  }
}

###############################################################################
# Lambda Integrations
###############################################################################
resource "aws_api_gateway_integration" "routes" {
  for_each = local.route_parsed

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = local.all_resource_ids[join("/", each.value.parts)]
  http_method             = aws_api_gateway_method.routes[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arns[each.value.lambda_key]
}

###############################################################################
# Lambda Permissions
###############################################################################
resource "aws_lambda_permission" "apigw" {
  for_each = toset(local.unique_lambda_keys)

  statement_id  = "AllowAPIGatewayInvoke-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_arns[each.key]
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

###############################################################################
# CORS — OPTIONS on every resource path
###############################################################################
resource "aws_api_gateway_method" "cors" {
  for_each = toset(local.all_resource_paths)

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = local.all_resource_ids[each.key]
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "cors" {
  for_each = toset(local.all_resource_paths)

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = local.all_resource_ids[each.key]
  http_method = aws_api_gateway_method.cors[each.key].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "cors" {
  for_each = toset(local.all_resource_paths)

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = local.all_resource_ids[each.key]
  http_method = aws_api_gateway_method.cors[each.key].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  response_models = {
    "application/json" = "Empty"
  }
}

resource "aws_api_gateway_integration_response" "cors" {
  for_each = toset(local.all_resource_paths)

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = local.all_resource_ids[each.key]
  http_method = aws_api_gateway_method.cors[each.key].http_method
  status_code = aws_api_gateway_method_response.cors[each.key].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

###############################################################################
# Deployment + Stage
###############################################################################
resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  triggers = {
    redeployment = sha1(jsonencode([
      local.routes,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_method.routes,
    aws_api_gateway_integration.routes,
    aws_api_gateway_method.cors,
    aws_api_gateway_integration.cors,
  ]
}

resource "aws_api_gateway_stage" "main" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  deployment_id = aws_api_gateway_deployment.main.id
  stage_name    = var.environment

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

###############################################################################
# WAF Association
###############################################################################
resource "aws_wafv2_web_acl_association" "api_gateway" {
  resource_arn = aws_api_gateway_stage.main.arn
  web_acl_arn  = var.waf_web_acl_arn
}

###############################################################################
# Gateway Responses — CORS on errors
###############################################################################
resource "aws_api_gateway_gateway_response" "default_4xx" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "DEFAULT_4XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
  }
}

resource "aws_api_gateway_gateway_response" "default_5xx" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = "DEFAULT_5XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin"  = "'*'"
    "gatewayresponse.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
  }
}
