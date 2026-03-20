###############################################################################
# Security Group — inbound 5432 from Lambda SG only
###############################################################################
resource "aws_security_group" "aurora" {
  name        = "${var.project_name}-${var.environment}-aurora-sg"
  description = "Allow PostgreSQL access from Lambda functions only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from Lambda"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.lambda_security_group_id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-aurora-sg"
    Project     = var.project_name
    Environment = var.environment
  }
}

###############################################################################
# DB Subnet Group
###############################################################################
resource "aws_db_subnet_group" "aurora" {
  name       = "${var.project_name}-${var.environment}-aurora-subnet-group"
  subnet_ids = var.subnet_ids

  tags = {
    Name        = "${var.project_name}-${var.environment}-aurora-subnet-group"
    Project     = var.project_name
    Environment = var.environment
  }
}

###############################################################################
# Aurora Serverless v2 PostgreSQL Cluster
###############################################################################
resource "aws_rds_cluster" "aurora" {
  cluster_identifier = "${var.project_name}-${var.environment}-aurora-cluster"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned"
  engine_version     = "15.8"
  database_name      = "keepnum"
  master_username    = var.master_username
  master_password    = var.master_password

  db_subnet_group_name   = aws_db_subnet_group.aurora.name
  vpc_security_group_ids = [aws_security_group.aurora.id]

  # Automated backups
  backup_retention_period = 7
  preferred_backup_window = "03:00-04:00"

  # Serverless v2 scaling
  serverlessv2_scaling_configuration {
    min_capacity = var.min_capacity
    max_capacity = var.max_capacity
  }

  # Deletion protection (disable in dev if needed)
  deletion_protection = var.environment == "prod" ? true : false
  skip_final_snapshot = var.environment == "prod" ? false : true

  final_snapshot_identifier = var.environment == "prod" ? "${var.project_name}-${var.environment}-aurora-final-snapshot" : null

  storage_encrypted = true

  tags = {
    Name        = "${var.project_name}-${var.environment}-aurora-cluster"
    Project     = var.project_name
    Environment = var.environment
  }
}

###############################################################################
# Aurora Serverless v2 Cluster Instance
###############################################################################
resource "aws_rds_cluster_instance" "aurora" {
  identifier         = "${var.project_name}-${var.environment}-aurora-instance-1"
  cluster_identifier = aws_rds_cluster.aurora.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.aurora.engine
  engine_version     = aws_rds_cluster.aurora.engine_version

  tags = {
    Name        = "${var.project_name}-${var.environment}-aurora-instance-1"
    Project     = var.project_name
    Environment = var.environment
  }
}
