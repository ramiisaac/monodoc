import { ProcessingStats, TelemetryData } from "../types";
import fs from "fs/promises";
import path from "path";
import { logger } from "../utils/logger";

/**
 * Represents historical data from a previous application run.
 */
export interface HistoricalRunData {
  timestamp: Date;
  stats: ProcessingStats;
  telemetryData: TelemetryData;
  projectPath: string;
}

/**
 * Aggregated metrics for the analytics dashboard.
 */
export interface DashboardMetrics {
  totalProjects: number;
  averageQualityScore: number;
  processingTrends: TimeSeriesData[];
  errorPatterns: ErrorPattern[];
  performanceMetrics: PerformanceMetrics;
  userEngagement: UserEngagementMetrics;
}

/**
 * Data point for time series trends.
 */
export interface TimeSeriesData {
  timestamp: Date;
  filesProcessed: number;
  successRate: number;
  averageTime: number; // Average processing time per file
}

/**
 * Represents a recognized pattern of errors.
 */
export interface ErrorPattern {
  errorType: string;
  frequency: number;
  lastOccurrence: Date;
  suggestedFix: string;
}

/**
 * Key performance indicators.
 */
export interface PerformanceMetrics {
  averageProcessingTime: number; // Overall average time per file
  cacheHitRate: number;
  memoryUsagePattern: number[]; // Trend of memory usage
  cpuUsagePattern: number[]; // Trend of CPU usage
}

/**
 * Metrics related to user interaction and adoption.
 */
export interface UserEngagementMetrics {
  dailyActiveUsers: number;
  featureUsage: Record<string, number>; // Count of how often features are enabled/used
  configurationPatterns: Record<string, number>; // Count of common config patterns (e.g., default LLM provider)
}

/**
 * Generates an analytics dashboard in Markdown format based on current and historical data.
 */
export class AnalyticsDashboard {
  private analyticsDataDir: string;
  private readonly HISTORY_FILE = "history.json";

  /**
   * Creates an instance of AnalyticsDashboard.
   * @param baseDir The base directory of the project, where analytics data will be stored.
   */
  constructor(baseDir: string) {
    this.analyticsDataDir = path.join(baseDir, ".jsdoc-analytics");
  }

  /**
   * Generates the analytics dashboard.
   * @param currentStats The ProcessingStats from the current run.
   * @param _currentTelemetryData The TelemetryData from the current run (marked as unused with `_`).
   * @returns A Promise that resolves to the Markdown content of the dashboard.
   */
  async generateDashboard(
    currentStats: ProcessingStats,
    _currentTelemetryData: TelemetryData, // Mark as unused with _
  ): Promise<string> {
    await fs.mkdir(this.analyticsDataDir, { recursive: true });
    const historicalData: HistoricalRunData[] = await this.loadHistoricalData();

    // Add current run to history for future dashboards
    const newHistoryEntry: HistoricalRunData = {
      timestamp: new Date(),
      stats: currentStats,
      telemetryData: _currentTelemetryData,
      projectPath: process.cwd(), // Store current project path
    };
    historicalData.push(newHistoryEntry);
    await this.saveHistoricalData(historicalData);

    const metrics = await this.collectMetrics(historicalData);
    return this.renderDashboard(metrics);
  }

  /**
   * Collects and aggregates various metrics from historical and current data.
   * @param historicalData All historical run data.
   * @returns A Promise resolving to the DashboardMetrics.
   */
  private async collectMetrics(
    historicalData: HistoricalRunData[],
  ): Promise<DashboardMetrics> {
    // Current telemetry data is already part of the last historical entry.
    // So we operate on the full historical data directly for aggregation.
    return {
      totalProjects: this.countUniqueProjects(historicalData),
      averageQualityScore: this.calculateAverageQuality(historicalData),
      processingTrends: this.analyzeProcessingTrends(historicalData),
      errorPatterns: this.identifyErrorPatterns(historicalData),
      performanceMetrics: this.calculatePerformanceMetrics(historicalData),
      userEngagement: this.analyzeUserEngagement(historicalData),
    };
  }

