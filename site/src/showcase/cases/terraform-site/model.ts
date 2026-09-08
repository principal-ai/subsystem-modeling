import type {
  SubsystemComponent,
  SubsystemComponentEdge,
} from '@principal-ai/subsystems-react';
import type { SubsystemThroughline } from '@principal-ai/subsystems-react/dist/subsystem/model.js';

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

export const edges: SubsystemComponentEdge[] = [
  { id: 'e0', from: 'root-module', to: 'static-site', mechanism: 'calls' },
  { id: 'e1', from: 'static-site', to: 'aws-provider', mechanism: 'uses' },
  { id: 'e2', from: 'aws-provider', to: 'AWS', mechanism: 'calls' },
  { id: 'e3', from: 'static-site', to: 'AWS', mechanism: 'writes' },
];

export const throughlines: SubsystemThroughline[] = [
  {
    id: 'tl-apply',
    title: 'terraform apply',
    steps: [
      { edgeId: 'e0', file: 'main.tf', line: 2, symbol: 'module "site"', annotation: 'Root invokes the child module.' },
      { edgeId: 'e3', file: 'modules/static_site/main.tf', line: 1, symbol: 'aws_s3_bucket', annotation: 'Module declares the bucket resource.' },
      { edgeId: 'e3', file: 'modules/static_site/main.tf', line: 6, symbol: 'aws_s3_bucket_website_configuration', annotation: 'Website hosting config on the same bucket.' },
      { edgeId: 'e2', file: 'providers.tf', line: 10, symbol: 'provider "aws"', annotation: 'Provider authenticates calls to AWS.' },
    ],
  },
];

export const title = 'Terraform static site';
export const description =
  'Infra-as-code subsystem: **root module → static_site module → AWS** (S3 website bucket). Open **Flows** for `terraform apply`.';
