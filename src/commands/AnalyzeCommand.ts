import { ICommand, CommandContext, ProcessingStats } from "../types";
import { logger } from "../utils/logger";
import { AnalyzeWorkspaceOperation } from "../operations/AnalyzeWorkspaceOperation"; // Corrected path

/**
 * Implements the 'analyze' command logic.
 * This command performs a detailed analysis of the monorepo's structure,
 * packages, files, and symbols without generating any documentation.
 * Useful for debugging and understanding the project's structure as seen by the tool.
 */
export class AnalyzeCommand implements ICommand {
  async execute(context: CommandContext): Promise<void> {
    logger.info("Starting workspace analysis (analyze-only mode)...");

    const operation = new AnalyzeWorkspaceOperation();
    let stats: ProcessingStats | void; // The operation might return stats or just log info
    try {
      stats = await operation.execute(context);
    } catch (error) {
      logger.error(
        `Workspace analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error; // Re-throw to be caught by CommandRunner's error handling
    }

    if (stats) {
      logger.info("\n📊 Analysis Summary:");
      logger.info(`  • Packages Discovered: ${stats.totalPackages}`);
      logger.info(`  • Total Files Scanned: ${stats.totalFiles}`);
      logger.info(
        `  • JSDocable Nodes Identified: ${stats.totalNodesConsidered}`,
      );
      logger.info(
        `  • Analysis Duration: ${stats.durationSeconds?.toFixed(2) || "N/A"} seconds`,
      );
      if (stats.errors.length > 0) {
        logger.warn(`  • Errors During Analysis: ${stats.errors.length}`);
        stats.errors.slice(0, 5).forEach((err) => {
          logger.warn(`    - ${err.file}: ${err.error}`);
        });
        if (stats.errors.length > 5) {
          logger.warn(
            `    ...and ${stats.errors.length - 5} more errors. Check detailed logs.`,
          );
        }
      }
    }
    logger.info("Workspace analysis completed.");
  }
}
