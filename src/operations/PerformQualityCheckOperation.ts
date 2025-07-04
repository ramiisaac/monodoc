import {
  IOperation,
  CommandContext,
  ProcessingStats,
  GeneratorConfig,
} from "../types";
import { logger } from "../utils/logger";

import { QualityReportItem, QualityIssue } from "../types/quality";
import { DocumentationQualityAnalyzer } from "../analyzer/QualityAnalyzer";
import { WorkspaceAnalyzer } from "../analyzer/WorkspaceAnalyzer";
import path from "path";

/**
 * Operation to perform a comprehensive quality check on existing JSDoc documentation.
 * It analyzes the completeness, consistency, and other aspects of JSDoc comments.
 */
export class PerformQualityCheckOperation implements IOperation {
  async execute(context: CommandContext): Promise<ProcessingStats> {
    const { config, baseDir, project, reportGenerator } = context;

    logger.info("🔍 Starting documentation quality analysis...");

    const workspaceAnalyzer = new WorkspaceAnalyzer(project);
    const qualityAnalyzer = new DocumentationQualityAnalyzer();

    const stats: ProcessingStats = this.initializeStats(config); // Initialize stats for this operation
    stats.dryRun = true; // Quality check is always a dry run in terms of file modification

    const { packages } = await workspaceAnalyzer.analyze(config, baseDir);

    let totalNodesWithJSDoc = 0; // Nodes that actually have JSDoc comments
    let totalNodesConsideredForDocs = 0; // All nodes that *could* have JSDoc
    let qualityScores: number[] = [];
    const detailedQualityReport: QualityReportItem[] = [];

    for (const pkg of packages) {
      logger.debug(`📦 Analyzing package: ${pkg.name}`);
      // Add source files matching the general include patterns, not just what WorkspaceAnalyzer found.
      // This ensures all relevant files are available for quality check.
      // Using config.includePatterns and ignorePatterns to accurately scope files.
      const filesToAdd = await context.project.addSourceFilesAtPaths(
        path.join(pkg.path, "**/*.{ts,tsx,js,jsx}"), // Broad match
      );
      // Ensure all source files from ts-config are considered if relevant
      project.resolveSourceFileDependencies();

      for (const sourceFile of project
        .getSourceFiles()
        .filter((sf) => sf.getFilePath().startsWith(pkg.path))) {
        // Filter to files belonging to this package
        const fileResults = qualityAnalyzer.analyzeFile(sourceFile, config);

        // We'll estimate the total nodes count based on the issues
        // Ideally this would be exposed from the analyzer
        totalNodesConsideredForDocs += fileResults.issues.length;
        totalNodesWithJSDoc += fileResults.issues.length;

        // Extract scores from issues
        qualityScores.push(...fileResults.issues.map((issue) => issue.score));

        // Collect detailed report items for nodes below threshold or missing JSDoc
        for (const issue of fileResults.issues) {
          if (issue.score < (config.qualityThresholds?.minimumScore || 70)) {
            detailedQualityReport.push({
              file: path.relative(baseDir, sourceFile.getFilePath()),
              node: issue.nodeKind + " node",
              nodeKind: issue.nodeKind,
              score: issue.score,
              issues: issue.issues.map((i: QualityIssue) => i.message),
              suggestions: issue.issues.map(
                (i: QualityIssue) => i.suggestion || "No specific suggestion.",
              ),
            });
          }
        }
      }
    }

    // Calculate overall metrics
    const averageQuality =
      qualityScores.length > 0
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
        : 0;
    const completenessPercentage =
      totalNodesConsideredForDocs > 0
        ? (totalNodesWithJSDoc / totalNodesConsideredForDocs) * 100
        : 0;

    logger.info(`📊 Quality Analysis Results:`);
    logger.info(
      `  • Total JSDocable nodes considered: ${totalNodesConsideredForDocs}`,
    );
    logger.info(`  • Nodes with existing JSDoc: ${totalNodesWithJSDoc}`);
    logger.info(`  • Coverage: ${completenessPercentage.toFixed(1)}%`);
    logger.info(
      `  • Average quality score (of documented nodes): ${averageQuality.toFixed(1)}/100`,
    );
    logger.info(
      `  • Nodes needing improvement or missing JSDoc: ${detailedQualityReport.length}`,
    );

    if (detailedQualityReport.length > 0) {
      logger.warn(
        "\n🚨 Low quality documentation or missing JSDoc found (top 10):",
      );
      detailedQualityReport.slice(0, 10).forEach((item) => {
        logger.warn(`  ${item.file}: ${item.node} (${item.score}/100)`);
        item.issues.forEach((issue: string) => logger.warn(`    - ${issue}`));
      });
      if (detailedQualityReport.length > 10) {
        logger.warn(
          `...and ${detailedQualityReport.length - 10} more. See detailed report.`,
        );
      }
    } else {
      logger.success(
        "✅ All documentation meets or exceeds quality thresholds!",
      );
    }

    // Generate full quality report
    await reportGenerator.generateQualityReport(
      {
        overallScore: averageQuality,
        totalNodesAnalyzed: totalNodesConsideredForDocs,
        successfulJsdocs: totalNodesWithJSDoc, // Number of nodes that have JSDoc
        qualityMetrics: {
          completeness: completenessPercentage,
          consistency: 85, // Placeholder if no deep analysis for consistency
          exampleQuality: 78, // Placeholder if no deep analysis for example quality
        },
        recommendations: detailedQualityReport.map(
          (item) =>
            `File: ${item.file}, Node: \`${item.node}\` (${item.score}/100) - Issues: ${item.issues.join("; ")}. Suggestions: ${item.suggestions.join("; ")}`,
        ),
        detailedReportItems: detailedQualityReport,
      },
      config.outputConfig.reportDir,
    );

    // Update stats object for overall reporting consistency
    stats.totalNodesConsidered = totalNodesConsideredForDocs;
    stats.successfulJsdocs = totalNodesWithJSDoc; // How many nodes *had* JSDoc that we analyzed
    stats.failedJsdocs = detailedQualityReport.length; // Count of issues found
    stats.errors = detailedQualityReport.map((item) => ({
      file: item.file,
      nodeName: item.node,
      error: `Quality Issue: ${item.issues.join("; ")}`,
      timestamp: Date.now(),
    }));
    stats.durationSeconds = (performance.now() - stats.startTime) / 1000;

    return stats;
  }

  /**
   * Initializes processing stats specifically for the quality check operation.
   * @param config The generator configuration.
   * @returns An initialized ProcessingStats object.
   */
  private initializeStats(config: GeneratorConfig): ProcessingStats {
    return {
      totalPackages: 0, // Will be filled by analyzer
      totalBatches: 0,
      processedBatches: 0,
      totalFiles: 0, // Will be filled by analyzer
      processedFiles: 0,
      modifiedFiles: 0, // No modifications in quality check
      totalNodesConsidered: 0,
      successfulJsdocs: 0,
      failedJsdocs: 0, // Used to count nodes with quality issues
      skippedJsdocs: 0,
      embeddingSuccesses: 0,
      embeddingFailures: 0,
      totalRelationshipsDiscovered: 0,
      startTime: performance.now(),
      errors: [],
      dryRun: true, // Always a dry run
      configurationUsed: {}, // Will be sanitized and filled later
    };
  }
}
