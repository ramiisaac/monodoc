import path from 'path';
import fs from 'fs/promises';
import { ProcessingStats } from '../types';
import { logger } from '../utils/logger';
import { writeFile } from '../utils/fileUtils';
import { GeneratorError } from '../utils/errorHandling';

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
  custom: Record<string, any>;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
    arrayBuffers: number;
  };
  summary: { totalTimers: number; totalCustomMetrics: number; timestamp: string };
}

/**
 * Manages the generation of various reports (JSON, Markdown, Quality, Performance).
 * It writes these reports to the file system in a structured manner.
 */
export class ReportGenerator {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Generates a detailed JSON report of the documentation generation process.
   * This report includes all processing statistics and configuration used.
   * @param stats The final ProcessingStats object.
   * @param reportFileName The name of the JSON report file (e.g., 'jsdoc-report.json').
   * @param reportDir The directory where the report should be saved (relative to baseDir).
   * @returns A Promise that resolves when the report is written.
   * @throws GeneratorError if writing the report fails.
   */
  async generateJsonReport(
    stats: ProcessingStats,
    reportFileName: string,
    reportDir: string,
  ): Promise<void> {
    const absoluteReportDir = path.resolve(this.baseDir, reportDir);
    const reportPath = path.join(absoluteReportDir, reportFileName);

    try {
      // Ensure duration is set if not already
      const finalStats = {
        ...stats,
        durationSeconds:
          stats.durationSeconds ||
          parseFloat(((performance.now() - stats.startTime) / 1000).toFixed(2)),
        summary: {
          processedFiles: stats.processedFiles,
          modifiedFiles: stats.modifiedFiles,
          successfulJsdocs: stats.successfulJsdocs,
          skippedJsdocs: stats.skippedJsdocs,
          failedJsdocs: stats.failedJsdocs,
          embeddingSuccesses: stats.embeddingSuccesses,
          embeddingFailures: stats.embeddingFailures,
          totalRelationshipsDiscovered: stats.totalRelationshipsDiscovered,
          totalErrors: stats.errors.length,
          executionTime: `${stats.durationSeconds?.toFixed(2) || 'N/A'}s`,
          dryRun: stats.dryRun,
        },
        // Remove startTime from final JSON output as it's computed into duration
        startTime: undefined,
      };

      await writeFile(reportPath, JSON.stringify(finalStats, null, 2));
      logger.success(
        `📈 JSON report generated successfully at: ${path.relative(this.baseDir, reportPath)}`,
      );
    } catch (error) {
      throw new GeneratorError(
        `Failed to generate JSON report at ${reportPath}: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  /**
   * Generates a concise Markdown summary of the documentation generation process.
   * @param stats The final ProcessingStats object.
   * @param reportFileName The name of the Markdown summary file (e.g., 'jsdoc-summary.md').
   * @param reportDir The directory where the report should be saved.
   * @returns A Promise that resolves when the report is written.
   */
  async generateMarkdownSummary(
    stats: ProcessingStats,
    reportFileName: string,
    reportDir: string,
  ): Promise<void> {
    const absoluteReportDir = path.resolve(this.baseDir, reportDir);
    const reportPath = path.join(absoluteReportDir, reportFileName);
    const dryRunStatus = stats.dryRun ? ' (DRY RUN - No files modified)' : '';

    const errorsSection =
      stats.errors.length > 0
        ? `
### ❌ Errors Encountered (${stats.errors.length})
${stats.errors.map((err) => `- **File:** \`${err.file}\`${err.nodeName ? ` - **Node:** \`${err.nodeName}\`` : ''}\n  - **Error:** ${err.error}`).join('\n')}
`
        : '';

    const content = `
# Monorepo JSDoc Generation Report${dryRunStatus}

## Summary
*   **Total Packages Discovered:** ${stats.totalPackages}
*   **Total Files Scanned:** ${stats.totalFiles}
*   **Files Processed for JSDoc:** ${stats.processedFiles}
*   **Files Modified on Disk:** ${stats.modifiedFiles}
*   **Total JSDocable Nodes Considered:** ${stats.totalNodesConsidered}
*   **JSDocs Successfully Generated/Updated:** ${stats.successfulJsdocs}
*   **JSDocs Skipped (Existing/Config/AI-skipped):** ${stats.skippedJsdocs}
*   **JSDocs Failed (AI/Processing Errors):** ${stats.failedJsdocs}
*   **Embedding Successes:** ${stats.embeddingSuccesses}
*   **Embedding Failures:** ${stats.embeddingFailures}
*   **Total Relationships Discovered (via Embeddings):** ${stats.totalRelationshipsDiscovered}
*   **Total Execution Time:** ${stats.durationSeconds?.toFixed(2) || 'N/A'} seconds

${errorsSection}

## Configuration Snapshot
\`\`\`json
${JSON.stringify(stats.configurationUsed, null, 2)}
\`\`\`

---
_Report generated by Monorepo JSDoc Generator on ${new Date().toLocaleString()}_
`;

    try {
      await writeFile(reportPath, content);
      logger.info(`✨ Markdown summary generated at: ${path.relative(this.baseDir, reportPath)}`);
    } catch (error) {
      logger.error(
        `❌ Failed to generate Markdown summary at ${reportPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Generates a performance analysis report in both JSON and Markdown formats.
   * @param metrics The PerformanceMetrics object.
   * @param outputDir The directory where the reports should be saved.
   * @returns A Promise that resolves when the reports are written.
   */
  async generatePerformanceReport(metrics: PerformanceMetrics, outputDir: string): Promise<void> {
    const absoluteOutputDir = path.resolve(this.baseDir, outputDir);
    await fs.mkdir(absoluteOutputDir, { recursive: true }); // Ensure dir exists

    // JSON Report
    const jsonReportPath = path.join(absoluteOutputDir, 'performance-report.json');
    const performanceReportJson = {
      timestamp: new Date().toISOString(),
      metrics: metrics,
    };
    await writeFile(jsonReportPath, JSON.stringify(performanceReportJson, null, 2));
    logger.info(
      `📈 Performance JSON report generated: ${path.relative(this.baseDir, jsonReportPath)}`,
    );

    // Markdown Report
    const markdownReportPath = path.join(absoluteOutputDir, 'performance-analysis.md');
    // Calculate overall stats for recommendations
    const totalDurationMs = metrics.timers['total_generation']?.total || 0;
    const totalFilesProcessed = metrics.custom['files_processed']?.latest || 0; // Assuming a custom metric tracks this
    const averageProcessingTimePerFile =
      totalFilesProcessed > 0 ? totalDurationMs / totalFilesProcessed : 0;

    const cacheHitsTotal = metrics.custom['cache_hits']?.total || 0;
    const cacheMissesTotal = metrics.custom['cache_misses']?.total || 0;
    const totalCacheAccesses = cacheHitsTotal + cacheMissesTotal;
    const cacheHitRate = totalCacheAccesses > 0 ? cacheHitsTotal / totalCacheAccesses : 0;

    const apiCalls = metrics.custom['api_calls']?.total || 0;
    const errorsEncountered = metrics.custom['errors_encountered']?.total || 0;
    const errorRate = apiCalls > 0 ? errorsEncountered / apiCalls : 0;

    const throughput = totalDurationMs > 0 ? totalFilesProcessed / (totalDurationMs / 1000) : 0;

    const recommendations: string[] = [];
    if (errorRate > 0.05) {
      recommendations.push(
        '- High error rate detected. Investigate LLM response errors and API key issues.',
      );
    }
    if (cacheHitRate < 0.7 && totalCacheAccesses > 0) {
      recommendations.push(
        '- Low cache hit rate. Review caching strategy and ensure content hash invalidation is working.',
      );
    }
    if (throughput < 1 && totalFilesProcessed > 0) {
      recommendations.push(
        '- Low throughput. Consider increasing `maxConcurrentFiles` and `aiClientConfig.maxConcurrentRequests` if resources allow.',
      );
    }
    if (metrics.memory.heapUsed > 400) {
      // If heap usage exceeds 400MB
      recommendations.push(
        '- High memory usage detected. Optimize batch sizes (`aiClientConfig.maxTokensPerBatch`, `embeddingConfig.embeddingBatchSize`) and review code for potential leaks.',
      );
    }
    if (recommendations.length === 0) {
      recommendations.push('- Performance is optimal based on current metrics. Keep monitoring!');
    }

    const markdownReport = `# ⚡ Performance Analysis Report
Generated: ${new Date().toISOString()}

## 🚀 Key Performance Indicators
- **Total Processing Time**: ${(totalDurationMs / 1000).toFixed(2)}s
- **Files Processed**: ${totalFilesProcessed}
- **Average Time per File**: ${averageProcessingTimePerFile.toFixed(2)}ms
- **Throughput**: ${throughput.toFixed(2)} files/sec
- **Cache Hit Rate**: ${(cacheHitRate * 100).toFixed(1)}%
- **AI API Calls Made**: ${apiCalls}
- **AI API Error Rate**: ${(errorRate * 100).toFixed(2)}%

## 💾 Resource Usage (Latest)
- **Heap Used**: ${metrics.memory.heapUsed}MB
- **Heap Total**: ${metrics.memory.heapTotal}MB
- **RSS (Resident Set Size)**: ${metrics.memory.rss}MB
- **External Memory**: ${metrics.memory.external}MB

## ⏱️ Detailed Timer Metrics
${Object.entries(metrics.timers)
  .map(
    ([name, stats]) => `
- **${name}**:
  - Avg: ${stats.avg.toFixed(2)}ms, Min: ${stats.min.toFixed(2)}ms, Max: ${stats.max.toFixed(2)}ms
  - Total: ${stats.total.toFixed(2)}ms, Count: ${stats.count}
  - P95: ${stats.p95?.toFixed(2) || 'N/A'}ms, P99: ${stats.p99?.toFixed(2) || 'N/A'}ms
`,
  )
  .join('')}

## 💡 Optimization Recommendations
${recommendations.map((rec) => `- ${rec}`).join('\n')}

---
*Generated by JSDoc AI Performance Monitor*
`;
    await writeFile(markdownReportPath, markdownReport);
    logger.info(
      `⚡ Performance Markdown report saved to: ${path.relative(this.baseDir, markdownReportPath)}`,
    );
  }

  /**
   * Generates a quality analysis report in both JSON and Markdown formats.
   * @param qualityData The quality metrics data. This should contain `overallScore`, `qualityMetrics`, `totalNodesAnalyzed`, `successfulJsdocs`, and `recommendations`. It can also have `detailedReportItems`.
   * @param outputDir The directory where the reports should be saved.
   * @returns A Promise that resolves when the reports are written.
   */
  async generateQualityReport(qualityData: any, outputDir: string): Promise<void> {
    logger.info('📊 Generating quality analysis report...');
    const absoluteOutputDir = path.resolve(this.baseDir, outputDir);
    await fs.mkdir(absoluteOutputDir, { recursive: true }); // Ensure dir exists

    // JSON Report
    const jsonReportPath = path.join(absoluteOutputDir, 'quality-analysis.json');
    const qualityReportJson = {
      timestamp: new Date().toISOString(),
      overallScore: qualityData.overallScore,
      metrics: qualityData.qualityMetrics,
      totalNodesAnalyzed: qualityData.totalNodesAnalyzed,
      successfulJsdocs: qualityData.successfulJsdocs,
      recommendations: qualityData.recommendations,
      detailedReportItems: qualityData.detailedReportItems || [], // Include detailed items if provided
    };
    await writeFile(jsonReportPath, JSON.stringify(qualityReportJson, null, 2));
    logger.info(`📊 Quality JSON report generated: ${path.relative(this.baseDir, jsonReportPath)}`);

    // Markdown Report
    const markdownReportPath = path.join(absoluteOutputDir, 'quality-analysis.md');
    const markdownReport = `# 📊 JSDoc Quality Analysis Report
Generated: ${new Date().toISOString()}

## Overall Score: ${qualityData.overallScore.toFixed(1)}/100

## 📈 Quality Metrics
- **Completeness**: ${qualityData.qualityMetrics.completeness.toFixed(1)}%
- **Consistency**: ${qualityData.qualityMetrics.consistency.toFixed(1)}%
- **Example Quality**: ${qualityData.qualityMetrics.exampleQuality.toFixed(1)}%

## 📋 Statistics
- **Total Nodes Analyzed**: ${qualityData.totalNodesAnalyzed}
- **Nodes with JSDoc**: ${qualityData.successfulJsdocs}
- **Documentation Coverage**: ${((qualityData.successfulJsdocs / qualityData.totalNodesAnalyzed) * 100).toFixed(1)}%

## 💡 Recommendations
${qualityData.recommendations.map((rec: string) => `- ${rec}`).join('\n')}

${
  qualityData.detailedReportItems && qualityData.detailedReportItems.length > 0
    ? `
## Detailed Issues
${qualityData.detailedReportItems
  .map(
    (item: any) => `
### \`${item.node}\` (${item.nodeKind}) in \`${item.file}\` - Score: ${item.score.toFixed(1)}/100
- **Issues**: ${item.issues.join('; ')}
- **Suggestions**: ${item.suggestions.join('; ')}
`,
  )
  .join('')}`
    : ''
}

---
*Generated by JSDoc AI Quality Analyzer*
`;
    await writeFile(markdownReportPath, markdownReport);
    logger.info(
      `📊 Quality Markdown report saved to: ${path.relative(this.baseDir, markdownReportPath)}`,
    );
  }

  /**
   * Helper method to write files, creating directories recursively.
   * This is a utility function, essentially a wrapper around `fileUtils.writeFile`.
   * @param filePath The path to the file.
   * @param content The content to write.
   */
  public async writeFile(filePath: string, content: string): Promise<void> {
    await writeFile(filePath, content);
  }
}
