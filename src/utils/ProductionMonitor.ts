import { logger } from "./logger";
import os from "os"; // For CPU usage

/**
 * Interface for a metric entry, storing a value and its timestamp.
 */
export interface MetricEntry {
  value: unknown;
  timestamp: Date;
}

/**
 * Monitors key production metrics such as memory usage, uptime, and custom metrics.
 * It provides health status reporting and can issue warnings based on predefined thresholds.
 */
export class ProductionMonitor {
  private static instance: ProductionMonitor; // Singleton instance
  private metrics: Map<string, MetricEntry> = new Map(); // Stores the latest value for each metric

  // Predefined thresholds for alerts
  private alertThresholds = {
    errorRate: 0.1, // If error rate exceeds 10%
    memoryUsage: 500 * 1024 * 1024, // If heap used exceeds 500 MB
    processingTime: 60000, // If average processing time per file exceeds 60 seconds
    cacheHitRate: 0.5, // If cache hit rate falls below 50%
  };

  /**
   * Private constructor to enforce singleton pattern.
   */
  private constructor() {
    // Optionally, could set up continuous monitoring intervals here
  }

  /**
   * Returns the singleton instance of ProductionMonitor.
   * @returns The ProductionMonitor instance.
   */
  static getInstance(): ProductionMonitor {
    if (!ProductionMonitor.instance) {
      ProductionMonitor.instance = new ProductionMonitor();
    }
    return ProductionMonitor.instance;
  }

  /**
   * Records a metric value with a timestamp.
   * @param name The name of the metric (e.g., 'errorRate', 'memoryUsage').
   * @param value The value of the metric.
   */
  recordMetric(name: string, value: unknown): void {
    this.metrics.set(name, {
      value,
      timestamp: new Date(),
    });
    this.checkAlerts(name, value); // Check for alerts immediately
  }

  /**
   * Checks if a recorded metric value crosses a predefined alert threshold.
   * Logs a warning if an alert condition is met.
   * @param name The name of the metric.
   * @param value The value of the metric.
   */
  private checkAlerts(name: string, value: unknown): void {
    switch (name) {
      case "errorRate":
        if (
          typeof value === "number" &&
          value > this.alertThresholds.errorRate
        ) {
          logger.warn(
            `🚨 Alert: High error rate detected: ${(value * 100).toFixed(1)}%`,
          );
        }
        break;
      case "memoryUsage": // Expecting value in bytes
        if (
          typeof value === "number" &&
          value > this.alertThresholds.memoryUsage
        ) {
          logger.warn(
            `🚨 Alert: High memory usage: ${(value / 1024 / 1024).toFixed(2)}MB`,
          );
        }
        break;
      case "processingTime": // Expecting value in milliseconds
        if (
          typeof value === "number" &&
          value > this.alertThresholds.processingTime
        ) {
          logger.warn(
            `🚨 Alert: Slow processing detected: ${(value / 1000).toFixed(2)}s`,
          );
        }
        break;
      case "cacheHitRate":
        if (
          typeof value === "number" &&
          value < this.alertThresholds.cacheHitRate
        ) {
          logger.warn(
            `🚨 Alert: Low cache hit rate: ${(value * 100).toFixed(1)}%`,
          );
        }
        break;
      // Add more alerts for other critical metrics as needed
    }
  }

  /**
   * Generates a health report summarizing the current status of the application.
   * Includes uptime, memory usage, and recorded metrics.
   * @returns An object containing the health report.
   */
  generateHealthReport(): {
    timestamp: string;
    uptime: string;
    memory: Record<string, string>;
    metrics: Record<string, MetricEntry>;
    cpuUsage: string;
    status: string;
  } {
    const memUsage = process.memoryUsage();
    const uptimeSeconds = process.uptime();
    const cpuLoad = os.loadavg(); // Get 1, 5, and 15-minute average load

    return {
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${Math.round(uptimeSeconds % 60)}s`,
      memory: {
        used: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        total: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)}MB`, // Resident Set Size
        external: `${(memUsage.external / 1024 / 1024).toFixed(2)}MB`,
      },
      cpuUsage: `Load Averages (1, 5, 15 min): ${cpuLoad.map((l) => l.toFixed(2)).join(", ")}`,
      metrics: Object.fromEntries(this.metrics), // Convert Map to plain object
      status: this.getHealthStatus(),
    };
  }

  /**
   * Determines the overall health status of the application based on recent metrics.
   * @returns 'healthy', 'warning', or 'critical'.
   */
  private getHealthStatus(): string {
    const currentMemoryUsage = process.memoryUsage().heapUsed;
    if (currentMemoryUsage > this.alertThresholds.memoryUsage) {
      return "warning"; // Memory is a primary indicator
    }

    const errorRateMetric = this.metrics.get("errorRate")?.value;
    if (
      typeof errorRateMetric === "number" &&
      errorRateMetric > this.alertThresholds.errorRate
    ) {
      return "warning";
    }

    // Add more complex logic here for 'critical' status
    // For example, if multiple metrics are in warning, or a critical error count is high.

    return "healthy";
  }
}
