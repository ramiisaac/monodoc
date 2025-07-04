import { loadAndMergeConfig } from '../../src/config';
import { logger, setLogLevel } from '../../src/utils/logger';
import { WatchMode } from '../../src/utils/WatchMode';
import { main } from '../../src/index';
import path from 'path';

/**
 * Development Workflow Examples
 * 
 * This file demonstrates various development workflows for using the JSDoc generator
 * during active development, including watch mode, incremental updates, and IDE integration.
 */

export class DevelopmentWorkflowExample {
  private baseDir: string;
  private configPath: string;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
    this.configPath = path.join(baseDir, 'jsdoc-config.yaml');
  }

  /**
   * Watch Mode Development Workflow
   * Monitors file changes and automatically regenerates documentation
   */
  async runWatchMode(): Promise<void> {
    try {
      logger.info('👀 Starting watch mode for development...');
      setLogLevel('info');

      const config = await loadAndMergeConfig(this.configPath);
      
      // Configure watch mode for development
      const watchConfig = {
        ...config,
        watchMode: {
          enabled: true,
          debounceMs: 1000, // Wait 1 second after last change
          includePatterns: ['src/**/*.ts', 'src/**/*.tsx'],
          ignorePatterns: ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**'],
        },
        // Optimize for development speed
        aiClientConfig: {
          ...config.aiClientConfig,
          maxConcurrentRequests: 2, // Lower concurrency for development
          requestDelayMs: 500,
        },
        performance: {
          ...config.performance,
          enableCaching: true, // Essential for fast rebuilds
          maxConcurrentFiles: 3,
        },
        outputConfig: {
          ...config.outputConfig,
          logLevel: 'info',
        },
      };

      const watchMode = new WatchMode(watchConfig, this.baseDir);
      
      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('🛑 Stopping watch mode...');
        await watchMode.stop();
        process.exit(0);
      });

      await watchMode.start();
      
    } catch (error) {
      logger.error('❌ Watch mode failed:', error);
      process.exit(1);
    }
  }

  /**
   * Incremental Development Workflow
   * Only processes files that have changed since last commit
   */
  async runIncrementalUpdate(): Promise<void> {
    try {
      logger.info('🔄 Running incremental documentation update...');
      
      // Get changed files from git
      const changedFiles = await this.getChangedFiles();
      
      if (changedFiles.length === 0) {
        logger.info('ℹ️ No changes detected since last commit');
        return;
      }

      logger.info(`📝 Processing ${changedFiles.length} changed files...`);
      
      await main({
        configPath: this.configPath,
        targetPaths: changedFiles,
        verbose: true,
        cacheClear: false, // Keep cache for faster processing
      });
      
      logger.info('✅ Incremental update completed');
      
    } catch (error) {
      logger.error('❌ Incremental update failed:', error);
      process.exit(1);
    }
  }

  /**
   * Interactive Development Workflow
   * Provides an interactive CLI for common development tasks
   */
  async runInteractiveMode(): Promise<void> {
    const inquirer = await import('inquirer');
    
    logger.info('🎛️ Interactive JSDoc Development Mode');
    
    while (true) {
      const { action } = await inquirer.default.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '📝 Generate docs for current directory', value: 'generate' },
            { name: '🔄 Incremental update (changed files only)', value: 'incremental' },
            { name: '👀 Start watch mode', value: 'watch' },
            { name: '🧹 Clear cache', value: 'clear-cache' },
            { name: '🎯 Quality check', value: 'quality' },
            { name: '⚙️ Validate configuration', value: 'validate' },
            { name: '🚪 Exit', value: 'exit' },
          ],
        },
      ]);

      try {
        switch (action) {
          case 'generate':
            await this.interactiveGenerate();
            break;
          case 'incremental':
            await this.runIncrementalUpdate();
            break;
          case 'watch':
            await this.runWatchMode();
            break;
          case 'clear-cache':
            await this.clearCache();
            break;
          case 'quality':
            await this.runQualityCheck();
            break;
          case 'validate':
            await this.validateConfiguration();
            break;
          case 'exit':
            logger.info('👋 Goodbye!');
            return;
        }
      } catch (error) {
        logger.error(`❌ Action failed: ${error}`);
        
        const { continue: shouldContinue } = await inquirer.default.prompt([
          {
            type: 'confirm',
            name: 'continue',
            message: 'Do you want to continue?',
            default: true,
          },
        ]);
        
        if (!shouldContinue) {
          return;
        }
      }
    }
  }

  /**
   * Interactive generation with options
   */
  private async interactiveGenerate(): Promise<void> {
    const inquirer = await import('inquirer');
    
    const options = await inquirer.default.prompt([
      {
        type: 'confirm',
        name: 'dryRun',
        message: 'Run in dry-run mode (preview changes)?',
        default: false,
      },
      {
        type: 'confirm',
        name: 'verbose',
        message: 'Enable verbose logging?',
        default: false,
      },
      {
        type: 'input',
        name: 'targetPaths',
        message: 'Specific paths to process (comma-separated, or press Enter for all):',
        filter: (input: string) => input ? input.split(',').map(p => p.trim()) : undefined,
      },
    ]);

    await main({
      configPath: this.configPath,
      dryRun: options.dryRun,
      verbose: options.verbose,
      targetPaths: options.targetPaths,
    });
  }

  /**
   * Clear cache with confirmation
   */
  private async clearCache(): Promise<void> {
    const inquirer = await import('inquirer');
    
    const { confirm } = await inquirer.default.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to clear the cache?',
        default: false,
      },
    ]);

    if (confirm) {
      await main({
        configPath: this.configPath,
        cacheClear: true,
        dryRun: true, // Just clear cache, don't generate
      });
      logger.info('🧹 Cache cleared successfully');
    }
  }

  /**
   * Run quality check
   */
  private async runQualityCheck(): Promise<void> {
    logger.info('🎯 Running documentation quality check...');
    
    await main({
      configPath: this.configPath,
      analyzeOnly: true, // Quality check mode
      verbose: true,
    });
  }

  /**
   * Validate configuration
   */
  private async validateConfiguration(): Promise<void> {
    try {
      logger.info('⚙️ Validating configuration...');
      
      const config = await loadAndMergeConfig(this.configPath);
      logger.info('✅ Configuration is valid');
      
      // Show basic config info
      logger.info(`📁 Workspace directories: ${config.workspaceDirs.join(', ')}`);
      logger.info(`🤖 AI models configured: ${config.aiModels.length}`);
      logger.info(`🔌 Plugins enabled: ${config.plugins?.filter(p => p.enabled).length || 0}`);
      
    } catch (error) {
      logger.error('❌ Configuration validation failed:', error);
      throw error;
    }
  }

  /**
   * Get changed files from git
   */
  private async getChangedFiles(): Promise<string[]> {
    const { execSync } = await import('child_process');
    
    try {
      // Get files changed since last commit
      const output = execSync('git diff --name-only HEAD~1 HEAD', {
        encoding: 'utf8',
        cwd: this.baseDir,
      });
      
      return output
        .split('\n')
        .filter(file => file.endsWith('.ts') || file.endsWith('.tsx'))
        .filter(Boolean)
        .map(file => path.resolve(this.baseDir, file));
        
    } catch (error) {
      // Fallback to staged files if no commits
      try {
        const stagedOutput = execSync('git diff --cached --name-only', {
          encoding: 'utf8',
          cwd: this.baseDir,
        });
        
        return stagedOutput
          .split('\n')
          .filter(file => file.endsWith('.ts') || file.endsWith('.tsx'))
          .filter(Boolean)
          .map(file => path.resolve(this.baseDir, file));
          
      } catch (stagedError) {
        logger.warn('Could not determine changed files, processing all files');
        return [];
      }
    }
  }
}

