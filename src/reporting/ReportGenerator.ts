import * as path from 'path';
import { promises as fs } from 'fs';
import { logger } from '../utils/logger';
import { ProcessingStats, FileBatch, WorkspacePackage } from '../types';
import { PluginManager } from '../plugins/PluginManager';

/**
 * Interface for performance metrics that the ReportGenerator can display.
 * This should align with `PerformanceMonitor.getMetrics()` output.
 */
export interface PerformanceMetrics {
  timers: Record<
    string,
    {
      avg: number;
      min: number;
      max: number;
      total: number;
      count: number;
      p95?: number;
      p99?: number;
    }
  >;
  counters: Record<string, number>;
  gauges: Record<string, number>;
  distributions: Record<string, number[]>;
  metadata: {
    startTime: number;
    endTime: number;
    duration: number;
  };
}

/**
 * Manages the generation of various reports (JSON, Markdown, Quality, Performance).
 * It writes these reports to the file system in a structured manner.
 */
export class ReportGenerator {
  public pluginManager?: PluginManager;
  private baseDir: string;

  constructor(pluginManager?: PluginManager | string, baseDir?: string) {
    // Handle overloaded constructor
    if (typeof pluginManager === 'string') {
      // Called with just baseDir
      this.baseDir = pluginManager;
      this.pluginManager = undefined;
    } else {
      // Called with pluginManager and optional baseDir
      this.pluginManager = pluginManager;
      this.baseDir = baseDir || process.cwd();
    }
  }

