import { ICommand, CommandContext } from "../types";
import { logger } from "../utils/logger";
import { RunBenchmarkOperation } from "../operations/RunBenchmarkOperation";

/**
 * Implements the 'benchmark' command logic.
 * This command runs performance benchmarks for the JSDoc generation process.
 */
export class BenchmarkCommand implements ICommand {
  async execute(context: CommandContext): Promise<void> {
    logger.info("🏃‍♂️ Running benchmark suite...");

    const operation = new RunBenchmarkOperation();
    try {
      // Benchmark operation will handle its own logging and reporting
      await operation.execute(context);
      logger.success("Benchmark suite completed successfully.");
    } catch (error) {
      logger.error(
        `Benchmark operation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error; // Re-throw to be caught by CommandRunner's error handling
    }
  }
}
