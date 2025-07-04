import { ICommand, CommandContext } from '../types';
import { logger } from '../utils/logger';
import { ConfigValidator } from '../config/ConfigValidator';
import { HelpSystem } from '../cli/HelpSystem';
import { loadAndMergeConfig } from '../config';

/**
 * Implements the 'validate-config' command logic.
 * This command loads and validates the configuration file and reports any issues.
 */
export class ValidateConfigCommand implements ICommand {
  async execute(context: CommandContext): Promise<void> {
    const configPath = context.cliOptions.configPath;
    logger.info(`🔍 Validating configuration${configPath ? ` from ${configPath}` : ''}...`);

    try {
      // Load and merge configuration first
      const config = await loadAndMergeConfig(configPath);

      // Perform the detailed validation using ConfigValidator
      const validationResult = ConfigValidator.validate(
        config as unknown as Record<string, unknown>,
      );

      if (validationResult.error) {
        HelpSystem.showConfigValidation([validationResult.error], validationResult.warnings || []);
        logger.error('❌ Configuration validation failed.');
        throw new Error('Configuration validation failed.'); // Propagate error
      } else {
        HelpSystem.showConfigValidation([], validationResult.warnings || []);
        logger.success('✅ Configuration is valid!');
        logger.info('\n📋 Configuration summary:');
        logger.info(`  • AI Models Configured: ${config.aiModels.length}`);
        logger.info(
          `  • Default Generation Model: ${config.aiClientConfig.defaultGenerationModelId}`,
        );
        logger.info(`  • Workspace Dirs: ${config.workspaceDirs.join(', ')}`);
        logger.info(`  • Embeddings: ${config.embeddingConfig.enabled ? 'Enabled' : 'Disabled'}`);
      }
    } catch (error) {
      logger.error(
        `❌ Error loading or validating configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error; // Re-throw to be caught by CommandRunner's error handling
    }
  }
}