  /**
   * Renders the collected metrics into a Markdown string.
   * @param metrics The DashboardMetrics to render.
   * @returns The Markdown content.
   */
  private renderDashboard(metrics: DashboardMetrics): string {
    return `
# 📊 JSDoc AI Analytics Dashboard
Generated: ${new Date().toISOString()}

## 📈 Overview
- **Total Projects Processed (Historical)**: ${metrics.totalProjects}
- **Average Quality Score (Historical)**: ${metrics.averageQualityScore.toFixed(1)}/100
- **Average Cache Hit Rate (Historical)**: ${(metrics.performanceMetrics.cacheHitRate * 100).toFixed(1)}%
- **Daily Active Users (Approximation)**: ${metrics.userEngagement.dailyActiveUsers}

## 🚀 Performance Metrics
\`\`\`
Average Processing Time: ${metrics.performanceMetrics.averageProcessingTime.toFixed(2)}ms/file
Cache Efficiency: ${(metrics.performanceMetrics.cacheHitRate * 100).toFixed(1)}%
Memory Usage Trend: ${this.formatTrend(metrics.performanceMetrics.memoryUsagePattern, "MB")}
CPU Usage Trend: ${this.formatTrend(metrics.performanceMetrics.cpuUsagePattern, "µs")}
\`\`\`

## 📊 Processing Trends (Last 10 Runs)
${metrics.processingTrends
  .map(
    (trend: TimeSeriesData) =>
      `- ${new Date(trend.timestamp).toLocaleDateString()} ${new Date(trend.timestamp).toLocaleTimeString()}: ${trend.filesProcessed} files processed (${(trend.successRate * 100).toFixed(1)}% JSDoc success, avg time: ${trend.averageTime.toFixed(0)}ms/file)`,
  )
  .join("\n")}

## ⚠️ Error Patterns
${metrics.errorPatterns
  .map(
    (pattern: ErrorPattern) =>
      `- **${pattern.errorType}**: ${pattern.frequency} occurrences\n  - Last seen: ${new Date(pattern.lastOccurrence).toLocaleDateString()}\n  - Suggested Fix: ${pattern.suggestedFix}`,
  )
  .join("\n")}

## 🎯 Feature Usage
${Object.entries(metrics.userEngagement.featureUsage)
  .map(([feature, usage]) => `- \`${feature}\`: ${usage} uses`)
  .join("\n")}

## 🔧 Configuration Patterns (Top Default LLM Providers)
${Object.entries(metrics.userEngagement.configurationPatterns)
  .map(([pattern, count]) => `- \`${pattern}\`: ${count} projects`)
  .join("\n")}

