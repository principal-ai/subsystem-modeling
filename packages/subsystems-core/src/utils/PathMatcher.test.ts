import { describe, it, expect } from 'bun:test';
import { PathMatcher } from './PathMatcher';

describe('PathMatcher', () => {
  describe('exact matches', () => {
    it('should match exact paths', () => {
      expect(PathMatcher.matches('lib/lock-manager.ts', 'lib/lock-manager.ts')).toBe(true);
      expect(PathMatcher.matches('lib/lock-manager.ts', 'lib/github-api.ts')).toBe(false);
    });

    it('should normalize path separators', () => {
      expect(PathMatcher.matches('lib\\lock-manager.ts', 'lib/lock-manager.ts')).toBe(true);
      expect(PathMatcher.matches('lib/lock-manager.ts', 'lib\\lock-manager.ts')).toBe(true);
    });
  });

  describe('wildcard patterns', () => {
    it('should match * (single segment wildcard)', () => {
      expect(PathMatcher.matches('lib/lock-manager.ts', 'lib/*.ts')).toBe(true);
      expect(PathMatcher.matches('lib/github-api.ts', 'lib/*.ts')).toBe(true);
      expect(PathMatcher.matches('lib/foo/bar.ts', 'lib/*.ts')).toBe(false); // * doesn't cross directories
    });

    it('should match ** (recursive wildcard)', () => {
      expect(PathMatcher.matches('lib/lock-manager.ts', 'lib/**/*.ts')).toBe(true);
      expect(PathMatcher.matches('lib/foo/bar.ts', 'lib/**/*.ts')).toBe(true);
      expect(PathMatcher.matches('lib/foo/baz/qux.ts', 'lib/**/*.ts')).toBe(true);
      expect(PathMatcher.matches('src/index.ts', 'lib/**/*.ts')).toBe(false);
    });

    it('should match ? (single character)', () => {
      expect(PathMatcher.matches('lib/a.ts', 'lib/?.ts')).toBe(true);
      expect(PathMatcher.matches('lib/b.ts', 'lib/?.ts')).toBe(true);
      expect(PathMatcher.matches('lib/ab.ts', 'lib/?.ts')).toBe(false);
    });
  });

  describe('character sets', () => {
    it('should match [abc] patterns', () => {
      expect(PathMatcher.matches('lib/a.ts', 'lib/[abc].ts')).toBe(true);
      expect(PathMatcher.matches('lib/b.ts', 'lib/[abc].ts')).toBe(true);
      expect(PathMatcher.matches('lib/c.ts', 'lib/[abc].ts')).toBe(true);
      expect(PathMatcher.matches('lib/d.ts', 'lib/[abc].ts')).toBe(false);
    });

    it('should match [a-z] range patterns', () => {
      expect(PathMatcher.matches('lib/a.ts', 'lib/[a-z].ts')).toBe(true);
      expect(PathMatcher.matches('lib/m.ts', 'lib/[a-z].ts')).toBe(true);
      expect(PathMatcher.matches('lib/z.ts', 'lib/[a-z].ts')).toBe(true);
      expect(PathMatcher.matches('lib/A.ts', 'lib/[a-z].ts')).toBe(false);
    });
  });

  describe('alternatives', () => {
    it('should match {a,b,c} alternatives', () => {
      expect(PathMatcher.matches('lib/foo.ts', 'lib/{foo,bar,baz}.ts')).toBe(true);
      expect(PathMatcher.matches('lib/bar.ts', 'lib/{foo,bar,baz}.ts')).toBe(true);
      expect(PathMatcher.matches('lib/baz.ts', 'lib/{foo,bar,baz}.ts')).toBe(true);
      expect(PathMatcher.matches('lib/qux.ts', 'lib/{foo,bar,baz}.ts')).toBe(false);
    });

    it('should match nested alternatives', () => {
      expect(PathMatcher.matches('lib/services/api.ts', '{lib,src}/**/*.ts')).toBe(true);
      expect(PathMatcher.matches('src/components/App.tsx', '{lib,src}/**/*.{ts,tsx}')).toBe(true);
    });
  });

  describe('complex patterns', () => {
    it('should match combined patterns', () => {
      const pattern = 'lib/{services,utils}/**/*.{ts,js}';
      expect(PathMatcher.matches('lib/services/api.ts', pattern)).toBe(true);
      expect(PathMatcher.matches('lib/utils/helper.js', pattern)).toBe(true);
      expect(PathMatcher.matches('lib/models/user.ts', pattern)).toBe(false);
    });
  });

  describe('findMatches', () => {
    it('should return all matching patterns', () => {
      const patterns = ['lib/lock-manager.ts', 'lib/*.ts', 'lib/**/*.ts', 'src/**/*.ts'];

      const matches = PathMatcher.findMatches('lib/lock-manager.ts', patterns);
      expect(matches).toEqual(['lib/lock-manager.ts', 'lib/*.ts', 'lib/**/*.ts']);
    });

    it('should return empty array when no patterns match', () => {
      const patterns = ['src/**/*.ts', 'test/**/*.ts'];
      const matches = PathMatcher.findMatches('lib/lock-manager.ts', patterns);
      expect(matches).toEqual([]);
    });
  });

  describe('isGlob', () => {
    it('should detect glob patterns', () => {
      expect(PathMatcher.isGlob('lib/*.ts')).toBe(true);
      expect(PathMatcher.isGlob('lib/**/*.ts')).toBe(true);
      expect(PathMatcher.isGlob('lib/?.ts')).toBe(true);
      expect(PathMatcher.isGlob('lib/[abc].ts')).toBe(true);
      expect(PathMatcher.isGlob('lib/{a,b}.ts')).toBe(true);
    });

    it('should not detect non-glob patterns', () => {
      expect(PathMatcher.isGlob('lib/lock-manager.ts')).toBe(false);
      expect(PathMatcher.isGlob('lib/services/api.ts')).toBe(false);
    });
  });

  describe('getBaseDir', () => {
    it('should extract base directory from glob patterns', () => {
      expect(PathMatcher.getBaseDir('lib/**/*.ts')).toBe('lib');
      expect(PathMatcher.getBaseDir('lib/services/**/*.ts')).toBe('lib/services');
      expect(PathMatcher.getBaseDir('lib/*.ts')).toBe('lib');
      expect(PathMatcher.getBaseDir('**/*.ts')).toBe('');
    });

    it('should handle non-glob patterns', () => {
      expect(PathMatcher.getBaseDir('lib/lock-manager.ts')).toBe('lib');
      expect(PathMatcher.getBaseDir('lib/services/api.ts')).toBe('lib/services');
    });
  });

  describe('edge cases', () => {
    it('should handle empty paths', () => {
      expect(PathMatcher.matches('', '')).toBe(true);
      expect(PathMatcher.matches('lib/foo.ts', '')).toBe(false);
      expect(PathMatcher.matches('', '**')).toBe(true);
    });

    it('should handle special characters in paths', () => {
      expect(PathMatcher.matches('lib/foo-bar.ts', 'lib/*.ts')).toBe(true);
      expect(PathMatcher.matches('lib/foo_bar.ts', 'lib/*.ts')).toBe(true);
      expect(PathMatcher.matches('lib/foo.bar.ts', 'lib/*.ts')).toBe(true);
    });

    it('should not match across directory boundaries with *', () => {
      expect(PathMatcher.matches('lib/services/api.ts', 'lib/*.ts')).toBe(false);
      expect(PathMatcher.matches('lib/services/api.ts', 'lib/**/*.ts')).toBe(true);
    });
  });
});
