output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = aws_eks_cluster.main.endpoint
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = aws_eks_cluster.main.name
}

output "ecr_repository_urls" {
  description = "ECR repository URLs"
  value = {
    api      = aws_ecr_repository.api.repository_url
    worker   = aws_ecr_repository.worker.repository_url
    frontend = aws_ecr_repository.frontend.repository_url
  }
}

output "s3_bucket_name" {
  description = "S3 bucket name"
  value       = aws_s3_bucket.main.id
}

output "rds_endpoint" {
  description = "RDS endpoint"
  value       = aws_db_instance.main.endpoint
}

output "elasticache_endpoint" {
  description = "ElastiCache endpoint"
  value       = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "irsa_role_arn" {
  description = "IRSA role ARN for sheetflow service account"
  value       = aws_iam_role.sheetflow_sa.arn
}
