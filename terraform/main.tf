terraform {
  required_version = ">= 1.5.0"
  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 0.15.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

provider "vercel" {
  api_token = var.vercel_api_token
}

# ==========================================
# 1. AWS RDS POSTGRESQL INSTANCE
# ==========================================
resource "aws_db_instance" "postgres" {
  allocated_storage    = 20
  max_allocated_storage = 100
  db_name              = "witech_crm"
  engine               = "postgres"
  engine_version       = "15"
  instance_class       = "db.t3.micro"
  username             = var.db_username
  password             = var.db_password
  parameter_group_name = "default.postgres15"
  skip_final_snapshot  = true
  publicly_accessible  = true # Set to false in production with VPC peering

  tags = {
    Name        = "WitechCRM-Database"
    Environment = var.environment
  }
}

# ==========================================
# 2. AWS S3 BUCKET FOR BACKUPS
# ==========================================
resource "aws_s3_bucket" "backups" {
  bucket        = "witech-backups-${var.environment}"
  force_destroy = false

  tags = {
    Name        = "WitechCRM-Backups"
    Environment = var.environment
  }
}

# Enable versioning on backup bucket
resource "aws_s3_bucket_versioning" "backups_versioning" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Block all public access to backups S3 bucket
resource "aws_s3_bucket_public_access_block" "backups_private" {
  bucket = aws_s3_bucket.backups.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ==========================================
# 3. VERCEL FRONTEND PROJECT
# ==========================================
resource "vercel_project" "frontend" {
  name      = "witech-lead-frontend"
  framework = "vite"

  git_repository = {
    type = "github"
    repo = "Bistrel2002/witech-lead"
  }

  environment = [
    {
      key   = "VITE_API_URL"
      value = var.backend_url
      target = ["production", "preview", "development"]
    },
    {
      key   = "VITE_MOCK_AUTH"
      value = "false"
      target = ["production"]
    }
  ]
}
