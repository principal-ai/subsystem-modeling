/**
 * Hooks command - Manage husky pre-commit hooks for Principal View
 *
 * This command installs/removes pre-commit hooks into a target project
 * that will run `npx @principal-ai/principal-studio-cli doctor` and `npx @principal-ai/principal-studio-cli validate` before each commit.
 */

import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import chalk from 'chalk';
import { execSync } from 'node:child_process';

const HUSKY_DIR = '.husky';
const PRE_COMMIT_HOOK = 'pre-commit';
const VV_HOOK_MARKER = '# Principal View checks';

/**
 * Get the Principal View pre-commit hook content
 */
function getVVHookContent(): string {
  return `${VV_HOOK_MARKER}
echo "Running Principal View doctor check..."
npx @principal-ai/principal-studio-cli@latest doctor --errors-only || {
  echo "❌ Principal View doctor check failed (errors found)"
  echo "   Run 'npx @principal-ai/principal-studio-cli doctor' to see details"
  exit 1
}

echo "Running Principal View canvas validation..."
npx @principal-ai/principal-studio-cli@latest validate --quiet 2>/dev/null || {
  if [ $? -ne 0 ]; then
    echo "❌ Canvas validation failed"
    echo "   Run 'npx @principal-ai/principal-studio-cli validate' to see details"
    exit 1
  fi
}
`;
}

/**
 * Find the repository root by looking for .git directory
 */
function findRepoRoot(startPath: string): string {
  let current = resolve(startPath);
  const root = resolve('/');

  while (current !== root) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }
    current = resolve(current, '..');
  }

  throw new Error('Not a git repository (or any parent up to mount point)');
}

/**
 * Check if husky is installed
 */
function isHuskyInstalled(repoPath: string): boolean {
  const huskyPath = join(repoPath, HUSKY_DIR);
  return existsSync(huskyPath);
}

/**
 * Initialize husky if not already installed
 */
