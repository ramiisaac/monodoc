import { Project, SourceFile } from "ts-morph";
import path from "path";
import { logger } from "../utils/logger";
import {
  GeneratorConfig,
  NodeContext,
  JSDocableNode,
  ProcessingStats,
} from "../types";
import { NodeContextExtractor } from "./NodeContextExtractor";
import { JSDocManipulator } from "./JSDocManipulator";
import { DocumentationGenerator } from "./DocumentationGenerator";
import { RelationshipAnalyzer } from "../embeddings/RelationshipAnalyzer";
import { TransformationError, LLMError } from "../utils/errorHandling";
import { PluginManager } from "../plugins/PluginManager";
import { AIClient } from "./AIClient";
import { PerformanceMonitor } from "../utils/PerformanceMonitor";
import { DynamicTemplateSystem } from "../features/DynamicTemplateSystem";

/**
 * Responsible for processing a single source file within the monorepo.
 * It orchestrates the extraction of node contexts, generation of JSDoc,
 * and application of changes for all JSDocable nodes within that file.
 */
export class FileProcessor {
  private config: GeneratorConfig = {} as GeneratorConfig; // Default init
  private nodeContextExtractor: NodeContextExtractor;
  private jsdocManipulator: JSDocManipulator;
  private documentationGenerator: DocumentationGenerator;
  private baseDir: string = process.cwd(); // Default init
  private project: Project = new Project(); // Default init
  private pluginManager: PluginManager; // Injected PluginManager

  constructor(
    private aiClient: AIClient,
    nodeContextExtractor: NodeContextExtractor,
    jsdocManipulator: JSDocManipulator,
    documentationGenerator: DocumentationGenerator,
    private performanceMonitor: PerformanceMonitor,
    pluginManager: PluginManager,
    private relationshipAnalyzer: RelationshipAnalyzer,
    private dynamicTemplateSystem: DynamicTemplateSystem,
  ) {
    this.nodeContextExtractor = nodeContextExtractor;
    this.jsdocManipulator = jsdocManipulator;
    this.documentationGenerator = documentationGenerator;
    this.pluginManager = pluginManager;
  }

  /**
   * Processes a single source file to generate and apply JSDoc comments.
   * This method identifies JSDocable nodes, fetches their context, generates JSDoc,
   * applies plugin transformations, and saves the file.
   * @param filePath The absolute path to the file to process.
   * @param stats The ProcessingStats object to update.
   * @returns A Promise that resolves when the file processing is complete.
   */
  async processFile(filePath: string, stats: ProcessingStats): Promise<void> {
    const relativePath = path.relative(this.baseDir, filePath);
    logger.debug(`  📄 Processing file: ${relativePath}`);

    let sourceFile: SourceFile;
    try {
      sourceFile = this.project.getSourceFileOrThrow(filePath);
    } catch (error) {
      logger.error(
        `    ❌ File not found in ts-morph project during processing: ${relativePath}. Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      stats.errors.push({
        file: relativePath,
        error: `File not found in ts-morph program: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });
      return; // Stop processing this file if it cannot be found
    }

    let jsdocsAppliedCount = 0;
    // Collect JSDocable nodes from the source file based on configuration
    const nodes = this.nodeContextExtractor.collectJSDocableNodes(sourceFile);
    stats.totalNodesConsidered += nodes.length; // Count all nodes considered for docs in this file

