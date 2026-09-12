import type {
  SubsystemComponent,
  SubsystemRelation,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/terraform-site';

export const components: SubsystemComponent[] = [
  {
    id: 'root-module',
    process: 'terraform-site',
    name: 'module.site',
    construct: 'module',
    symbol: 'module.site',
    role: 'entry',
    framework: 'terraform',
    stereotype: 'module',
    purl: PURL,
    file: 'main.tf',
    purpose: 'Root module — wires the reusable static_site module.',
    layer: 1,
  },
  {
    id: 'static-site',
    process: 'terraform-site',
    name: 'static_site',
    construct: 'module',
    symbol: 'static_site',
    framework: 'terraform',
    stereotype: 'module',
    purl: PURL,
    file: 'modules/static_site/main.tf',
    purpose: 'Child module — bucket + website config.',
    layer: 2,
  },
  {
    id: 'aws-provider',
    process: 'terraform-site',
    name: 'provider.aws',
    construct: 'module',
    symbol: 'provider.aws',
    purl: PURL,
    file: 'providers.tf',
    purpose: 'AWS provider configuration.',
    layer: 2,
  },
  {
    id: 'AWS',
    name: 'AWS',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Cloud API that apply talks to.',
    layer: 3,
  },
];

export const relations = [] as SubsystemRelation[];

export const walkthroughs = [
  {
    "id": "tl-apply",
    "title": "terraform apply",
    "steps": [
      {
        "from": "root-module",
        "to": "static-site",
        "mechanism": "calls",
        "file": "main.tf",
        "line": 2,
        "symbol": "module \"site\"",
        "annotation": "Root invokes the child module."
      },
      {
        "from": "static-site",
        "to": "AWS",
        "mechanism": "writes",
        "file": "modules/static_site/main.tf",
        "line": 1,
        "symbol": "aws_s3_bucket",
        "annotation": "Module declares the bucket resource."
      },
      {
        "from": "static-site",
        "to": "AWS",
        "mechanism": "writes",
        "file": "modules/static_site/main.tf",
        "line": 6,
        "symbol": "aws_s3_bucket_website_configuration",
        "annotation": "Website hosting config on the same bucket."
      },
      {
        "from": "aws-provider",
        "to": "AWS",
        "mechanism": "calls",
        "file": "providers.tf",
        "line": 10,
        "symbol": "provider \"aws\"",
        "annotation": "Provider authenticates calls to AWS."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'Terraform static site';
export const description =
  'Infra-as-code subsystem: **root module → static_site module → AWS** (S3 website bucket). Open **Walkthroughs** for `terraform apply`.';
