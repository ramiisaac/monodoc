import { IOperation, CommandContext, ProcessingStats } from '../types';
import { logger } from '../utils/logger';
import { Benchmarker } from '../utils/Benchmarker';
import { GenerateDocumentationOperation } from './GenerateDocumentationOperation';
import { Project } from 'ts-morph';

/**
 * Operation to run performance benchmarks for the JSDoc generation process.
 * It leverages the `Benchmarker` utility and can run a simulated or actual generation.
 */
export class RunBenchmarkOperation implements IOperation {
  async execute(context: CommandContext): Promise<void> {
    logger.info('🏃‍♂️ Running benchmark suite...');
    const benchmarker = new Benchmarker();

    // Define the function that simulates a single run of the JSDoc generation process.
    // This function will be passed to the Benchmarker.
    const benchmarkedFunction = async (): Promise<ProcessingStats> => {
      logger.debug('Starting a single benchmark iteration...');
      // To get real-world performance, we need to execute the core generation logic.
      // This means creating a new instance of GenerateDocumentationOperation
      // and running its execute method with a cloned context/config to ensure isolation
      // and prevent side effects across benchmark iterations.

      // Clone context and config to ensure each benchmark run is isolated.
      const clonedConfig = JSON.parse(JSON.stringify(context.config));
      const clonedCliOptions = JSON.parse(JSON.stringify(context.cliOptions));

      // IMPORTANT: For true isolation, shared mutable objects like Project, CacheManager,
      // Telemetry, PluginManager should either be reset, or new instances passed.
      // For a benchmark, we want to measure the "full stack" without external interference.
      // Resetting cache is usually desired for fresh runs in benchmarks.
      if (context.cacheManager) {
        await context.cacheManager.clear();
      }
      context.telemetry.reset(); // Reset telemetry for a clean measurement per iteration

      // Re-initialize a minimal context for the inner operation if necessary,
      // or ensure the `GenerateDocumentationOperation` is robust enough to handle its own setup.
      // For simplicity, we'll pass the existing context, assuming `GenerateDocumentationOperation`
      // cleans up or re-initializes its internal components appropriately per run.
      // For more accurate isolation, one might create new Project/PluginManager instances.
      const tempProject = new Project({
        tsConfigFilePath: context.project.getCompilerOptions().tsConfigFilePath,
        skipAddingFilesFromTsConfig: true,
        skipFileDependencyResolution: true,
        useInMemoryFileSystem: false,
      });

      const tempContext: CommandContext = {
        ...context,
        config: clonedConfig,
        cliOptions: clonedCliOptions,
        project: tempProject, // Pass a fresh project for this run
        // Keep other managers as they are, but their internal state should be reset if possible
      };

      const operation = new GenerateDocumentationOperation();
      const stats = await operation.execute(tempContext);
      logger.debug('Single benchmark iteration completed.');
      return stats;
    };

    // Run the benchmark for a specified number of iterations (e.g., 3 for robustness)
    const iterations = 3;
    await benchmarker.runBenchmark(
      'JSDoc Generation Full Workflow',
      benchmarkedFunction,
      iterations,
    );

    // Generate and log the final benchmark report
    const report = benchmarker.generateBenchmarkReport();
    logger.info('\n📊 Benchmark Results:');
    logger.log(report); // Use logger.log for multi-line formatted output

    logger.success('Benchmark suite completed.');
  }
}
