import { ICommand, CommandContext } from "../types";
import { WatchMode } from "../utils/WatchMode";
import { logger } from "../utils/logger";
import { GenerateDocumentationOperation } from "../operations/GenerateDocumentationOperation";
import { loadAndMergeConfig } from "../config";

/**
 * Implements the 'watch' command logic.
 * This command sets up a file watcher to automatically regenerate JSDoc on file changes.
 */
export class WatchCommand implements ICommand {
  async execute(context: CommandContext): Promise<void> {
    logger.info("👀 Starting watch mode...");

    const watchMode = new WatchMode(
      context.config,
      context.baseDir,
      async (filePaths: string[]) => {
        logger.info(
          `📝 Detected changes in ${filePaths.length} file(s). Regenerating...`,
        );

        // Create a fresh config for each run, and apply CLI overrides specific to the watch mode.
        // This ensures that any config changes in memory from previous runs don't persist
        // unexpectedly across watch cycles, and allows for clean state.
        const currentConfig = await loadAndMergeConfig(
          context.cliOptions.configPath,
        );
        // Apply CLI overrides again, as if the command was just run (e.g., --no-embed, --dry-run)
        const runConfig = {
          ...currentConfig,
          targetPaths: filePaths, // Set specific files to process for this cycle
          watchMode: { ...currentConfig.watchMode, enabled: true }, // Ensure watchMode is conceptually enabled in config for telemetry etc.
        };

        const operation = new GenerateDocumentationOperation();
        try {
          // Pass the modified config for this specific run
          await operation.execute({ ...context, config: runConfig });
          logger.success("✅ Documentation updated successfully.");
        } catch (error) {
          logger.error(
            `❌ Failed to update documentation during watch: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        logger.info("👀 Waiting for more file changes...");
      },
    );

    // Start the watcher
    watchMode.start();

    // Keep the process alive indefinitely for watch mode
    await new Promise<void>((resolve) => {
      process.on("SIGINT", () => {
        logger.info("\n⏹️  Stopping watch mode...");
        watchMode.stop();
        resolve(); // Resolve the promise to allow the process to exit cleanly
      });
      process.on("SIGTERM", () => {
        logger.info("\n⏹️  Stopping watch mode...");
        watchMode.stop();
        resolve();
      });
    });
  }
}
