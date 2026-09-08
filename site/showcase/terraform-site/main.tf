# Static site bucket — root module wires the reusable S3 module.
module "site" {
  source      = "./modules/static_site"
  bucket_name = var.bucket_name
  tags        = var.tags
}

output "website_endpoint" {
  value = module.site.website_endpoint
}