---
*This dashboard helps optimize JSDoc AI performance and user experience*
`;
  }

  /**
   * Calculates the average overall quality score from historical data.
   * @param historicalData All historical run data.
   * @returns The average quality score.
   */
  private calculateAverageQuality(historicalData: HistoricalRunData[]): number {
    if (historicalData.length === 0) return 0;
    const totalScores = historicalData.reduce(
      (sum, item) => sum + (item.telemetryData?.quality?.averageScore || 0),
      0,
    );
    return totalScores / historicalData.length;
  }

  /**
   * Analyzes processing trends over the last few runs.
   * @param historicalData All historical run data.
   * @returns An array of TimeSeriesData points.
   */
  private analyzeProcessingTrends(
    historicalData: HistoricalRunData[],
  ): TimeSeriesData[] {
    // Only keep the last 10 runs for trend analysis
    const recentHistory = historicalData.slice(-10);
    return recentHistory.map((item) => ({
      timestamp: new Date(item.timestamp || Date.now()),
      filesProcessed: item.stats.processedFiles || 0,
      successRate: item.stats.totalNodesConsidered
        ? item.stats.successfulJsdocs / item.stats.totalNodesConsidered
        : 0,
      averageTime: item.telemetryData.performance.averageProcessingTime || 0,
    }));
  }

  /**
   * Identifies common error patterns and their frequency.
   * @param historicalData All historical run data.
   * @returns An array of ErrorPattern objects.
   */
  private identifyErrorPatterns(
    historicalData: HistoricalRunData[],
  ): ErrorPattern[] {
    const allErrorsFromHistory = historicalData.flatMap(
      (h) => h.stats.errors || [],
    );
    const errorFrequency: Record<
      string,
      { count: number; lastOccurrence: Date; messages: Set<string> }
    > = {};

    allErrorsFromHistory.forEach((errEntry) => {
      const errorType = errEntry.error?.split(":")[0]?.trim() || "UnknownError";
      if (!errorFrequency[errorType]) {
        errorFrequency[errorType] = {
          count: 0,
          lastOccurrence: new Date(0),
          messages: new Set(),
        };
      }
      errorFrequency[errorType].count++;
      const entryTimestamp = errEntry.timestamp
        ? new Date(errEntry.timestamp)
        : new Date();
      if (entryTimestamp > errorFrequency[errorType].lastOccurrence) {
        errorFrequency[errorType].lastOccurrence = entryTimestamp;
      }
      if (errEntry.error) {
        errorFrequency[errorType].messages.add(
          errEntry.error.substring(0, 100),
        ); // Store a snippet of unique messages
      }
    });

    return Object.entries(errorFrequency).map(([type, data]) => ({
      errorType: type,
      frequency: data.count,
      lastOccurrence: data.lastOccurrence,
      suggestedFix: `Review logs for common messages. Example: '${Array.from(data.messages).join(" | ").substring(0, 75)}...'`,
    }));
  }

  /**
   * Calculates aggregated performance metrics from historical data.
   * @param historicalData All historical run data.
   * @returns The PerformanceMetrics object.
   */
  private calculatePerformanceMetrics(
    historicalData: HistoricalRunData[],
  ): PerformanceMetrics {
    const allProcessingTimes = historicalData
      .map((item) => item.telemetryData.performance.averageProcessingTime)
      .filter(Boolean) as number[];
    const allCacheHitRates = historicalData
      .map((item) => item.telemetryData.performance.cacheHitRate)
      .filter(Boolean) as number[];
    const allMemoryUsages = historicalData.flatMap(
      (item) => item.telemetryData.performance.memoryUsage || [],
    );
    const allCpuUsages = historicalData.flatMap(
      (item) => item.telemetryData.performance.cpuUsage || [],
    );

    const averageProcessingTime =
      allProcessingTimes.length > 0
        ? allProcessingTimes.reduce((a, b) => a + b, 0) /
          allProcessingTimes.length
        : 0;
    const averageCacheHitRate =
      allCacheHitRates.length > 0
        ? allCacheHitRates.reduce((a, b) => a + b, 0) / allCacheHitRates.length
        : 0;

    return {
      averageProcessingTime: averageProcessingTime,
      cacheHitRate: averageCacheHitRate,
      memoryUsagePattern: allMemoryUsages.slice(-5), // Show last 5 points for trend
      cpuUsagePattern: allCpuUsages.slice(-5), // Show last 5 points for trend
    };
  }

  /**
   * Analyzes user engagement patterns, such as daily active users and feature usage.
   * @param historicalData All historical run data.
   * @returns The UserEngagementMetrics object.
   */
  private analyzeUserEngagement(
    historicalData: HistoricalRunData[],
  ): UserEngagementMetrics {
    const recentSessions = new Set<string>();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    // Count unique sessions in the last 24 hours (approximation of DAU)
    historicalData.forEach((item) => {
      if (new Date(item.timestamp) > oneDayAgo) {
        recentSessions.add(item.telemetryData.sessionId);
      }
    });

    const featureUsageCounts: Record<string, number> = {};
    const configPatternCounts: Record<string, number> = {};

    historicalData.forEach((item) => {
      // Feature usage
      for (const [feature, enabled] of Object.entries(
        item.telemetryData.usage?.features || {},
      )) {
        if (enabled) {
          featureUsageCounts[feature] = (featureUsageCounts[feature] || 0) + 1;
        }
      }
      // Configuration patterns (e.g., primary LLM provider)
      const aiClientConfig =
        (item.stats.configurationUsed?.aiClientConfig as Record<
          string,
          string
        >) || {};
      const defaultGenerationModelId = aiClientConfig.defaultGenerationModelId;
      if (defaultGenerationModelId) {
        configPatternCounts[defaultGenerationModelId] =
          (configPatternCounts[defaultGenerationModelId] || 0) + 1;
      }
    });

    return {
      dailyActiveUsers: recentSessions.size,
      featureUsage: featureUsageCounts,
      configurationPatterns: configPatternCounts,
    };
  }

  /**
   * Counts unique projects based on their base directory.
   * @param historicalData All historical run data.
   * @returns The number of unique projects.
   */
  private countUniqueProjects(historicalData: HistoricalRunData[]): number {
    const uniquePaths = new Set<string>();
    historicalData.forEach((item) => uniquePaths.add(item.projectPath));
    return uniquePaths.size;
  }

  /**
   * Loads historical analytics data from the history file.
   * @returns A Promise resolving to an array of HistoricalRunData.
   */
  private async loadHistoricalData(): Promise<HistoricalRunData[]> {
    try {
      const data = await fs.readFile(
        path.join(this.analyticsDataDir, this.HISTORY_FILE),
        "utf-8",
      );
      const parsedData = JSON.parse(data) as HistoricalRunData[];
      // Ensure timestamps are Date objects
      return Array.isArray(parsedData)
        ? parsedData.map((item) => ({
            ...item,
            timestamp: new Date(item.timestamp),
          }))
        : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        logger.debug(
          `Analytics history file not found at ${path.join(this.analyticsDataDir, this.HISTORY_FILE)}. Starting fresh.`,
        );
      } else {
        logger.warn(
          `Failed to load historical analytics data: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return [];
    }
  }

  /**
   * Saves historical analytics data to the history file.
   * @param historicalData The array of HistoricalRunData to save.
   */
  private async saveHistoricalData(
    historicalData: HistoricalRunData[],
  ): Promise<void> {
    try {
      // Keep only the last 100 entries to prevent the file from growing too large
      const dataToSave = historicalData.slice(-100);
      await fs.writeFile(
        path.join(this.analyticsDataDir, this.HISTORY_FILE),
        JSON.stringify(dataToSave, null, 2),
      );
    } catch (error) {
      logger.error(
        `Failed to save historical analytics data: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Formats a trend data array into a string, showing direction and latest value.
   * @param data The array of numbers representing the trend.
   * @param unit The unit of the data (e.g., 'MB', 'ms').
   * @returns A formatted trend string.
   */
  private formatTrend(data: number[], unit: string): string {
    if (!data || data.length < 2) return "Insufficient data";
    const latest = data[data.length - 1];
    const initial = data[0];
    let trend = "";
    if (latest > initial) {
      trend = "↗️ (Increasing)";
    } else if (latest < initial) {
      trend = "↘️ (Decreasing)";
    } else {
      trend = "= (Stable)";
    }
    return `${trend} - Latest: ${latest.toFixed(1)}${unit}`;
  }
}
