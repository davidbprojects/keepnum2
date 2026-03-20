output "web_acl_id" {
  description = "WAFv2 WebACL ID"
  value       = aws_wafv2_web_acl.main.id
}

output "web_acl_arn" {
  description = "WAFv2 WebACL ARN"
  value       = aws_wafv2_web_acl.main.arn
}
