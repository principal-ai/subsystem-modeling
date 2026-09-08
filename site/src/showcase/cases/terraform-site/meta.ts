import type { ShowcaseCaseMeta } from '../types';

export const meta: ShowcaseCaseMeta = {
  id: 'terraform-site',
  shortTitle: 'Terraform static site',
  blurb: 'Root module → S3 static site module → AWS provider.',
  stack: 'Terraform',
  axes: ['job', 'stack', 'insight'],
  complexity: 'medium',
  storyTitle: 'Terraform/Static site',
};
