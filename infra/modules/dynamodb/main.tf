###############################################################################
# DynamoDB Tables — call_logs, sms_logs, spam_log
# All tables use PAY_PER_REQUEST billing and TTL enabled on `ttl` attribute
###############################################################################

###############################################################################
# call_logs table
# PK: pk (String, composite userId#numberId)
# SK: sk (String, composite timestamp#callId)
###############################################################################
resource "aws_dynamodb_table" "call_logs" {
  name         = "${var.project_name}-${var.environment}-call-logs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.environment == "prod" ? true : false
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-call-logs"
    Project     = var.project_name
    Environment = var.environment
  }
}

###############################################################################
# sms_logs table
# PK: pk (String, composite userId#numberId)
# SK: sk (String, composite timestamp#messageId)
###############################################################################
resource "aws_dynamodb_table" "sms_logs" {
  name         = "${var.project_name}-${var.environment}-sms-logs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.environment == "prod" ? true : false
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-sms-logs"
    Project     = var.project_name
    Environment = var.environment
  }
}

###############################################################################
# spam_log table
# PK: pk (String, userId)
# SK: sk (String, composite timestamp#itemId)
###############################################################################
resource "aws_dynamodb_table" "spam_log" {
  name         = "${var.project_name}-${var.environment}-spam-log"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.environment == "prod" ? true : false
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-spam-log"
    Project     = var.project_name
    Environment = var.environment
  }
}

###############################################################################
# auto_reply_log table
# PK: pk (String, numberId#callerId)
# SK: sk (String, sentAt ISO timestamp)
###############################################################################
resource "aws_dynamodb_table" "auto_reply_log" {
  name         = "${var.project_name}-${var.environment}-auto-reply-log"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled = true
  }
  point_in_time_recovery { enabled = var.environment == "prod" ? true : false }

  tags = {
    Name        = "${var.project_name}-${var.environment}-auto-reply-log"
    Project     = var.project_name
    Environment = var.environment
  }
}

###############################################################################
# unified_inbox_items table
# PK: pk (String, userId)
# SK: sk (String, timestamp#itemType#itemId)
###############################################################################
resource "aws_dynamodb_table" "unified_inbox_items" {
  name         = "${var.project_name}-${var.environment}-unified-inbox-items"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled = true
  }
  point_in_time_recovery { enabled = var.environment == "prod" ? true : false }

  tags = {
    Name        = "${var.project_name}-${var.environment}-unified-inbox-items"
    Project     = var.project_name
    Environment = var.environment
  }
}

###############################################################################
# device_tokens table
# PK: pk (String, userId)
# SK: sk (String, deviceId)
###############################################################################
resource "aws_dynamodb_table" "device_tokens" {
  name         = "${var.project_name}-${var.environment}-device-tokens"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  point_in_time_recovery { enabled = var.environment == "prod" ? true : false }

  tags = {
    Name        = "${var.project_name}-${var.environment}-device-tokens"
    Project     = var.project_name
    Environment = var.environment
  }
}

###############################################################################
# notification_settings table
# PK: pk (String, userId#numberId)
# SK: sk (String, numberType)
###############################################################################
resource "aws_dynamodb_table" "notification_settings" {
  name         = "${var.project_name}-${var.environment}-notification-settings"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  point_in_time_recovery { enabled = var.environment == "prod" ? true : false }

  tags = {
    Name        = "${var.project_name}-${var.environment}-notification-settings"
    Project     = var.project_name
    Environment = var.environment
  }
}

###############################################################################
# conference_logs table
# PK: pk (String, userId)
# SK: sk (String, timestamp#conferenceId)
###############################################################################
resource "aws_dynamodb_table" "conference_logs" {
  name         = "${var.project_name}-${var.environment}-conference-logs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled = true
  }
  point_in_time_recovery { enabled = var.environment == "prod" ? true : false }

  tags = {
    Name        = "${var.project_name}-${var.environment}-conference-logs"
    Project     = var.project_name
    Environment = var.environment
  }
}
