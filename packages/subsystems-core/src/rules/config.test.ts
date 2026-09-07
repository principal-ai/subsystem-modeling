import { describe, it, expect } from 'vitest';
import {
  validatePrivuConfig,
  getDefaultConfig,
  mergeConfigs,
  formatConfigErrors,
  VALID_RULE_IDS,
} from './config';
import type { PrivuConfig } from './types';

describe('validatePrivuConfig', () => {
  it('should accept valid minimal config', () => {
    const config = { root: true };
    const result = validatePrivuConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept valid full config', () => {
    const config: PrivuConfig = {
      $schema: 'https://principal.ai/schemas/privurc.json',
      root: true,
      library: '.principal-views/library.yaml',
      include: ['.principal-views/**/*.yaml'],
      exclude: ['**/*.test.yaml'],
      rules: {
        'required-metadata': 'error',
        'valid-color-format': 'warn',
        'orphaned-node-types': 'off',
        'minimum-node-sources': {
          severity: 'error',
          options: {
            minimum: 1,
            excludeNodeTypes: ['external'],
          },
        },
      },
    };
    const result = validatePrivuConfig(config);
    expect(result.valid).toBe(true);
  });

  it('should reject non-object config', () => {
    const result = validatePrivuConfig('string');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('must be an object');
  });

  it('should reject null config', () => {
    const result = validatePrivuConfig(null);
    expect(result.valid).toBe(false);
  });

  it('should flag unknown top-level fields', () => {
    const config = {
      root: true,
      unknownField: 'value',
    };
    const result = validatePrivuConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('unknownField'))).toBe(true);
  });

  it('should validate root is boolean', () => {
    const config = { root: 'yes' };
    const result = validatePrivuConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'root')).toBe(true);
  });

  it('should validate library is string', () => {
    const config = { library: 123 };
    const result = validatePrivuConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'library')).toBe(true);
  });

  it('should validate include is array of strings', () => {
    const config = { include: 'not-an-array' };
    const result = validatePrivuConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'include')).toBe(true);
  });

  it('should validate extends is string or array', () => {
    const validString = { extends: 'base-config' };
    expect(validatePrivuConfig(validString).valid).toBe(true);

    const validArray = { extends: ['config1', 'config2'] };
    expect(validatePrivuConfig(validArray).valid).toBe(true);

    const invalid = { extends: 123 };
    expect(validatePrivuConfig(invalid).valid).toBe(false);
  });

  describe('rules validation', () => {
    it('should accept valid rule ID', () => {
      const config = {
        rules: {
          'required-metadata': 'error',
        },
      };
      const result = validatePrivuConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should flag unknown rule ID', () => {
      const config = {
        rules: {
          'unknown-rule': 'error',
        },
      };
      const result = validatePrivuConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Unknown rule ID'))).toBe(true);
    });

    it('should suggest similar rule ID', () => {
      const config = {
        rules: {
          'required-metdata': 'error', // typo
        },
      };
      const result = validatePrivuConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.suggestion?.includes('required-metadata'))).toBe(true);
    });

    it('should accept numeric severity', () => {
      const config = {
        rules: {
          'required-metadata': 2,
        },
      };
      const result = validatePrivuConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should accept false to disable', () => {
      const config = {
        rules: {
          'required-metadata': false,
        },
      };
      const result = validatePrivuConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should flag invalid severity', () => {
      const config = {
        rules: {
          'required-metadata': 'fatal',
        },
      };
      const result = validatePrivuConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Invalid severity'))).toBe(true);
    });

    it('should validate rule config object', () => {
      const valid = {
        rules: {
          'minimum-node-sources': {
            severity: 'error',
            options: { minimum: 2 },
          },
        },
      };
      expect(validatePrivuConfig(valid).valid).toBe(true);
    });

    it('should flag unknown rule config fields', () => {
      const config = {
        rules: {
          'required-metadata': {
            severity: 'error',
            unknownField: 'value',
          },
        },
      };
      const result = validatePrivuConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('unknownField'))).toBe(true);
    });

    it('should flag unknown rule options', () => {
      const config = {
        rules: {
          'minimum-node-sources': {
            options: {
              minumum: 2, // typo
            },
          },
        },
      };
      const result = validatePrivuConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.suggestion?.includes('minimum'))).toBe(true);
    });
  });
});

describe('getDefaultConfig', () => {
  it('should return default values', () => {
    const config = getDefaultConfig();
    expect(config.root).toBe(false);
    expect(config.include).toBeDefined();
    expect(config.exclude).toBeDefined();
    expect(config.rules).toEqual({});
  });
});

describe('mergeConfigs', () => {
  it('should merge configs with later taking precedence', () => {
    const base: PrivuConfig = {
      root: false,
      library: 'base-lib.yaml',
      rules: {
        'required-metadata': 'warn',
      },
    };

    const override: PrivuConfig = {
      root: true,
      rules: {
        'required-metadata': 'error',
        'valid-color-format': 'off',
      },
    };

    const merged = mergeConfigs(base, override);
    expect(merged.root).toBe(true);
    expect(merged.library).toBe('base-lib.yaml');
    expect(merged.rules?.['required-metadata']).toBe('error');
    expect(merged.rules?.['valid-color-format']).toBe('off');
  });

  it('should handle undefined configs', () => {
    const config: PrivuConfig = { root: true };
    const merged = mergeConfigs(undefined, config, undefined);
    expect(merged.root).toBe(true);
  });
});

describe('formatConfigErrors', () => {
  it('should format errors for display', () => {
    const errors = [
      { path: 'rules.unknown', message: 'Unknown rule', suggestion: 'Did you mean X?' },
      { path: 'root', message: 'Must be boolean' },
    ];

    const output = formatConfigErrors(errors);
    expect(output).toContain('rules.unknown');
    expect(output).toContain('Unknown rule');
    expect(output).toContain('Did you mean X?');
    expect(output).toContain('2 configuration errors');
  });

  it('should handle single error', () => {
    const errors = [{ path: 'root', message: 'Must be boolean' }];
    const output = formatConfigErrors(errors);
    expect(output).toContain('1 configuration error');
  });
});

describe('VALID_RULE_IDS', () => {
  it('should contain all 13 rule IDs', () => {
    expect(VALID_RULE_IDS.length).toBe(13);
  });

  it('should include expected rules', () => {
    expect(VALID_RULE_IDS).toContain('required-metadata');
    expect(VALID_RULE_IDS).toContain('no-unknown-fields');
    expect(VALID_RULE_IDS).toContain('minimum-node-sources');
    expect(VALID_RULE_IDS).toContain('valid-action-patterns');
  });
});