    for (const node of nodes) {
      const nodeNameForLog =
        this.nodeContextExtractor.getNodeNameForLogging(node);
      logger.trace(
        `    Considering node: ${nodeNameForLog} (${node.getKindName()}) in ${relativePath}`,
      );

      let nodeContext: NodeContext | undefined; // Declare outside try-catch to be accessible in catch
      try {
        // Check for existing JSDoc and apply skip/overwrite/merge logic
        if (
          this.hasExistingJSDoc(node) &&
          !this.config.forceOverwrite &&
          !this.config.jsdocConfig.overwriteExisting &&
          !(
            this.config.jsdocConfig.mergeExisting &&
            !this.config.noMergeExisting
          )
        ) {
          stats.skippedJsdocs++;
          logger.debug(
            `    Skipping node with existing JSDoc (due to config/flags): ${nodeNameForLog} in ${relativePath}`,
          );
          continue; // Skip to next node
        }

        // 1. Extract Node Context
        nodeContext = this.nodeContextExtractor.getEnhancedNodeContext(
          node,
          sourceFile,
        );

        // 2. Run 'beforeProcessing' plugins
        nodeContext = await this.pluginManager.runBeforeProcessing(nodeContext);

        // 3. Include related symbols if embeddings are enabled and configured
        if (
          this.config.embeddingConfig.enabled &&
          this.config.jsdocConfig.includeRelatedSymbols &&
          !this.config.disableEmbeddings
        ) {
          const relatedSymbols =
            this.relationshipAnalyzer.findRelatedSymbolsForNode(node, stats);
          if (relatedSymbols.length > 0) {
            nodeContext.relatedSymbols = relatedSymbols;
            logger.debug(
              `      Found ${relatedSymbols.length} related symbols for ${nodeNameForLog}`,
            );
          }
        }

        // 4. Generate JSDoc using the DocumentationGenerator
        const aiResponse = await this.documentationGenerator.generate(
          nodeContext,
          this.config,
        );

        // 5. Process AI Response and apply JSDoc
        if (aiResponse.status === "success" && aiResponse.jsdocContent) {
          let finalJsdocContent = aiResponse.jsdocContent;

          // 6. Run 'afterProcessing' plugins
          finalJsdocContent = await this.pluginManager.runAfterProcessing(
            nodeContext,
            finalJsdocContent,
          );

          // 7. Apply JSDoc using the JSDocManipulator
          if (this.jsdocManipulator.applyJSDoc(node, finalJsdocContent)) {
            jsdocsAppliedCount++;
            stats.successfulJsdocs++;
          } else {
            stats.skippedJsdocs++; // Skipped by manipulator (e.g., too short, identical)
          }
        } else if (aiResponse.status === "skip") {
          stats.skippedJsdocs++;
          logger.info(
            `    ℹ️  JSDoc generation skipped by AI for ${nodeNameForLog} in ${relativePath}: ${aiResponse.reason || "AI decided to skip"}`,
          );
        } else {
          stats.failedJsdocs++;
          logger.warn(
            `    ⚠️  JSDoc generation failed for ${nodeNameForLog} in ${relativePath}: ${aiResponse.reason || "Unknown AI reason"}`,
          );
          stats.errors.push({
            file: relativePath,
            nodeName: nodeNameForLog,
            error: `AI generation failed/skipped: ${aiResponse.reason || "Unknown reason"}`,
            timestamp: Date.now(),
          });
          // Notify plugins about the LLM error
          await this.pluginManager.onError(
            new LLMError(
              `AI generation failed`,
              undefined,
              aiResponse.reason || "UNKNOWN",
              new Error(aiResponse.reason || "AI generation failed"),
            ),
            nodeContext,
          );
        }
      } catch (error) {
        stats.failedJsdocs++;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          `    ❌ Unexpected error processing node ${nodeNameForLog} in ${relativePath}: ${errorMessage}`,
        );
        stats.errors.push({
          file: relativePath,
          nodeName: nodeNameForLog,
          error: `Node processing error: ${errorMessage}`,
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: Date.now(),
        });
        // Notify plugins about any unexpected error during node processing
        await this.pluginManager.onError(
          error instanceof Error ? error : new Error(errorMessage),
          nodeContext,
        );
      }
    }

    // Save the file if any JSDoc was applied and not in dry-run mode
    if (jsdocsAppliedCount > 0) {
      if (!this.config.dryRun) {
        try {
          await sourceFile.save();
          stats.modifiedFiles++;
          logger.success(
            `    ✅ Applied ${jsdocsAppliedCount} JSDoc comment(s) in ${relativePath}`,
          );
        } catch (saveError) {
          const errMsg = `Failed to save file ${relativePath}: ${saveError instanceof Error ? saveError.message : String(saveError)}`;
          logger.error(`    ❌ ${errMsg}`);
          stats.errors.push({
            file: relativePath,
            error: errMsg,
            stack: saveError instanceof Error ? saveError.stack : undefined,
            timestamp: Date.now(),
          });
          // Re-throw critical save errors to be caught at a higher level (GenerateDocumentationOperation)
          throw new TransformationError(
            errMsg,
            relativePath,
            undefined,
            saveError,
          );
        }
      } else {
        logger.info(
          `    Would apply ${jsdocsAppliedCount} JSDoc comment(s) in ${relativePath} (Dry Run)`,
        );
      }
    } else {
      logger.debug(
        `    No new/updated JSDoc comments applied in ${relativePath}`,
      );
    }
  }

  /**
   * Checks if a node already has existing JSDoc comments.
   * @param node The node to check.
   * @returns True if the node has JSDoc, false otherwise.
   */
  private hasExistingJSDoc(node: JSDocableNode): boolean {
    return node.getJsDocs().length > 0;
  }
}
