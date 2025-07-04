import { ICommand, CommandContext, ProcessingStats } from '../types';
import { GenerateDocumentationOperation } from '../operations/GenerateDocumentationOperation';
import { logger } from '../utils/logger';
import { HelpSystem } from '../cli/HelpSystem';

/**
 * Implements the 'generate' command logic.
 * This command is responsible for initiating the JSDoc generation process.
 */
export class GenerateCommand implements ICommand {
  async execute(context: CommandContext): Promise<void> {
    logger.info('Starting JSDoc generation process...');

    const operation = new GenerateDocumentationOperation();
    let stats: ProcessingStats | void;
    try {
      stats = await operation.execute(context);
    } catch (error) {
      logger.error(
        `Generation operation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error; // Re-throw to be caught by CommandRunner's error handling
    }

    if (stats) {
      HelpSystem.showCompletion({
        filesProcessed: stats.processedFiles,
        documentsGenerated: stats.successfulJsdocs,
        timeElapsed: stats.durationSeconds!,
      });

      if (context.cliOptions.verbose || context.cliOptions.performance) {
        // Collect telemetry for detailed performance metrics display
        const telemetryData = await context.telemetry.collectTelemetry(stats);
        HelpSystem.showPerformanceMetrics({
          totalFiles: stats.totalFiles,
          processedFiles: stats.processedFiles,
          generationTime: stats.durationSeconds!,
          apiCalls: telemetryData.performance.apiCalls, // Use actual API calls from telemetry
          cacheHits: telemetryData.performance.cacheHitRate * telemetryData.performance.apiCalls, // Estimate cache hits from rate
        });
      }
    }
    logger.info('JSDoc generation process completed.');
  }
}
