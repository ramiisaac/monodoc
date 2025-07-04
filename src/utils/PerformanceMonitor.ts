import { logger } from "./logger";

/**
 * Manages performance metrics by recording durations, custom values, and system stats.
 */
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map(); // For timed durations (e.g., 'generation_time')
  private startTimes: Map<string, number> = new Map(); // To track the start of timed operations
  private customMetrics: Map<string, unknown[]> = new Map(); // For arbitrary custom metrics (e.g., 'tokens_used')

  // Thresholds for logging warnings
  private readonly WARNING_THRESHOLD_MS = 5000; // For operations exceeding this duration
  private readonly MEMORY_WARNING_THRESHOLD_MB = 500; // For heap usage exceeding this amount

  /**
   * Starts a timer for a given label.
   * @param label A unique label for the operation being timed.
   */
  startTimer(label: string): void {
    this.startTimes.set(label, Date.now());
  }

  /**
   * Ends a timer for a given label and records its duration.
   * Logs a warning if the duration exceeds a predefined threshold.
   * @param label The label of the operation to end.
   * @returns The duration of the operation in milliseconds.
   */
  endTimer(label: string): number {
    const startTime = this.startTimes.get(label);
    if (!startTime) {
      logger.warn(`Timer '${label}' was not started`);
      return 0;
    }

    const duration = Date.now() - startTime;
    if (!this.metrics.has(label)) {
      this.metrics.set(label, []);
    }
    this.metrics.get(label)!.push(duration); // Store the duration

    if (duration > this.WARNING_THRESHOLD_MS) {
      logger.warn(
        `⚠️ Slow operation detected: '${label}' took ${(duration / 1000).toFixed(2)}s`,
      );
    }

    this.startTimes.delete(label); // Clean up the start time
    return duration;
  }

  /**
   * Records a custom metric with a given value.
   * Logs a warning for high memory usage if the metric name is 'memory_usage'.
   * @param metricName The name of the custom metric.
   * @param value The value of the metric.
   */
  record(metricName: string, value: unknown): void {
    if (!this.customMetrics.has(metricName)) {
      this.customMetrics.set(metricName, []);
    }
    this.customMetrics.get(metricName)!.push(value);

    // Specific check for memory usage
    if (
      metricName === "memory_usage" &&
      typeof value === "number" &&
      value > this.MEMORY_WARNING_THRESHOLD_MB * 1024 * 1024 // Convert MB to bytes
    ) {
      logger.warn(
        `🚨 High memory usage: ${(value / 1024 / 1024).toFixed(2)}MB`,
      );
      // Also record a specific event for memory spikes
      this.record("memory_spike", {
        timestamp: new Date().toISOString(),
        heapUsedBytes: value,
        // Add other relevant memory stats if desired
      });
    }
  }

  /**
   * Alias for the `record` method.
   * @param metricName The name of the custom metric.
   * @param value The value of the metric.
   */
  recordMetric(metricName: string, value: unknown): void {
    this.record(metricName, value);
  }

  /**
   * Retrieves all collected performance metrics.
   * @returns An object containing aggregated timer stats, custom metric stats, and current memory usage.
   */
  getMetrics(): Record<string, any> {
    // Corrected `any`
    const result: Record<string, any> = {
      // Corrected `any`
      timers: {},
      custom: {},
      memory: this.getMemoryMetrics(),
      summary: {
        totalTimers: this.metrics.size,
        totalCustomMetrics: this.customMetrics.size,
        timestamp: new Date().toISOString(),
      },
    };

    // Aggregate timer metrics (avg, min, max, count, total, percentiles)
    for (const [label, durations] of this.metrics) {
      if (durations.length === 0) continue;
      result.timers[label] = {
        avg: durations.reduce((a, b) => a + b, 0) / durations.length,
        min: Math.min(...durations),
        max: Math.max(...durations),
        count: durations.length,
        total: durations.reduce((a, b) => a + b, 0),
        p95: this.calculatePercentile(durations, 95),
        p99: this.calculatePercentile(durations, 99),
      };
    }

    // Aggregate custom metrics (avg, min, max, count, latest for numeric; count, latest, sample for others)
    for (const [name, values] of this.customMetrics) {
      if (values.length === 0) continue;
      if (typeof values[0] === "number") {
        const numericValues = values as number[];
        result.custom[name] = {
          avg: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          count: numericValues.length,
          total: numericValues.reduce((a, b) => a + b, 0),
          latest: numericValues[numericValues.length - 1],
        };
      } else {
        result.custom[name] = {
          count: values.length,
          latest: values[values.length - 1],
          values: values.slice(-10), // Show a sample of recent values for non-numeric metrics
        };
      }
    }
    return result;
  }

  /**
   * Retrieves current Node.js memory usage metrics.
   * @returns An object with memory usage in MB.
   */
  private getMemoryMetrics(): Record<string, number> {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024), // Resident Set Size
      external: Math.round(memUsage.external / 1024 / 1024),
      arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024),
    };
  }

  /**
   * Calculates a specific percentile for a given array of numeric values.
   * @param values The array of numbers.
   * @param percentile The desired percentile (e.g., 95 for 95th percentile).
   * @returns The calculated percentile value.
   */
  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)]; // Ensure index is not negative
  }

  /**
   * Resets all collected metrics and timers.
   */
  reset(): void {
    this.metrics.clear();
    this.startTimes.clear();
    this.customMetrics.clear();
  }

  /**
   * Checks for potential memory leaks by logging a warning if heap usage exceeds a threshold.
   * Records a 'memory_spike' custom metric if the threshold is breached.
   */
  checkMemoryLeaks(): void {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    if (heapUsedMB > this.MEMORY_WARNING_THRESHOLD_MB) {
      logger.warn(
        `🚨 High memory usage detected: ${heapUsedMB.toFixed(2)}MB (threshold: ${this.MEMORY_WARNING_THRESHOLD_MB}MB)`,
      );
      this.record("memory_spike", {
        timestamp: new Date().toISOString(),
        heapUsedMB,
        heapTotalMB: memUsage.heapTotal / 1024 / 1024,
        rssMB: memUsage.rss / 1024 / 1024,
      });
    }
  }

  /**
   * Generates a human-readable performance report summary.
   * @returns A string containing the performance report.
   */
  generateReport(): string {
    const metrics = this.getMetrics();
    const report: string[] = ["📊 Performance Report", "===================="];

    // Timers section
    if (Object.keys(metrics.timers).length > 0) {
      report.push("\n⏱️ Timer Metrics:");
      for (const [name, stats] of Object.entries(metrics.timers)) {
        const timerStats = stats as {
          avg: number;
          min: number;
          max: number;
          total: number;
          count: number;
          p95?: number;
          p99?: number;
        };
        report.push(`  ${name}:`);
        report.push(`    - Average: ${timerStats.avg.toFixed(2)}ms`);
        report.push(
          `    - Min/Max: ${timerStats.min.toFixed(2)}ms / ${timerStats.max.toFixed(2)}ms`,
        );
        if (timerStats.p95 && timerStats.p99) {
          report.push(
            `    - P95/P99: ${timerStats.p95.toFixed(2)}ms / ${timerStats.p99.toFixed(2)}ms`,
          );
        }
        report.push(`    - Count: ${timerStats.count}`);
      }
    }

    // Custom metrics section
    if (Object.keys(metrics.custom).length > 0) {
      report.push("\n📈 Custom Metrics:");
      for (const [name, stats] of Object.entries(metrics.custom)) {
        report.push(`  ${name}: ${JSON.stringify(stats, null, 2)}`);
      }
    }

    // Memory usage section
    const memoryMetrics = metrics.memory as any; // Corrected `any`
    report.push("\n💾 Memory Usage:");
    report.push(`  - Heap Used: ${memoryMetrics.heapUsed}MB`);
    report.push(`  - Heap Total: ${memoryMetrics.heapTotal}MB`);
    report.push(`  - RSS: ${memoryMetrics.rss}MB`);

    return report.join("\n");
  }

  /**
   * Logs a summary of the performance metrics to the console.
   */
  logSummary(): void {
    logger.info(this.generateReport());
  }
}
