/**
 * Utility for matching file paths against glob patterns
 * Used for associating logs with components based on source paths
 */

export class PathMatcher {
  /**
   * Check if a file path matches a glob pattern
   *
   * Supports:
   * - Exact matches: "lib/lock-manager.ts"
   * - Wildcards: "lib/*.ts"
   * - Double wildcards: "lib/ ** /*.ts" (without spaces)
   * - Character sets: "lib/[abc].ts"
   *
   * @param path File path to test
   * @param pattern Glob pattern
   * @returns True if path matches pattern
   */
  public static matches(path: string, pattern: string): boolean {
    // Normalize paths (convert backslashes to forward slashes)
    path = path.replace(/\\/g, '/');
    pattern = pattern.replace(/\\/g, '/');

    // Exact match
    if (path === pattern) {
      return true;
    }

    // Convert glob pattern to regex
    const regex = this.globToRegex(pattern);
    return regex.test(path);
  }

  /**
   * Find all patterns that match a given path
   *
   * @param path File path to test
   * @param patterns Array of glob patterns
   * @returns Array of matching patterns
   */
  public static findMatches(path: string, patterns: string[]): string[] {
    return patterns.filter((pattern) => this.matches(path, pattern));
  }

  /**
   * Convert a glob pattern to a regular expression
   *
   * @param pattern Glob pattern
   * @returns Regular expression
   */
  private static globToRegex(pattern: string): RegExp {
    const regex = this.globToRegexString(pattern);
    // Match entire string
    return new RegExp('^' + regex + '$');
  }

  /**
   * Convert a glob pattern to a regex string (without anchors)
   * This allows for proper composition when handling alternatives
   */
  private static globToRegexString(pattern: string): string {
    let regex = '';
    let i = 0;

    while (i < pattern.length) {
      const char = pattern[i];

      switch (char) {
        case '*':
          // Check for **
          if (pattern[i + 1] === '*') {
            // ** matches any number of directories
            if (pattern[i + 2] === '/') {
              regex += '(?:.*/)?'; // Match zero or more path segments
              i += 3;
            } else {
              // ** at end of pattern
              regex += '.*';
              i += 2;
            }
          } else {
            // * matches anything except /
            regex += '[^/]*';
            i++;
          }
          break;

        case '?':
          // ? matches any single character except /
          regex += '[^/]';
          i++;
          break;

        case '[': {
          // [...] matches character set
          let j = i + 1;
          while (j < pattern.length && pattern[j] !== ']') {
            j++;
          }
          if (j < pattern.length) {
            const set = pattern.substring(i + 1, j);
            regex += '[' + set.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ']';
            i = j + 1;
          } else {
            regex += '\\[';
            i++;
          }
          break;
        }

        case '{': {
          // {a,b,c} matches alternatives
          let k = i + 1;
          let depth = 1;
          while (k < pattern.length && depth > 0) {
            if (pattern[k] === '{') depth++;
            if (pattern[k] === '}') depth--;
            k++;
          }
          if (depth === 0) {
            const alternatives = pattern.substring(i + 1, k - 1).split(',');
            regex += '(?:' + alternatives.map((alt) => this.globToRegexString(alt)).join('|') + ')';
            i = k;
          } else {
            regex += '\\{';
            i++;
          }
          break;
        }

        // Escape special regex characters
        case '.':
        case '+':
        case '^':
        case '$':
        case '(':
        case ')':
        case '|':
        case '\\':
          regex += '\\' + char;
          i++;
          break;

        default:
          regex += char;
          i++;
      }
    }

    return regex;
  }

  /**
   * Escape special regex characters in a string
   */
  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Check if a pattern might match multiple paths (contains wildcards)
   */
  public static isGlob(pattern: string): boolean {
    return /[*?[\]{]/.test(pattern);
  }

  /**
   * Get the base directory from a glob pattern (part before first wildcard)
   *
   * Example: "lib/services/\*\*\/\*.ts" becomes "lib/services"
   */
  public static getBaseDir(pattern: string): string {
    const firstWildcard = pattern.search(/[*?[\]{]/);
    if (firstWildcard === -1) {
      // No wildcards, return the directory part
      return pattern.substring(0, pattern.lastIndexOf('/'));
    }

    // Return part before first wildcard
    const beforeWildcard = pattern.substring(0, firstWildcard);
    const lastSlash = beforeWildcard.lastIndexOf('/');
    return lastSlash === -1 ? '' : beforeWildcard.substring(0, lastSlash);
  }
}
