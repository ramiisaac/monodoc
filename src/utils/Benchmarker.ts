import { PerformanceMonitor } from "./PerformanceMonitor";
import { logger } from "./logger";
import { ProcessingStats } from "../types";
import fs from "fs/promises";
import path from "path";
import os from "os"; // For system info in reports

/**
 * Interface for the result of a single benchmark run.
 */
export interface BenchmarkResult {
  // Exported for use in reports
  testName: string;
  duration: number; // in milliseconds
  throughput: number; // files per second
  memoryUsage: number; // in bytes (heapUsed difference)
  errorRate: number; // proportion of failed JSDocs
  cacheEfficiency: number; // cache hit rate (0-1)
  timestamp: string; // ISO string of when this run completed
  success: boolean; // True if the benchmark function completed without throwing
  details?: Record<string, any>; // Corrected `any`
}

/**
 * Type for a function that represents the "workload" to be benchmarked.
 * It should return `ProcessingStats` or a similar object that can be used
 * to derive metrics like processed files, errors, and cache usage.
 */
type BenchmarkedFunction = () => Promise<ProcessingStats>;

/**
 * The `Benchmarker` class provides functionality to run and analyze performance benchmarks.
 * It can execute a given function multiple times, measure its performance,
 * and generate reports.
 */
export class Benchmarker {
  private performanceMonitor: PerformanceMonitor;
  private benchmarks: BenchmarkResult[] = []; // Stores results from all runs

  constructor() {
    this.performanceMonitor = new PerformanceMonitor();
  }