function initializeHusky(repoPath: string): void {
  if (!isHuskyInstalled(repoPath)) {
    console.log('📦 Installing husky...');
    try {
      // Check if package.json exists
      const packageJsonPath = join(repoPath, 'package.json');
      if (!existsSync(packageJsonPath)) {
        throw new Error('No package.json found. Please run npm init first.');
      }

      // Install husky
      execSync('npm install --save-dev husky', {
        cwd: repoPath,
        stdio: 'inherit',
      });

      // Initialize husky
      execSync('npx husky init', {
        cwd: repoPath,
        stdio: 'inherit',
      });

      // Remove the default placeholder if it exists
      const hookPath = join(repoPath, HUSKY_DIR, PRE_COMMIT_HOOK);
      if (existsSync(hookPath)) {
        const content = readFileSync(hookPath, 'utf8').trim();
        if (content === 'npm test') {
          // Remove the placeholder file - we'll create our own when --add is used
          unlinkSync(hookPath);
          console.log('ℹ️  Removed default husky placeholder hook');
        }
      }

      console.log('✅ Husky installed and initialized');
    } catch (error) {
      throw new Error(
        `Failed to initialize husky: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Check if pre-commit hook has PV validation
 */
function hasVVHook(repoPath: string): boolean {
  const hookPath = join(repoPath, HUSKY_DIR, PRE_COMMIT_HOOK);
  if (!existsSync(hookPath)) {
    return false;
  }

  const content = readFileSync(hookPath, 'utf8');
  return content.includes(VV_HOOK_MARKER);
}

/**
 * Add PV validation to pre-commit hook
 */
function addVVHook(repoPath: string): void {
  const hookPath = join(repoPath, HUSKY_DIR, PRE_COMMIT_HOOK);
  const vvContent = getVVHookContent();

  if (existsSync(hookPath)) {
    // Append to existing hook
    const existingContent = readFileSync(hookPath, 'utf8');

    // Check if already has PV hook
    if (existingContent.includes(VV_HOOK_MARKER)) {
      return;
    }

    // Remove default husky placeholder if it's the only content
    const trimmedContent = existingContent.trim();
    if (trimmedContent === 'npm test') {
      // Replace the placeholder entirely
      writeFileSync(hookPath, vvContent, 'utf8');
      console.log('ℹ️  Replaced default husky placeholder with Principal View checks');
    } else {
      // Add PV hook at the end
      const updatedContent = existingContent.trimEnd() + '\n\n' + vvContent;
      writeFileSync(hookPath, updatedContent, 'utf8');
    }
  } else {
    // Create new hook file
    writeFileSync(hookPath, vvContent, 'utf8');
    // Make it executable
    chmodSync(hookPath, 0o755);
  }
}

/**
 * Remove PV validation from pre-commit hook
 */
function removeVVHook(repoPath: string): void {
  const hookPath = join(repoPath, HUSKY_DIR, PRE_COMMIT_HOOK);

  if (!existsSync(hookPath)) {
    return;
  }

  const content = readFileSync(hookPath, 'utf8');

  if (!content.includes(VV_HOOK_MARKER)) {
    return;
  }

  // Split content by lines and find the PV section
  const lines = content.split('\n');
  const startIndex = lines.findIndex((line) => line.includes(VV_HOOK_MARKER));

  if (startIndex === -1) {
    return;
  }

  // Find the end of the PV section
  let endIndex = lines.length - 1;
  let inVVBlock = true;
  let i = startIndex + 1;

  while (i < lines.length && inVVBlock) {
    const line = lines[i];

    // Check if this line is part of the PV block
    if (
      line &&
      (line.includes('@principal-ai/principal-studio-cli ') ||
        line.includes('Principal View') ||
        line.includes('echo "Running Visual') ||
        (line.includes('exit 1') && i > startIndex && i < startIndex + 15) ||
        (line === '}' && i > startIndex && i < startIndex + 15) ||
        (line.trim() === '' && i === startIndex + 1))
    ) {
      endIndex = i;
      i++;
    } else if (line && line.trim() === '' && i < startIndex + 15) {
      // Empty line might be part of our block
      endIndex = i;
      i++;
    } else {
      // We've reached content that's not part of our block
      inVVBlock = false;
    }
  }

  // Remove the section (inclusive)
  lines.splice(startIndex, endIndex - startIndex + 1);

  // Clean up extra blank lines
  let result = lines.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  if (result) {
    writeFileSync(hookPath, result + '\n', 'utf8');
  } else {
    // If hook is now empty, remove it
    unlinkSync(hookPath);
  }
}

export function createHooksCommand(): Command {
  const command = new Command('hooks');

  command
    .description('Manage husky pre-commit hooks for Principal View')
    .option('-p, --path <path>', 'Repository path (defaults to current directory)')
    .option('--add', 'Add Principal View checks to pre-commit hook')
    .option('--remove', 'Remove Principal View checks from pre-commit hook')
    .option('--check', 'Check if Principal View checks exist in pre-commit hook')
    .option('--init', 'Initialize husky if not already installed')
    .action((options) => {
      try {
        const repoPath = findRepoRoot(options.path || process.cwd());

        // Check if it's a git repository
        if (!existsSync(join(repoPath, '.git'))) {
          console.error(chalk.red('❌ Not a git repository'));
          process.exit(1);
        }

        // Handle init option
        if (options.init) {
          initializeHusky(repoPath);
          return;
        }

        // Check if husky is installed
        if (!isHuskyInstalled(repoPath)) {
          if (options.check) {
            console.log(chalk.red('❌ Husky is not installed'));
            console.log('   Run "npx @principal-ai/principal-studio-cli hooks --init" to install husky');
            process.exit(1);
          } else if (options.add) {
            console.log(chalk.red('❌ Husky is not installed'));
            console.log('   Run "npx @principal-ai/principal-studio-cli hooks --init" first to install husky');
            process.exit(1);
          } else if (options.remove) {
            console.log('ℹ️  Husky is not installed');
            return;
          } else {
            console.log(chalk.red('❌ Husky is not installed in this repository'));
            console.log('\nTo install husky and set up Principal View hooks:');
            console.log('  npx @principal-ai/principal-studio-cli hooks --init --add');
            process.exit(1);
          }
        }

        const hasHook = hasVVHook(repoPath);

        if (options.check) {
          if (hasHook) {
            console.log(chalk.green('✅ Principal View checks found in pre-commit hook'));
          } else {
            console.log(chalk.red('❌ No Principal View checks in pre-commit hook'));
            process.exit(1);
          }
        } else if (options.add) {
          if (hasHook) {
            console.log('ℹ️  Principal View checks already exist in pre-commit hook');
          } else {
            addVVHook(repoPath);
            console.log(chalk.green('✅ Added Principal View checks to pre-commit hook'));
            console.log('\nPre-commit hook will now:');
            console.log('  • Run npx @principal-ai/principal-studio-cli doctor to check for stale configurations');
            console.log('  • Validate all .canvas files');
          }
        } else if (options.remove) {
          if (!hasHook) {
            console.log('ℹ️  No Principal View checks found in pre-commit hook');
          } else {
            removeVVHook(repoPath);
            console.log(chalk.green('✅ Removed Principal View checks from pre-commit hook'));
          }
        } else {
          // Default action: show status
          console.log(chalk.bold('\nPrincipal View Hooks Status\n'));
          console.log(`Repository: ${repoPath}`);
          console.log(`Husky: ${chalk.green('installed')}`);
          console.log(
            `PV Hooks: ${hasHook ? chalk.green('configured') : chalk.yellow('not configured')}`
          );

          if (hasHook) {
            console.log('\nUse --remove to remove or --check to verify');
          } else {
            console.log('\nUse --add to add or --check to verify');
          }
        }
      } catch (error) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return command;
}
