output "web_app_id" {
  description = "Amplify App ID for the web application"
  value       = aws_amplify_app.web.id
}

output "web_app_default_domain" {
  description = "Default domain URL for the web application"
  value       = "https://main.${aws_amplify_app.web.default_domain}"
}

output "admin_app_id" {
  description = "Amplify App ID for the admin application"
  value       = aws_amplify_app.admin.id
}

output "admin_app_default_domain" {
  description = "Default domain URL for the admin application"
  value       = "https://main.${aws_amplify_app.admin.default_domain}"
}

output "sales_app_id" {
  description = "Amplify App ID for the sales landing page"
  value       = aws_amplify_app.sales.id
}

output "sales_app_default_domain" {
  description = "Default domain URL for the sales landing page"
  value       = "https://main.${aws_amplify_app.sales.default_domain}"
}

output "web_app_raw_domain" {
  description = "Raw default domain for the web application (without https://main. prefix)"
  value       = aws_amplify_app.web.default_domain
}

output "admin_app_raw_domain" {
  description = "Raw default domain for the admin application"
  value       = aws_amplify_app.admin.default_domain
}

output "sales_app_raw_domain" {
  description = "Raw default domain for the sales landing page"
  value       = aws_amplify_app.sales.default_domain
}