  /**
   * Runs a benchmark test for a given function.
   * It executes the function multiple times, collects performance metrics,
   * and aggregates the results.
   * @param testName A descriptive name for the benchmark test.
   * @param testFunction The asynchronous function to benchmark, which should return `ProcessingStats`.
   * @param iterations The number of times to run the `testFunction` (default: 1).
   * @returns A Promise that resolves to the aggregated `BenchmarkResult`.
   */
  async runBenchmark(
    testName: string,
    testFunction: BenchmarkedFunction,
    iterations: number = 1,
  ): Promise<BenchmarkResult> {
    logger.info(`🏃 Running benchmark: ${testName} (${iterations} iterations)`);

    const individualResults: Omit<
      BenchmarkResult,
      "testName" | "timestamp" | "success"
    >[] = [];

    for (let i = 0; i < iterations; i++) {
      logger.info(`  - Iteration ${i + 1}/${iterations}...`);
      const startMemory = process.memoryUsage().heapUsed; // Capture memory before run
      const timerKey = `benchmark_iteration_${testName}_${i}`;
      this.performanceMonitor.startTimer(timerKey);
      let iterationSuccess = false;
      let currentStats: ProcessingStats | null = null;

      try {
        currentStats = await testFunction(); // Execute the actual workload
        const duration = this.performanceMonitor.endTimer(timerKey);
        const endMemory = process.memoryUsage().heapUsed;
        iterationSuccess = true;

        if (currentStats) {
          const filesProcessed = currentStats.processedFiles || 0;
          const totalNodesConsidered = currentStats.totalNodesConsidered || 0;
          const successfulJsdocs = currentStats.successfulJsdocs || 0;
          const failedJsdocs = currentStats.failedJsdocs || 0;
          const totalApiCalls = successfulJsdocs + failedJsdocs; // Approximation
          const cacheHits =
            this.performanceMonitor.getMetrics().custom?.cache_hits?.total || 0;
          const cacheMisses =
            this.performanceMonitor.getMetrics().custom?.cache_misses?.total ||
            0;
          const totalCacheAccesses = cacheHits + cacheMisses;

          individualResults.push({
            duration: duration,
            throughput:
              filesProcessed > 0 && duration > 0
                ? filesProcessed / (duration / 1000)
                : 0,
            memoryUsage: endMemory - startMemory,
            errorRate:
              totalNodesConsidered > 0
                ? failedJsdocs / totalNodesConsidered
                : 0,
            cacheEfficiency:
              totalCacheAccesses > 0 ? cacheHits / totalCacheAccesses : 0,
            details: {
              filesProcessed: filesProcessed,
              successfulJsdocs: successfulJsdocs,
              failedJsdocs: failedJsdocs,
              apiCalls: totalApiCalls,
              cacheHits: cacheHits,
            },
          });
        }
        logger.info(
          `  ✅ Iteration ${i + 1} completed in ${(duration / 1000).toFixed(2)}s.`,
        );
      } catch (error: unknown) {
        // Corrected `any`
        const duration = this.performanceMonitor.endTimer(timerKey);
        logger.error(
          `  ❌ Benchmark iteration ${i + 1} failed after ${(duration / 1000).toFixed(2)}s: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Record partial data or zeros for failed iterations
        individualResults.push({
          duration: duration,
          throughput: 0,
          memoryUsage: 0, // Cannot reliably measure if process crashed or failed early
          errorRate: 1, // Assume 100% error rate for a failed iteration
          cacheEfficiency: 0,
          details: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      } finally {
        this.performanceMonitor.reset(); // Reset monitor for next iteration to ensure clean slate
      }
    }

    const aggregatedResult: BenchmarkResult = {
      testName: testName,
      timestamp: new Date().toISOString(),
      success: individualResults.every((r) => r.errorRate < 1), // Overall success if no iterations had full errors
      ...this.calculateAverages(individualResults),
    };
    this.benchmarks.push(aggregatedResult); // Store for overall report

    logger.info(`✅ Benchmark completed: ${testName}`);
    this.logMetrics(aggregatedResult);

    return aggregatedResult;
  }

  /**
   * Calculates the average metrics across multiple benchmark iterations.
   * @param results An array of individual benchmark iteration results.
   * @returns An object containing the averaged metrics.
   */
  private calculateAverages(
    results: Omit<BenchmarkResult, "testName" | "timestamp" | "success">[],
  ): Omit<BenchmarkResult, "testName" | "timestamp" | "success"> {
    if (results.length === 0) {
      return {
        duration: 0,
        throughput: 0,
        memoryUsage: 0,
        errorRate: 0,
        cacheEfficiency: 0,
        details: {},
      };
    }

    const sum = (key: keyof (typeof results)[0]) =>
      results.reduce(
        (s, r) => s + (typeof r[key] === "number" ? (r[key] as number) : 0),
        0,
      ); // Corrected `any`

    const avgDuration = sum("duration") / results.length;
    const avgThroughput = sum("throughput") / results.length;
    const avgMemoryUsage = sum("memoryUsage") / results.length;
    const avgErrorRate = sum("errorRate") / results.length;
    const avgCacheEfficiency = sum("cacheEfficiency") / results.length;

    // Aggregate details or just take from the first successful run for typical values
    const firstSuccessfulDetails =
      results.find((r) => r.details && !r.details.error)?.details || {};

    return {
      duration: avgDuration,
      throughput: avgThroughput,
      memoryUsage: avgMemoryUsage,
      errorRate: avgErrorRate,
      cacheEfficiency: avgCacheEfficiency,
      details: firstSuccessfulDetails,
    };
  }

  /**
   * Formats a metric value for console output.
   * @param key The metric key.
   * @param value The numeric value of the metric.
   * @returns A formatted string.
   */
  private formatMetricValue(key: keyof BenchmarkResult, value: number): string {
    // Corrected type of key
    switch (key) {
      case "duration":
        return `${value.toFixed(2)}ms`;
      case "throughput":
        return `${value.toFixed(2)} files/sec`;
      case "memoryUsage":
        return `${(value / 1024 / 1024).toFixed(2)}MB`; // Convert bytes to MB
      case "errorRate":
        return `${(value * 100).toFixed(2)}%`; // Convert to percentage
      case "cacheEfficiency":
        return `${(value * 100).toFixed(1)}%`;
      default:
        return value.toString();
    }
  }

  /**
   * Logs the key metrics of a single benchmark result to the console.
   * @param result The BenchmarkResult to log.
   */
  private logMetrics(result: BenchmarkResult): void {
    const metrics: (keyof BenchmarkResult)[] = [
      "duration",
      "throughput",
      "memoryUsage",
      "errorRate",
      "cacheEfficiency",
    ]; // Corrected type of metrics array
    for (const key of metrics) {
      logger.info(
        `  ${this.capitalizeFirstLetter(key)}: ${this.formatMetricValue(key, result[key] as number)}`,
      );
    }
  }

  /**
   * Capitalizes the first letter of a string.
   * @param s The input string.
   * @returns The capitalized string.
   */
  private capitalizeFirstLetter(s: string): string {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /**
   * Generates a comprehensive Markdown benchmark report based on all runs.
   * @returns A string containing the Markdown report.
   */
  generateBenchmarkReport(): string {
    if (this.benchmarks.length === 0) {
      return "# 📊 Benchmark Report\n\nNo benchmark data available.";
    }

    const report: string[] = [
      "# 📊 Benchmark Report",
      `Generated: ${new Date().toISOString()}`,
      "",
      "## Environment",
      `- Node.js Version: ${process.version}`,
      `- Platform: ${process.platform} (${process.arch})`,
      `- Total Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
      `- CPU Cores: ${os.cpus().length}`,
      "",
      "## Summary of All Benchmarks",
      "| Test Name | Duration (ms) | Throughput (files/sec) | Memory Usage (MB) | Error Rate (%) | Cache Hit Rate (%) |",
      "|-----------|---------------|------------------------|-------------------|----------------|--------------------|",
      ...this.benchmarks.map(
        (b) =>
          `| ${b.testName} | ${b.duration.toFixed(2)} | ${b.throughput.toFixed(2)} | ${(b.memoryUsage / 1024 / 1024).toFixed(2)} | ${(b.errorRate * 100).toFixed(2)} | ${(b.cacheEfficiency * 100).toFixed(1)} |`,
      ),
      "",
      "## Detailed Results",
      ...this.benchmarks.map((b) => this.generateDetailedBenchmarkSection(b)),
      "",
      "## Overall Recommendations",
      this.generateOverallRecommendations(),
      "",
      "---",
      "*Generated by JSDoc AI Benchmarker*",
    ];
    return report.join("\n");
  }

  /**
   * Generates a detailed Markdown section for a single benchmark result.
   * @param b The BenchmarkResult object.
   * @returns A formatted Markdown string.
   */
  private generateDetailedBenchmarkSection(b: BenchmarkResult): string {
    return `
### ${b.testName} ${b.success ? "✅" : "❌"}
- **Overall Duration**: ${b.duration.toFixed(2)}ms
- **Throughput**: ${b.throughput.toFixed(2)} files/sec
- **Memory Usage (Avg Heap Delta)**: ${(b.memoryUsage / 1024 / 1024).toFixed(2)}MB
- **Error Rate (JSDoc Failures)**: ${(b.errorRate * 100).toFixed(2)}%
- **Cache Hit Rate**: ${(b.cacheEfficiency * 100).toFixed(1)}%
- **Run Status**: ${b.success ? "Success" : "Failed"}
${b.details?.error ? `- **Error Details**: ${b.details.error}` : ""}
`;
  }

  /**
   * Generates overall recommendations based on aggregated benchmark results.
   * @returns A string containing recommendations.
   */
  private generateOverallRecommendations(): string {
    if (this.benchmarks.length === 0) {
      return "- No benchmark data available to provide recommendations.";
    }

    const recommendations: string[] = [];
    const avgThroughput =
      this.benchmarks.reduce((sum, b) => sum + b.throughput, 0) /
      this.benchmarks.length;
    const avgErrorRate =
      this.benchmarks.reduce((sum, b) => sum + b.errorRate, 0) /
      this.benchmarks.length;
    const avgMemory =
      this.benchmarks.reduce((sum, b) => sum + b.memoryUsage, 0) /
      this.benchmarks.length;
    const avgCacheEfficiency =
      this.benchmarks.reduce((sum, b) => sum + b.cacheEfficiency, 0) /
      this.benchmarks.length;

    if (avgErrorRate > 0.05) {
      recommendations.push(
        `- High average error rate (${(avgErrorRate * 100).toFixed(2)}%) across benchmarks. Focus on improving AI generation reliability and error handling.`,
      );
    }
    if (
      avgCacheEfficiency < 0.7 &&
      this.benchmarks.some((b) => b.cacheEfficiency > 0)
    ) {
      recommendations.push(
        `- Low average cache hit rate (${(avgCacheEfficiency * 100).toFixed(1)}%). Ensure caching is effectively used to reduce API calls.`,
      );
    }
    if (avgThroughput < 1) {
      // less than 1 file per second average
      recommendations.push(
        `- Overall throughput is low (${avgThroughput.toFixed(2)} files/sec). Consider increasing concurrency limits if CPU/network allows.`,
      );
    }
    if (avgMemory / (1024 * 1024) > 400) {
      // If average memory usage is over 400MB
      recommendations.push(
        `- Average memory usage is high (${(avgMemory / (1024 * 1024)).toFixed(2)}MB). Investigate memory optimization strategies.`,
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        "- All benchmarks show healthy performance metrics. Continue monitoring!",
      );
    }

    return recommendations.join("\n");
  }
}
