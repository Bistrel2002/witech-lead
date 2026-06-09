variable "aws_region" {
  type        = string
  default     = "eu-west-3" # Paris region
  description = "AWS region for RDS and S3 resources"
}

variable "environment" {
  type        = string
  default     = "production"
  description = "Deployment environment (production, staging, dev)"
}

variable "vercel_api_token" {
  type        = string
  sensitive   = true
  description = "API Token generated from Vercel Account Settings"
}

variable "db_username" {
  type        = string
  default     = "crm_admin"
  description = "Master username for RDS PostgreSQL instance"
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "Master password for RDS PostgreSQL instance"
}

variable "backend_url" {
  type        = string
  description = "Active backend API server domain URL (e.g. https://api.witechagency.com)"
}
