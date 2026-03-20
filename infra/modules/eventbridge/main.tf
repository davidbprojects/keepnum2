###############################################################################
# EventBridge Module — Daily scheduled rule targeting retention-job Lambda
###############################################################################

###############################################################################
# CloudWatch Event Rule — runs daily at 3 AM UTC
###############################################################################
resource "aws_cloudwatch_event_rule" "retention_schedule" {
  name                = "${var.project_name}-${var.environment}-retention-schedule"
  description         = "Triggers the retention-job Lambda daily at 3 AM UTC"
  schedule_expression = "cron(0 3 * * ? *)"

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

###############################################################################
# Event Target — points to the retention-job Lambda
###############################################################################
resource "aws_cloudwatch_event_target" "retention_lambda" {
  rule      = aws_cloudwatch_event_rule.retention_schedule.name
  target_id = "${var.project_name}-${var.environment}-retention-job"
  arn       = var.retention_job_lambda_arn
}

###############################################################################
# Lambda Permission — allow EventBridge to invoke the retention-job Lambda
###############################################################################
resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.retention_job_lambda_function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.retention_schedule.arn
}
