import type {
  SubsystemComponent,
  SubsystemWalkthrough,
} from '@principal-ai/subsystems-react';

const PURL = 'pkg:github/you/terraform-site';

export const components: SubsystemComponent[] = [
  {
    alias: 'root-module',
    process: 'terraform-site',
    name: 'module.site',
    construct: 'custom_entity',
    symbol: 'module.site',
    role: 'entry',
    framework: 'terraform',
    stereotype: 'module',
    purl: PURL,
    file: 'main.tf',
    declarationRef: {
      file: 'main.tf',
      startLine: 2,
      lineHash: '406fd4d497a10af5b50089ce0ca0cabe',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'main.tf',
    purpose: 'Root module — wires the reusable static_site module.',
    layer: 1,
  },
  {
    alias: 'static-site',
    process: 'terraform-site',
    name: 'static_site',
    construct: 'custom_entity',
    symbol: 'static_site',
    framework: 'terraform',
    stereotype: 'module',
    purl: PURL,
    file: 'modules/static_site/main.tf',
    declarationRef: {
      file: 'modules/static_site/main.tf',
      startLine: 1,
      lineHash: 'f576110648832b0386de6be9a38f2844',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'modules/static_site/main.tf',
    purpose: 'Child module — bucket + website config.',
    layer: 2,
  },
  {
    alias: 'aws-provider',
    process: 'terraform-site',
    name: 'provider.aws',
    construct: 'custom_entity',
    symbol: 'provider.aws',
    purl: PURL,
    file: 'providers.tf',
    declarationRef: {
      file: 'providers.tf',
      startLine: 10,
      lineHash: 'b191e0aeb258e69831e4e7f69f3e30ce',
      capturedAt: '2025-01-01T00:00:00.000Z',
    },
    module: 'providers.tf',
    purpose: 'AWS provider configuration.',
    layer: 2,
  },
  {
    alias: 'AWS',
    name: 'AWS',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
    purpose: 'Cloud API that apply talks to.',
    layer: 3,
  },
];

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
        "purl": PURL,
        "symbol": "module \"site\"",
        "annotation": "Root invokes the child module."
      },
      {
        "from": "static-site",
        "to": "AWS",
        "mechanism": "writes",
        "file": "modules/static_site/main.tf",
        "line": 1,
        "purl": PURL,
        "symbol": "aws_s3_bucket",
        "annotation": "Module declares the bucket resource."
      },
      {
        "from": "static-site",
        "to": "AWS",
        "mechanism": "writes",
        "file": "modules/static_site/main.tf",
        "line": 6,
        "purl": PURL,
        "symbol": "aws_s3_bucket_website_configuration",
        "annotation": "Website hosting config on the same bucket."
      },
      {
        "from": "aws-provider",
        "to": "AWS",
        "mechanism": "calls",
        "file": "providers.tf",
        "line": 10,
        "purl": PURL,
        "symbol": "provider \"aws\"",
        "annotation": "Provider authenticates calls to AWS."
      }
    ]
  }
] as SubsystemWalkthrough[];

export const title = 'Terraform static site';
export const description =
  'Infra-as-code subsystem: **root module → static_site module → AWS** (S3 website bucket). Open **Walkthroughs** for `terraform apply`.';
