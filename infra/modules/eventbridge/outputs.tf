output "rule_arn" {
  description = "ARN of the EventBridge scheduled rule"
  value       = aws_cloudwatch_event_rule.retention_schedule.arn
}

output "rule_name" {
  description = "Name of the EventBridge scheduled rule"
  value       = aws_cloudwatch_event_rule.retention_schedule.name
}