  /**
   * Writes content to a file, creating directories if necessary.
   * @param filePath The path to the file.
   * @param content The content to write.
   */
  public async writeFile(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Generates a JSON report of the processing statistics.
   * @param stats The processing statistics.
   * @param reportDir The directory to write the report to.
   * @returns The path of the generated report.
   */
  public async generateJSONReport(stats: ProcessingStats, reportDir: string): Promise<string> {
    const absoluteReportDir = path.resolve(this.baseDir, reportDir);
    await fs.mkdir(absoluteReportDir, { recursive: true });

    const reportData = {
      generatedAt: new Date().toISOString(),
      stats: {
        totalFiles: stats.totalFiles,
        processedFiles: stats.processedFiles,
        totalNodes: stats.totalNodes || stats.totalNodesConsidered,
        nodesWithJSDoc: stats.nodesWithJSDoc || stats.successfulJsdocs,
        generatedJSDocCount: stats.generatedJSDocCount || stats.successfulJsdocs,
        errors: stats.errors?.length || 0,
      },
      // Process the 'fileBatches' Map into serializable format
      batches: stats.fileBatches
        ? Array.from(stats.fileBatches.entries()).map(([key, batch]) => ({
            key,
            packageName: batch.packageName || 'unknown',
            batchIndex: batch.batchIndex || 0,
            files: batch.files,
            totalTokens: batch.totalTokens || batch.estimatedTokens,
            processingTimeMs: batch.processingTimeMs || 0,
            errors: batch.errors || [],
          }))
        : [],
      packages: stats.packages?.map((pkg: WorkspacePackage) => ({
        name: pkg.name,
        path: pkg.path,
        version: pkg.version || 'unknown',
        private: pkg.private || false,
      })),
    };

    const reportPath = path.join(absoluteReportDir, 'jsdoc-generation-report.json');
    await this.writeFile(reportPath, JSON.stringify(reportData, null, 2));
    logger.info(
      `📈 JSON report generated successfully at: ${path.relative(this.baseDir, reportPath)}`,
    );
    return reportPath;
  }

  /**
   * Generates a quality analysis report.
   * @param report The quality report data.
   * @param reportDir The directory to write the report to.
   */
  public async generateQualityReport(report: any, reportDir: string): Promise<void> {
    const absoluteReportDir = path.resolve(this.baseDir, reportDir);
    await fs.mkdir(absoluteReportDir, { recursive: true });

    const filePath = path.join(absoluteReportDir, 'quality-report.json');
    await this.writeFile(filePath, JSON.stringify(report, null, 2));
    logger.info(`Quality report written to ${path.relative(this.baseDir, filePath)}`);
  }

  /**
   * Generates a markdown summary of the processing results.
   * @param stats The processing statistics.
   * @param reportDir The directory to write the report to.
   * @returns The path of the generated report.
   */
  public async generateMarkdownSummary(stats: ProcessingStats, reportDir: string): Promise<string> {
    const absoluteReportDir = path.resolve(this.baseDir, reportDir);
    await fs.mkdir(absoluteReportDir, { recursive: true });

    let markdown = `# JSDoc Generation Report\n\n`;
    markdown += `Generated on: ${new Date().toISOString()}\n\n`;
    markdown += `## Summary\n\n`;
    markdown += `- **Total Files Analyzed**: ${stats.totalFiles}\n`;
    markdown += `- **Files Processed**: ${stats.processedFiles}\n`;
    markdown += `- **Total Nodes**: ${stats.totalNodes || stats.totalNodesConsidered}\n`;
    markdown += `- **Nodes with JSDoc**: ${stats.nodesWithJSDoc || stats.successfulJsdocs}\n`;
    markdown += `- **Generated JSDoc Count**: ${stats.generatedJSDocCount || stats.successfulJsdocs}\n`;
    markdown += `- **Errors**: ${stats.errors?.length || 0}\n\n`;

    if (stats.packages && stats.packages.length > 0) {
      markdown += `## Packages\n\n`;
      markdown += `| Package | Version | Path | Private |\n`;
      markdown += `|---------|---------|------|--------|\n`;
      stats.packages.forEach((pkg: WorkspacePackage) => {
        markdown += `| ${pkg.name} | ${pkg.version || 'N/A'} | ${pkg.path} | ${pkg.private ? 'Yes' : 'No'} |\n`;
      });
      markdown += `\n`;
    }

    if (stats.fileBatches && stats.fileBatches.size > 0) {
      markdown += `## Processing Details\n\n`;
      for (const [batchKey, batch] of stats.fileBatches.entries()) {
        markdown += `### Batch: ${batchKey}\n`;
        markdown += `- Package: ${batch.packageName || 'unknown'}\n`;
        markdown += `- Files: ${batch.files.length}\n`;
        markdown += `- Total Tokens: ${batch.totalTokens || batch.estimatedTokens}\n`;
        markdown += `- Processing Time: ${batch.processingTimeMs || 0}ms\n`;
        if (batch.errors && batch.errors.length > 0) {
          markdown += `- Errors: ${batch.errors.length}\n`;
        }
        markdown += `\n`;
      }
    }

    const reportPath = path.join(absoluteReportDir, 'jsdoc-generation-summary.md');
    await this.writeFile(reportPath, markdown);
    logger.info(`✨ Markdown summary generated at: ${path.relative(this.baseDir, reportPath)}`);
    return reportPath;
  }

  /**
   * Generates a performance report in JSON format.
   * @param metrics The performance metrics to report.
   * @param outputDir The directory to write the report to.
   * @returns The path of the generated report.
   */
  public async generatePerformanceReportJSON(
    metrics: PerformanceMetrics,
    outputDir: string,
  ): Promise<string> {
    const absoluteOutputDir = path.resolve(this.baseDir, outputDir);
    await fs.mkdir(absoluteOutputDir, { recursive: true });

    const reportPath = path.join(absoluteOutputDir, 'performance-report.json');
    await this.writeFile(reportPath, JSON.stringify(metrics, null, 2));

    logger.info(`📈 Performance JSON report generated: ${path.relative(this.baseDir, reportPath)}`);
    return reportPath;
  }

  /**
   * Generates a performance report in Markdown format for human readability.
   * @param metrics The performance metrics to report.
   * @param outputDir The directory to write the report to.
   * @returns The path of the generated report.
   */
  public async generatePerformanceReportMarkdown(
    metrics: PerformanceMetrics,
    outputDir: string,
  ): Promise<string> {
    const timers = metrics.timers || {};
    const counters = metrics.counters || {};
    const gauges = metrics.gauges || {};
    const metadata = metrics.metadata || { startTime: 0, endTime: 0, duration: 0 };

    let markdown = `# Performance Report\n\n`;
    markdown += `Generated on: ${new Date().toISOString()}\n\n`;
    markdown += `## Overview\n\n`;
    markdown += `- **Total Duration**: ${metadata.duration.toFixed(2)}ms\n`;
    markdown += `- **Start Time**: ${new Date(metadata.startTime).toISOString()}\n`;
    markdown += `- **End Time**: ${new Date(metadata.endTime).toISOString()}\n\n`;

    if (Object.keys(timers).length > 0) {
      markdown += `## Timers\n\n`;
      markdown += `| Operation | Count | Total (ms) | Avg (ms) | Min (ms) | Max (ms) | P95 (ms) | P99 (ms) |\n`;
      markdown += `|-----------|-------|------------|----------|----------|----------|----------|----------|\n`;

      for (const [name, timer] of Object.entries(timers)) {
        markdown += `| ${name} | ${timer.count} | ${timer.total.toFixed(2)} | ${timer.avg.toFixed(2)} | ${timer.min.toFixed(2)} | ${timer.max.toFixed(2)} | ${timer.p95?.toFixed(2) || 'N/A'} | ${timer.p99?.toFixed(2) || 'N/A'} |\n`;
      }
      markdown += `\n`;
    }

    if (Object.keys(counters).length > 0) {
      markdown += `## Counters\n\n`;
      markdown += `| Metric | Count |\n`;
      markdown += `|--------|-------|\n`;
      for (const [name, count] of Object.entries(counters)) {
        markdown += `| ${name} | ${count} |\n`;
      }
      markdown += `\n`;
    }

    if (Object.keys(gauges).length > 0) {
      markdown += `## Gauges\n\n`;
      markdown += `| Metric | Value |\n`;
      markdown += `|--------|-------|\n`;
      for (const [name, value] of Object.entries(gauges)) {
        markdown += `| ${name} | ${value.toFixed(2)} |\n`;
      }
      markdown += `\n`;
    }

    // Detailed timing breakdowns
    markdown += `## Detailed Timing Analysis\n\n`;
    const significantTimers = Object.entries(timers)
      .filter(([_, timer]) => timer.total > 100) // Only show operations taking > 100ms total
      .sort((a, b) => b[1].total - a[1].total);

    if (significantTimers.length > 0) {
      markdown += `### Most Time-Consuming Operations\n\n`;
      for (const [name, timer] of significantTimers) {
        const percentage = (timer.total / metadata.duration) * 100;
        markdown += `- **${name}**: ${timer.total.toFixed(2)}ms (${percentage.toFixed(1)}% of total)\n`;
      }
    }

    const reportPath = path.join(outputDir, 'performance-report.md');
    await this.writeFile(reportPath, markdown);

    logger.info(
      `⚡ Performance Markdown report saved to: ${path.relative(this.baseDir, reportPath)}`,
    );
    return reportPath;
  }
}
