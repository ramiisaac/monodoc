import { ICommand, CommandContext } from '../types';
import { HelpSystem } from '../cli/HelpSystem';
import { AuthManager } from '../config/AuthManager';
import { logger } from '../utils/logger';
import { DEFAULT_CONFIG } from '../config'; // To access default AI models
import chalk from 'chalk';

/**
 * Implements the 'info' command logic.
 * This command provides various informational outputs like available models, saved credentials, help guides, etc.
 */
export class InfoCommand implements ICommand {
  async execute(context: CommandContext): Promise<void> {
    const cliOptions = context.cliOptions;

    if (cliOptions.listModels) {
      this.showAvailableModels();
      return;
    }

    if (cliOptions.listCredentials) {
      await this.showSavedCredentials();
      return;
    }

    if (cliOptions.removeCredentials) {
      await this.handleRemoveCredentials(cliOptions.removeCredentials as string);
      return;
    }

    if (cliOptions.quickStart) {
      HelpSystem.showQuickStart();
      return;
    }

    if (cliOptions.troubleshoot) {
      HelpSystem.showTroubleshooting();
      return;
    }

    if (cliOptions.examples) {
      this.showExamples();
      return;
    }

    // If no specific info option is provided, show general info/help
    HelpSystem.showQuickStart(); // Default info
  }

  /**
   * Displays all AI models configured in the DEFAULT_CONFIG.
   */
  private showAvailableModels(): void {
    logger.log(chalk.bold.blue('\n🤖 Available AI Models\n'));

    const modelsByProvider: { [provider: string]: { generation: string[]; embedding: string[] } } =
      {};

    DEFAULT_CONFIG.aiModels.forEach((model) => {
      if (!modelsByProvider[model.provider]) {
        modelsByProvider[model.provider] = { generation: [], embedding: [] };
      }
      if (model.type === 'generation') {
        modelsByProvider[model.provider].generation.push(model.model);
      } else if (model.type === 'embedding') {
        modelsByProvider[model.provider].embedding.push(model.model);
      }
    });

    for (const [provider, modelTypes] of Object.entries(modelsByProvider)) {
      logger.log(chalk.bold.yellow(`${provider.toUpperCase()}:`));
      if (modelTypes.generation.length > 0) {
        logger.log(chalk.cyan('  Text Generation:'));
        modelTypes.generation.forEach((model) => {
          logger.log(`    ${chalk.green('•')} ${model}`);
        });
      }
      if (modelTypes.embedding.length > 0) {
        logger.log(chalk.cyan('  Embeddings:'));
        modelTypes.embedding.forEach((model) => {
          logger.log(`    ${chalk.green('•')} ${model}`);
        });
      }
      logger.log();
    }
    logger.log(chalk.gray('Use --model <name> to specify a model for generation.\n'));
  }

  /**
   * Displays a list of saved API credentials.
   */
  private async showSavedCredentials(): Promise<void> {
    logger.log(chalk.bold.blue('\n🔑 Saved API Credentials\n'));
    try {
      const credentials = await AuthManager.listCredentials();
      if (credentials.length === 0) {
        logger.log(chalk.yellow('No saved credentials found.'));
        logger.log(
          chalk.gray(
            'Use `monodoc --api-key <key> --save-api-key global|local` to save credentials.\n',
          ),
        );
        return;
      }

      logger.log(
        chalk.bold('Provider'.padEnd(20)) +
          chalk.bold('Location'.padEnd(12)) +
          chalk.bold('Last Used'),
      );
      logger.log('─'.repeat(50));
      for (const cred of credentials) {
        const provider = cred.provider.padEnd(20);
        const location = cred.location.padEnd(12);
        const lastUsed = cred.lastUsed ? new Date(cred.lastUsed).toLocaleDateString() : 'N/A';
        logger.log(`${chalk.cyan(provider)}${chalk.green(location)}${chalk.gray(lastUsed)}`);
      }
      logger.log();
    } catch (error) {
      logger.error(
        `Failed to load credentials: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Handles the removal of saved API credentials.
   * @param provider The provider for which to remove credentials.
   */
  private async handleRemoveCredentials(provider: string): Promise<void> {
    try {
      await AuthManager.removeCredentials(provider, 'both');
      logger.success(`${chalk.green('✅')} Removed credentials for ${provider}`);
    } catch (error) {
      logger.error(
        `Failed to remove credentials: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Displays usage examples for the CLI.
   */
  private showExamples(): void {
    logger.log(chalk.bold.blue('\n📚 Usage Examples\n'));
    const examples = [
      {
        title: 'Quick Start',
        command: 'monodoc setup',
        description: 'Interactive setup wizard to configure your project',
      },
      {
        title: 'Preview Changes',
        command: 'monodoc generate --dry-run --verbose',
        description: 'See what would be generated without modifying files',
      },
      {
        title: 'Use Specific Model',
        command: 'monodoc generate --model gpt-4o --api-key sk-... --save-api-key local',
        description: 'Use GPT-4o model and save API key locally',
      },
      {
        title: 'Watch Mode',
        command: 'monodoc watch',
        description: 'Continuously monitor and update documentation',
      },
      {
        title: 'Quality Analysis',
        command: 'monodoc quality-check --performance',
        description: 'Analyze documentation quality with performance metrics',
      },
      {
        title: 'Target Specific Files',
        command: 'monodoc generate "src/components/**/*.tsx" --template react-component',
        description: 'Generate docs for React components only',
      },
      {
        title: 'Production Deploy',
        command: 'monodoc generate --config production.yaml --no-embed --force-overwrite',
        description: 'Production deployment with optimized settings',
      },
      {
        title: 'Validate Configuration',
        command: 'monodoc validate-config examples/configurations/basic.yaml',
        description: 'Validate a specific configuration file',
      },
    ];

    examples.forEach((example) => {
      logger.log(chalk.bold.yellow(`${example.title}:`));
      logger.log(`  ${chalk.cyan(example.command)}`);
      logger.log(`  ${chalk.gray(example.description)}\n`);
    });
  }
}
