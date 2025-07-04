import path from "path";
import fs from "fs/promises";
import globby from "globby";
import { logger } from "../utils/logger";
import {
  FileBatch,
  WorkspacePackage,
  GeneratorConfig,
  FileInfo,
} from "../types";
import { AnalysisError } from "../utils/errorHandling";

/**
 * Responsible for collecting relevant source files and organizing them into token-aware batches.
 * This optimizes API calls to LLMs by grouping files into chunks that fit within context windows.
 */
export class FileBatcher {
  // Rough estimate of characters per token for common LLMs (e.g., GPT-4: 4 chars/token)
  private readonly CHARS_PER_TOKEN = 4;

  /**
   * Creates token-aware batches of files from discovered packages.
   * Files are prioritized by a heuristic (e.g., 'index.ts', 'api' directories)
   * to ensure core modules are processed earlier.
   * @param packages The list of discovered workspace packages.
   * @param config The generator configuration, especially `aiClientConfig.maxTokensPerBatch`.
   * @param baseDir The base directory of the project.
   * @returns A Promise resolving to an array of FileBatch objects.
   * @throws AnalysisError if file collection fails.
   */
  async createBatches(
    packages: WorkspacePackage[],
    config: GeneratorConfig,
    baseDir: string,
  ): Promise<FileBatch[]> {
    logger.info("📊 Creating token-aware batches...");
    const allFiles = await this.collectFiles(packages, config, baseDir);
    this.sortByPriorityDescending(allFiles); // Sort files before batching

    logger.success(
      `📄 Found ${allFiles.length} TypeScript/JavaScript files for processing`,
    );

    const batches = this.batchFilesByTokenLimit(
      allFiles,
      config.aiClientConfig.maxTokensPerBatch, // Use the new AI Client config field
      baseDir,
    );

    this.sortBatchesByPriorityDescending(batches); // Re-sort batches if cross-batch priority matters

    logger.success(`📦 Created ${batches.length} processing batches`);
    logger.info(
      `   Average batch size: ${batches.length > 0 ? Math.round(batches.reduce((sum, b) => sum + b.files.length, 0) / batches.length) : 0} files`,
    );
    return batches;
  }

