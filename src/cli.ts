#!/usr/bin/env node
import { program } from 'commander';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
import { CliOptions, ICommand } from './types';
import { logger } from './utils/logger';
import { HelpSystem } from './cli/HelpSystem';
import { CommandRunner } from './cli/CommandRunner';
import { GenerateCommand } from './commands/GenerateCommand';
import { SetupCommand } from './commands/SetupCommand';
import { ValidateConfigCommand } from './commands/ValidateConfigCommand';
import { InfoCommand } from './commands/InfoCommand';
import { WatchCommand } from './commands/WatchCommand';
import { IncrementalCommand } from './commands/IncrementalCommand';
import { QualityCheckCommand } from './commands/QualityCheckCommand';
import { BenchmarkCommand } from './commands/BenchmarkCommand';
import { handleCriticalError } from './utils/errorHandling';
import { AuthManager } from './config/AuthManager'; // For direct API key saving/listing

dotenv.config(); // Load environment variables from .env file

const appVersion = '2.0.1'; // Ensure this matches your package.json version

function showBanner(): void {
  const banner = `
${chalk.bold.blue('╔══════════════════════════════════════════════════════════════╗')}
${chalk.bold.blue('║')}          ${chalk.bold.white('🤖 AI-Powered JSDoc Generator')}              ${chalk.bold.blue('║')}
${chalk.bold.blue('║')}            ${chalk.gray('Enterprise TypeScript Documentation')}           ${chalk.bold.blue('║')}
${chalk.bold.blue('║')}                     ${chalk.cyan(`v${appVersion}`)}                        ${chalk.bold.blue('║')}
${chalk.bold.blue('╚══════════════════════════════════════════════════════════════╝')}
`;
  console.log(banner);
}

/**
 * Maps model keywords to their likely provider for API key handling.
 * This is a heuristic and might need to be more robust.
 */
function detectProviderTypeFromModel(model: string): 'openai' | 'google' | 'anthropic' | 'ollama' | null {
  const modelMap: Record<string, 'openai' | 'google' | 'anthropic' | 'ollama'> = {
    gpt: 'openai',
    'text-embedding': 'openai', // OpenAI embedding models
    gemini: 'google',
    claude: 'anthropic',
    llama: 'ollama',
    mistral: 'ollama',
    codellama: 'ollama',
    phi: 'ollama',
    qwen: 'ollama',
    gemma: 'ollama',
    nomic: 'ollama', // For Ollama's nomic-embed-text
  };

  for (const [key, provider] of Object.entries(modelMap)) {
    if (model.toLowerCase().includes(key)) {
      return provider;
    }
  }
  return null;
}

/**
 * Gets the default environment variable name for an API key based on provider type.
 */
function getDefaultApiKeyEnvVar(provider: string): string {
  const envVarMap: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    ollama: 'OLLAMA_HOST', // Ollama typically uses OLLAMA_HOST for base URL
  };
  return envVarMap[provider] || `${provider.toUpperCase()}_API_KEY`;
}

/**
 * Configures the Commander.js CLI application with commands and options.
 */
function configureCLI(): void {
  program
    .name('monodoc')
    .description(chalk.bold.blue('🤖 AI-powered JSDoc generation for TypeScript monorepos'))
    .version(appVersion, '-v, --version', 'Display version number')
    .helpOption('-h, --help', 'Display help for command')
    .configureOutput({
      writeOut: (str) => process.stdout.write(str), // No chalk here, handle in logger
      writeErr: (str) => process.stderr.write(chalk.red(str)),
    });

  // Global options (apply to main command or can be inherited by subcommands)
  program
    .option('-c, --config <path>', 'Configuration file path')
    .option('--verbose', 'Enable verbose logging output (sets log level to debug)')
    .option('-k, --api-key <key>', 'API key for the AI provider (for direct use or saving)')
    .option('--save-api-key <location>', 'Save API key (global|local)', /^(global|local)$/i);

  // --- COMMANDS ---

  // Default 'generate' command
  program
    .command('generate [files...]')
    .description('Generate or update JSDoc for the monorepo (default command)')
    .alias('g')
    .option('-d, --dry-run', 'Preview changes without modifying files')
    .option('--no-write', 'Alias for --dry-run')
    .option('-t, --target-paths <patterns...>', 'Specific file patterns to target within workspaceDirs')
    .option('-f, --force-overwrite', 'Force overwrite existing JSDoc comments')
    .option('--no-merge-existing', 'Disable merging with existing JSDoc')
    .option('--no-embed', 'Disable embedding-based relationship analysis for this run')
    .option('-m, --model <name>', 'Override the default generation AI model for this run')
    .option('--template <name>', 'Specify a JSDoc template (e.g., react-component, api-route)')
    .option('--cache-clear', 'Clear the generation cache before processing')
    .option('--analyze-only', 'Analyze code structure without generating docs (useful for debugging)')
    .action(async (files: string[], options) => {
      // Merge file arguments into targetPaths
      if (files.length > 0) {
        options.targetPaths = [...(options.targetPaths || []), ...files];
      }
      await executeCommand(GenerateCommand, options);
    });

  // Setup command
  program
    .command('setup')
    .description('Run interactive setup wizard to generate a config file')
    .action(async (options) => {
      await executeCommand(SetupCommand, options);
    });

  // Validate-config command
  program
    .command('validate-config [configPath]')
    .description('Validate configuration file and exit')
    .action(async (configPath: string | undefined, options) => {
      // Pass the configPath argument to the command handler via options
      options.configPath = configPath || options.configPath;
      await executeCommand(ValidateConfigCommand, options);
    });

  // Watch command
  program
    .command('watch')
    .description('Watch for file changes and update documentation continuously')
    .action(async (options) => {
      await executeCommand(WatchCommand, options);
    });

  // Incremental command
  program
    .command('incremental')
    .description('Process only files changed since the last Git commit')
    .action(async (options) => {
      await executeCommand(IncrementalCommand, options);
    });

  // Quality-check command
  program
    .command('quality-check')
    .description('Analyze documentation quality without generating or modifying files')
    .alias('quality')
    .action(async (options) => {
      await executeCommand(QualityCheckCommand, options);
    });

  // Benchmark command
  program
    .command('benchmark')
    .description('Run performance benchmarks for JSDoc generation')
    .action(async (options) => {
      await executeCommand(BenchmarkCommand, options);
    });

  // Info command (grouping various informational options)
  program
    .command('info')
    .description('Display various information and help guides')
    .option('--list-models', 'List all available AI models by provider')
    .option('--list-credentials', 'Show saved API credentials')
    .option('--remove-credentials <provider>', 'Remove saved credentials for a specific provider')
    .option('--quick-start', 'Show quick start guide')
    .option('--troubleshoot', 'Show troubleshooting guide')
    .option('--examples', 'Show usage examples')
    .action(async (options) => {
      await executeCommand(InfoCommand, options);
    });

  // Add a listener for the 'command:*' event to catch unknown commands
  program.on('command:*', function () {
    console.error(chalk.red(`\n❌ Unknown command: ${program.args.join(' ')}\n`));
    program.help({ error: true }); // Show help and exit with error
  });

  // If no command is specified, default to 'generate' command logic
  // This must be placed after all other command definitions
  if (process.argv.slice(2).length === 0) {
    // No arguments, so effectively 'monodoc' was called without subcommand
    // Set a default action for the root program
    program.action(async (options) => {
      await executeCommand(GenerateCommand, options);
    });
  } else if (!process.argv.slice(2).some(arg => program.commands.some(cmd => cmd.name() === arg || cmd.aliases().includes(arg)))) {
    // If there are arguments, but none of them match a command name/alias, assume they are options for the default 'generate' command
    // This allows `monodoc --dry-run` instead of `monodoc generate --dry-run`
    program.action(async (options) => {
      await executeCommand(GenerateCommand, options);
    });
  }
}

