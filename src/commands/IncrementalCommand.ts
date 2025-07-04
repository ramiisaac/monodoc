import { ICommand, CommandContext } from "../types";
import { GitAnalyzer } from "../analyzer/GitAnalyzer";
import { logger } from "../utils/logger";
import { GenerateDocumentationOperation } from "../operations/GenerateDocumentationOperation";
import { loadAndMergeConfig } from "../config";

/**
 * Implements the 'incremental' command logic.
 * This command processes only files that have changed since the last Git commit.
 */
export class IncrementalCommand implements ICommand {
  async execute(context: CommandContext): Promise<void> {
    logger.info("🔄 Running in incremental mode...");
    const gitAnalyzer = new GitAnalyzer(context.baseDir);

    const isGitRepo = await gitAnalyzer.isGitRepository();
    if (!isGitRepo) {
      logger.error(
        "❌ Not a Git repository. Incremental mode requires a Git repository.",
      );
      throw new Error("Not a Git repository");
    }

    const changedFiles = await gitAnalyzer.getChangedFiles();

    if (changedFiles.length === 0) {
      logger.info(
        "✅ No changes detected since last commit - nothing to process.",
      );
      return;
    }

    // Filter for added or modified TypeScript/JavaScript files
    const filesToProcess = changedFiles
      .filter(
        (change) =>
          ["A", "M"].includes(change.status) &&
          (change.path.endsWith(".ts") ||
            change.path.endsWith(".tsx") ||
            change.path.endsWith(".js") ||
            change.path.endsWith(".jsx")),
      )
      .map((change) => change.path);

    if (filesToProcess.length === 0) {
      logger.info(
        "✅ No relevant TypeScript/JavaScript changes detected - nothing to process.",
      );
      return;
    }

    logger.info(`📝 Processing ${filesToProcess.length} changed file(s)...`);

    // Create a new config for the operation to ensure targetPaths is correctly set
    const runConfig = await loadAndMergeConfig(context.cliOptions.configPath);
    runConfig.targetPaths = filesToProcess;
    // Ensure dry-run and no-embed options are respected from original CLI flags
    runConfig.dryRun = context.cliOptions.dryRun || false;
    runConfig.disableEmbeddings = context.cliOptions.noEmbed || false;
    runConfig.incremental = true; // Mark as incremental run for telemetry/reporting

    const operation = new GenerateDocumentationOperation();
    try {
      await operation.execute({ ...context, config: runConfig });
      logger.success("Incremental generation completed successfully.");
    } catch (error) {
      logger.error(
        `Incremental generation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
