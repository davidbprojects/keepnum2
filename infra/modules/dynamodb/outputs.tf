# Table Names
output "call_logs_table_name" {
  description = "Name of the call_logs DynamoDB table"
  value       = aws_dynamodb_table.call_logs.name
}

output "sms_logs_table_name" {
  description = "Name of the sms_logs DynamoDB table"
  value       = aws_dynamodb_table.sms_logs.name
}

output "spam_log_table_name" {
  description = "Name of the spam_log DynamoDB table"
  value       = aws_dynamodb_table.spam_log.name
}

# Table ARNs
output "call_logs_table_arn" {
  description = "ARN of the call_logs DynamoDB table"
  value       = aws_dynamodb_table.call_logs.arn
}

output "sms_logs_table_arn" {
  description = "ARN of the sms_logs DynamoDB table"
  value       = aws_dynamodb_table.sms_logs.arn
}

output "spam_log_table_arn" {
  description = "ARN of the spam_log DynamoDB table"
  value       = aws_dynamodb_table.spam_log.arn
}

# New table names
output "auto_reply_log_table_name" {
  value = aws_dynamodb_table.auto_reply_log.name
}
output "unified_inbox_items_table_name" {
  value = aws_dynamodb_table.unified_inbox_items.name
}
output "device_tokens_table_name" {
  value = aws_dynamodb_table.device_tokens.name
}
output "notification_settings_table_name" {
  value = aws_dynamodb_table.notification_settings.name
}
output "conference_logs_table_name" {
  value = aws_dynamodb_table.conference_logs.name
}

# New table ARNs
output "auto_reply_log_table_arn" {
  value = aws_dynamodb_table.auto_reply_log.arn
}
output "unified_inbox_items_table_arn" {
  value = aws_dynamodb_table.unified_inbox_items.arn
}
output "device_tokens_table_arn" {
  value = aws_dynamodb_table.device_tokens.arn
}
output "notification_settings_table_arn" {
  value = aws_dynamodb_table.notification_settings.arn
}
output "conference_logs_table_arn" {
  value = aws_dynamodb_table.conference_logs.arn
}