/**
 * IDE Integration Example
 */
export class IDEIntegrationExample {
  /**
   * VS Code Task Integration
   * Generates VS Code tasks.json configuration
   */
  async generateVSCodeTasks(): Promise<void> {
    const tasksConfig = {
      version: '2.0.0',
      tasks: [
        {
          label: 'JSDoc: Generate Documentation',
          type: 'shell',
          command: 'npx',
          args: ['monodoc', 'generate'],
          group: 'build',
          presentation: {
            echo: true,
            reveal: 'always',
            focus: false,
            panel: 'shared',
          },
          problemMatcher: [],
        },
        {
          label: 'JSDoc: Generate Documentation (Dry Run)',
          type: 'shell',
          command: 'npx',
          args: ['monodoc', 'generate', '--dry-run', '--verbose'],
          group: 'build',
          presentation: {
            echo: true,
            reveal: 'always',
            focus: false,
            panel: 'shared',
          },
          problemMatcher: [],
        },
        {
          label: 'JSDoc: Start Watch Mode',
          type: 'shell',
          command: 'npx',
          args: ['monodoc', 'watch'],
          group: 'build',
          presentation: {
            echo: true,
            reveal: 'always',
            focus: false,
            panel: 'shared',
          },
          isBackground: true,
          problemMatcher: [],
        },
        {
          label: 'JSDoc: Quality Check',
          type: 'shell',
          command: 'npx',
          args: ['monodoc', 'quality-check'],
          group: 'test',
          presentation: {
            echo: true,
            reveal: 'always',
            focus: false,
            panel: 'shared',
          },
          problemMatcher: [],
        },
      ],
    };

    const fs = await import('fs').then(m => m.promises);
    const vscodePath = path.join(process.cwd(), '.vscode');
    
    await fs.mkdir(vscodePath, { recursive: true });
    await fs.writeFile(
      path.join(vscodePath, 'tasks.json'),
      JSON.stringify(tasksConfig, null, 2)
    );
    
    logger.info('✅ VS Code tasks configuration generated at .vscode/tasks.json');
  }

  /**
   * Generate npm scripts for common workflows
   */
  async generateNpmScripts(): Promise<void> {
    const scripts = {
      'docs:generate': 'monodoc generate',
      'docs:preview': 'monodoc generate --dry-run --verbose',
      'docs:watch': 'monodoc watch',
      'docs:quality': 'monodoc quality-check',
      'docs:validate': 'monodoc validate-config',
      'docs:clean': 'monodoc generate --cache-clear --dry-run',
    };

    logger.info('📦 Recommended npm scripts for your package.json:');
    console.log(JSON.stringify({ scripts }, null, 2));
  }
}

// CLI interface for development workflows
async function main() {
  const workflow = process.argv[2];
  const example = new DevelopmentWorkflowExample();
  const ideExample = new IDEIntegrationExample();
  
  switch (workflow) {
    case 'watch':
      await example.runWatchMode();
      break;
    case 'incremental':
      await example.runIncrementalUpdate();
      break;
    case 'interactive':
      await example.runInteractiveMode();
      break;
    case 'vscode-tasks':
      await ideExample.generateVSCodeTasks();
      break;
    case 'npm-scripts':
      await ideExample.generateNpmScripts();
      break;
    default:
      console.log('Usage: node development-workflows.js <workflow>');
      console.log('');
      console.log('Available workflows:');
      console.log('  watch        - Start watch mode for automatic updates');
      console.log('  incremental  - Process only changed files');
      console.log('  interactive  - Interactive development mode');
      console.log('  vscode-tasks - Generate VS Code tasks configuration');
      console.log('  npm-scripts  - Show recommended npm scripts');
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}