/**
 * Parses global CLI options and dispatches to the correct command handler.
 * This function acts as a central execution point for all CLI commands.
 */
async function runCli(): Promise<void> {
  configureCLI();

  // Parse arguments and get the raw options object.
  // Note: commander automatically handles `process.argv`
  program.parseAsync(process.argv).catch(err => {
    // commander itself might throw, catch it here.
    handleCriticalError(err, 'CLI parsing');
  });

  // Intercept the `api-key` and `save-api-key` global options.
  // This needs to happen early, even before config loading, as it's a direct action.
  const globalOptions = program.opts();
  if (globalOptions.apiKey && globalOptions.saveApiKey) {
    const provider = detectProviderTypeFromModel(globalOptions.model || 'openai'); // Try to guess provider from model, default to openai
    if (provider) {
      await AuthManager.saveApiKey(
        provider,
        globalOptions.apiKey as string,
        globalOptions.saveApiKey as 'global' | 'local',
        globalOptions.model as string,
      );
      logger.success(`${chalk.green('✅')} API key saved ${globalOptions.saveApiKey === 'global' ? 'globally' : 'locally'}`);
      process.exit(0); // Exit after saving API key
    } else {
      logger.warn('⚠️ Could not detect provider from model. Please specify a valid model with --model, or set API key directly via environment variable.');
      process.exit(1);
    }
  } else if (globalOptions.apiKey || globalOptions.saveApiKey) {
    // If only one of --api-key or --save-api-key is provided, prompt for both
    logger.error('❌ Both --api-key and --save-api-key are required to save an API key.');
    program.help({ error: true });
  }

  // Commander handles routing to the action callbacks defined for each command.
  // The `executeCommand` function then takes over for `CommandRunner` logic.
}

/**
 * Executes a specific ICommand implementation using the CommandRunner.
 * @param CommandClass The constructor for the ICommand to run.
 * @param options The parsed options for the command.
 */
async function executeCommand(CommandClass: new (...args: any[]) => ICommand, options: any): Promise<void> {
  // Common CLI options are extracted here and passed to CommandRunner
  const cliOptions: CliOptions = {
    configPath: options.config || program.opts().config, // Get global config path
    verbose: options.verbose || program.opts().verbose, // Get global verbose flag
    dryRun: options.dryRun,
    noWrite: options.noWrite,
    targetPaths: options.targetPaths,
    forceOverwrite: options.forceOverwrite,
    noMergeExisting: options.noMergeExisting,
    noEmbed: options.noEmbed,
    model: options.model,
    template: options.template,
    cacheClear: options.cacheClear,
    analyzeOnly: options.analyzeOnly,
    // For info command:
    listModels: options.listModels,
    listCredentials: options.listCredentials,
    removeCredentials: options.removeCredentials,
    quickStart: options.quickStart,
    troubleshoot: options.troubleshoot,
    examples: options.examples,
    // For validate-config:
    validateConfig: true, // Mark this explicitly if validate-config command is run
  };

  if (!cliOptions.verbose) {
    showBanner(); // Only show banner if not in verbose mode (logger handles debug/info)
  }

  const command = new CommandClass();
  const commandRunner = new CommandRunner(process.cwd(), cliOptions);

  try {
    await commandRunner.run(command);
    process.exit(0); // Exit successfully after command completes
  } catch (error) {
    handleCriticalError(error, `Command: ${CommandClass.name}`);
  }
}

// Ensure runCli is called when the script is executed
if (require.main === module) {
  runCli();
}

