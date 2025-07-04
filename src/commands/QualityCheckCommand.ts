import { ICommand, CommandContext, ProcessingStats } from '../types';
import { logger } from '../utils/logger';
import { PerformQualityCheckOperation } from '../operations/PerformQualityCheckOperation';
import { HelpSystem } from '../cli/HelpSystem'; // For performance metrics display
import { TelemetryCollector } from '../analytics/TelemetryCollector'; // For performance metrics display

/**
 * Implements the 'quality-check' command logic.
 * This command analyzes the documentation quality of the codebase without generating or modifying files.
 */
export class QualityCheckCommand implements ICommand {
  async execute(context: CommandContext): Promise<void> {
    logger.info('🔍 Running documentation quality analysis...');

    const operation = new PerformQualityCheckOperation();
    let stats: ProcessingStats | void;
    try {
      stats = await operation.execute(context);
    } catch (error) {
      logger.error(
        `Quality check operation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    if (stats && context.cliOptions.performance) {
      // Display performance metrics if requested
      const telemetryData = await context.telemetry.collectTelemetry(stats); // Collect telemetry for stats
      HelpSystem.showPerformanceMetrics({
        totalFiles: stats.totalFiles,
        processedFiles: stats.processedFiles,
        generationTime: stats.durationSeconds!, // This is total analysis time now
        apiCalls: telemetryData.performance.apiCalls, // Should be 0 for pure quality check
        cacheHits: telemetryData.performance.cacheHitRate * telemetryData.performance.apiCalls,
      });
    }

    logger.info('Documentation quality analysis completed.');
  }
}