  /**
   * Collects all relevant TypeScript/JavaScript files from the specified packages,
   * respecting include/ignore patterns.
   * @param packages The list of discovered workspace packages.
   * @param config The generator configuration with include/ignore patterns.
   * @param baseDir The base directory of the project.
   * @returns A Promise resolving to an array of file objects with path, size, and priority.
   * @throws AnalysisError if globbing or file stat operations fail.
   */
  private async collectFiles(
    packages: WorkspacePackage[],
    config: GeneratorConfig,
    baseDir: string,
  ): Promise<Array<{ path: string; size: number; priority: number }>> {
    const filesList: Array<{ path: string; size: number; priority: number }> =
      [];
    const includePatterns = this.getEffectiveIncludePatterns(config); // CLI --target-paths take precedence
    const ignorePatterns = config.ignorePatterns;

    for (const pkg of packages) {
      try {
        const files = await globby(includePatterns, {
          cwd: pkg.path, // Search within each package's path
          absolute: true, // Get absolute paths
          ignore: ignorePatterns,
          dot: true, // Include dotfiles (e.g., .next/ for Next.js if explicitly included)
        });

        for (const filePath of files) {
          try {
            const stats = await fs.stat(filePath);
            if (!stats.isFile()) {
              logger.trace(
                `Skipping non-file path: ${path.relative(baseDir, filePath)}`,
              );
              continue;
            }
            filesList.push({
              path: filePath,
              size: stats.size,
              priority: this.calculateFilePriority(filePath, pkg.priority || 0), // Line 89: use pkg.priority || 0
            });
          } catch (err) {
            logger.warn(
              `Could not read file stats for ${path.relative(baseDir, filePath)}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
      } catch (error) {
        throw new AnalysisError(
          `Error globbing files in package ${pkg.name} (${pkg.path}): ${
            error instanceof Error ? error.message : String(error)
          }`,
          error,
        );
      }
    }
    return filesList;
  }

  /**
   * Determines the effective include patterns for file collection.
   * CLI-specified `targetPaths` override general `includePatterns` from config.
   * @param config The generator configuration.
   * @returns An array of string patterns to include.
   */
  private getEffectiveIncludePatterns(config: GeneratorConfig): string[] {
    if (config.targetPaths && config.targetPaths.length > 0) {
      logger.info(
        `🎯 CLI-specified target paths will override general include patterns: ${config.targetPaths.join(", ")}`,
      );
      // Ensure target paths are relative to package path if passed from CLI.
      // Globby's `cwd` option handles this for us if targetPaths are like "**/*.ts"
      // or "path/to/file.ts" relative to `cwd`. If targetPaths were absolute, it'd still work.
      return config.targetPaths;
    }
    return config.includePatterns;
  }

  /**
   * Sorts files by their calculated priority in descending order.
   * @param files The array of file objects to sort.
   */
  private sortByPriorityDescending(
    files: Array<{ path: string; size: number; priority: number }>,
  ): void {
    files.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Divides sorted files into batches based on a maximum token limit per batch.
   * Files larger than the batch limit are placed in their own single-file batches.
   * @param sortedFiles The array of file objects, sorted by priority.
   * @param maxTokensPerBatch The maximum estimated tokens allowed per batch.
   * @param baseDir The base directory for logging relative paths.
   * @returns An array of FileBatch objects.
   */
  private batchFilesByTokenLimit(
    sortedFiles: Array<{ path: string; size: number; priority: number }>,
    maxTokensPerBatch: number,
    baseDir: string,
  ): FileBatch[] {
    const batches: FileBatch[] = [];
    let batchId = 0;
    let currentBatch: {
      files: FileInfo[];
      estimatedTokens: number;
      priority: number;
    } = {
      files: [],
      estimatedTokens: 0,
      priority: 0,
    };

    for (const file of sortedFiles) {
      const estimatedFileTokens = Math.ceil(file.size / this.CHARS_PER_TOKEN);

      if (
        currentBatch.files.length > 0 &&
        currentBatch.estimatedTokens + estimatedFileTokens > maxTokensPerBatch
      ) {
        batches.push({
          id: `batch-${batchId++}`,
          files: currentBatch.files,
          estimatedTokens: currentBatch.estimatedTokens,
          priority: currentBatch.priority,
        });
        currentBatch = { files: [], estimatedTokens: 0, priority: 0 };
      }

      if (estimatedFileTokens > maxTokensPerBatch) {
        logger.warn(
          `File ${file.path} (~${estimatedFileTokens} tokens) exceeds max batch size (${maxTokensPerBatch} tokens). Processing separately.`,
        );
        batches.push({
          id: `batch-${batchId++}`,
          files: [{ path: file.path }],
          estimatedTokens: estimatedFileTokens,
          priority: file.priority,
        });
      } else {
        currentBatch.files.push({ path: file.path });
        currentBatch.estimatedTokens += estimatedFileTokens;
        currentBatch.priority = Math.max(currentBatch.priority, file.priority);
      }
    }

    if (currentBatch.files.length > 0) {
      batches.push({
        id: `batch-${batchId++}`,
        files: currentBatch.files,
        estimatedTokens: currentBatch.estimatedTokens,
        priority: currentBatch.priority,
      });
    }

    this.sortBatchesByPriorityDescending(batches);
    return batches;
  }

  /**
   * Sorts batches by their priority in descending order.
   * @param batches The array of FileBatch objects to sort.
   */
  private sortBatchesByPriorityDescending(batches: FileBatch[]): void {
    batches.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Calculates a priority score for a given file.
   * This heuristic assigns higher scores to potentially more important files (e.g., core logic, APIs).
   * @param filePath The absolute path to the file.
   * @param packagePriority The priority of the package the file belongs to.
   * @returns The calculated priority score for the file.
   */
  private calculateFilePriority(
    filePath: string,
    packagePriority: number,
  ): number {
    let priority = packagePriority; // Start with package's priority

    const fileName = path
      .basename(filePath, path.extname(filePath))
      .toLowerCase();
    const dirName = path.basename(path.dirname(filePath)).toLowerCase();

    // Keywords in file names (e.g., index, api, service, types)
    const fileNameKeywords = [
      { words: ["index", "main", "core"], points: 20 },
      {
        words: ["api", "service", "client", "gateway", "repository"],
        points: 15,
      },
      { words: ["type", "interface", "model", "schema", "types"], points: 15 },
      { words: ["util", "helper", "utils", "helpers"], points: 10 },
      { words: ["config", "configuration"], points: 10 },
      { words: ["constant", "enum"], points: 5 },
      { words: ["hook", "component", "components"], points: 5 },
    ];

    // Keywords in directory names (e.g., src, lib, services)
    const dirNameKeywords = [
      { words: ["src", "source", "lib", "library"], points: 10 },
      { words: ["api", "services", "clients"], points: 15 },
      { words: ["types", "models", "interfaces"], points: 15 },
      { words: ["hooks", "components", "elements"], points: 5 },
    ];

    for (const { words, points } of fileNameKeywords) {
      if (words.some((w) => fileName.includes(w))) {
        priority += points;
      }
    }

    for (const { words, points } of dirNameKeywords) {
      if (words.some((w) => dirName.includes(w))) {
        priority += points;
      }
    }

    // Penalize test-related files if they somehow slip through ignore patterns
    if (fileName.includes("test") || fileName.includes("spec")) {
      priority -= 50; // Large penalty
    }

    return priority;
  }
}
