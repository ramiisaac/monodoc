import { Project, SourceFile, JSDocableNode, Node } from 'ts-morph';
import {
  GeneratorConfig,
  WorkspacePackage,
  ProcessingStats,
  RelatedSymbol,
  NodeContext,
} from '../types';
import { logger } from '../utils/logger';
import { EmbeddingGenerator } from './EmbeddingGenerator';
import { InMemoryVectorStore } from './InMemoryVectorStore';
import { EmbeddingError } from '../utils/errorHandling';
import { NodeContextExtractor } from '../generator/NodeContextExtractor';

/**
 * Analyzes relationships between code symbols using embeddings.
 * It orchestrates embedding generation and similarity search to find related code elements.
 */
export class RelationshipAnalyzer {
  private readonly config: GeneratorConfig;
  private readonly embeddingGenerator: EmbeddingGenerator;
  private readonly vectorStore: InMemoryVectorStore;
  private readonly nodeContextExtractor: NodeContextExtractor;
  private readonly allJSDocableNodesForEmbeddings: JSDocableNode[] = [];
  private readonly sourceFileMap: Map<string, SourceFile> = new Map();
  private readonly baseDir: string;
  private isInitializedSuccessfully: boolean = false;
  private packages: WorkspacePackage[]; // Added to update if packages change

  constructor(
    project: Project, // ts-morph project instance
    config: GeneratorConfig,
    packages: WorkspacePackage[], // Initial packages
    baseDir: string,
    nodeContextExtractor: NodeContextExtractor, // Injected NodeContextExtractor
    aiClient: any, // Injected AIClient
  ) {
    this.config = config;
    this.baseDir = baseDir;
    this.packages = packages; // Store initial packages
    this.nodeContextExtractor = nodeContextExtractor; // Assign injected extractor
    this.embeddingGenerator = new EmbeddingGenerator(
      aiClient as any, // Type assertion to resolve compatibility issue
      config,
      baseDir,
      nodeContextExtractor,
    ); // Pass NodeContextExtractor to EmbeddingGenerator
    this.vectorStore = new InMemoryVectorStore();
  }

  /**
   * Updates the list of packages. This is crucial if packages are discovered dynamically
   * after initial setup, or if the analyzer is reused.
   * @param newPackages The updated list of workspace packages.
   */
  public updatePackages(newPackages: WorkspacePackage[]): void {
    this.packages = newPackages;
    // Also ensure NodeContextExtractor is updated if it has its own package list
    this.nodeContextExtractor.updatePackages(newPackages);
  }

  /**
   * Initializes the relationship analysis by generating and storing embeddings for all relevant nodes.
   * This should be called once at the beginning of the generation process.
   * @param allSourceFiles All source files from the ts-morph project.
   * @param stats The processing statistics object to update.
   */
  async initialize(allSourceFiles: SourceFile[], stats: ProcessingStats): Promise<void> {
    if (!this.isEmbeddingEnabled()) {
      logger.info(
        '🧠 Embedding-based relationship analysis is disabled by configuration or CLI flag. Skipping embedding generation.',
      );
      this.isInitializedSuccessfully = false;
      return;
    }

    logger.info('🧠 Initializing embedding-based relationship analysis...');
    this.collectJSDocableNodes(allSourceFiles);
    logger.info(
      `Found ${this.allJSDocableNodesForEmbeddings.length} JSDocable nodes across the project for embedding.`,
    );

    try {
      await this.generateAndStoreEmbeddings(stats);
      this.isInitializedSuccessfully = true;
    } catch (e) {
      this.handleEmbeddingError(e, stats);
      this.isInitializedSuccessfully = false;
    }
  }

  /**
   * Checks if embedding functionality is currently enabled based on config and CLI flags.
   * @returns True if embeddings are enabled, false otherwise.
   */
  private isEmbeddingEnabled(): boolean {
    return this.config.embeddingConfig.enabled && !this.config.disableEmbeddings;
  }

  /**
   * Collects all JSDocable nodes from the given source files and stores them for embedding.
   * @param allSourceFiles An array of ts-morph SourceFile objects.
   */
  private collectJSDocableNodes(allSourceFiles: SourceFile[]): void {
    for (const sourceFile of allSourceFiles) {
      this.sourceFileMap.set(sourceFile.getFilePath(), sourceFile);
      // Use the injected nodeContextExtractor to collect nodes, ensuring consistency
      const nodesInFile = this.nodeContextExtractor.collectJSDocableNodes(sourceFile);
      // Type assertion to resolve compatibility issue with JSDocableNode from ts-morph vs our defined type
      this.allJSDocableNodesForEmbeddings.push(...(nodesInFile as any[]));
    }
  }

  /**
   * Generates embeddings for all collected JSDocable nodes and adds them to the vector store.
   * Also updates the `NodeContextExtractor` with these embeddings.
   * @param stats The processing statistics object to update.
   */
  private async generateAndStoreEmbeddings(stats: ProcessingStats): Promise<void> {
    const embeddedNodes = await this.embeddingGenerator.generateEmbeddings(
      this.allJSDocableNodesForEmbeddings as any[],
      this.sourceFileMap,
    );
    this.vectorStore.addNodes(embeddedNodes);
    this.nodeContextExtractor.updateEmbeddedNodeMap(
      new Map(embeddedNodes.map((node) => [node.id, node])),
    );
    stats.embeddingSuccesses += embeddedNodes.length;
    stats.embeddingFailures += this.allJSDocableNodesForEmbeddings.length - embeddedNodes.length;
    logger.success(
      `🧠 Embedding initialization complete. ${embeddedNodes.length} embeddings stored.`,
    );
  }

  /**
   * Handles errors during embedding initialization, logging them and disabling the feature.
   * @param error The error that occurred.
   * @param stats The processing statistics object to update.
   * @throws EmbeddingError to signal critical failure to higher levels.
   */
  private handleEmbeddingError(error: unknown, stats: ProcessingStats): void {
    logger.error(
      `❌ Critical error during embedding generation: ${error instanceof Error ? error.message : String(error)}. Embedding features will be disabled for this run.`,
    );
    stats.embeddingFailures += this.allJSDocableNodesForEmbeddings.length; // All nodes count as failed
    this.config.embeddingConfig.enabled = false;
    this.config.disableEmbeddings = true;
    throw new EmbeddingError(`Embedding initialization failed`, error);
  }

  /**
   * Finds semantically related symbols for a given node using its embedding.
   * @param node The JSDocableNode for which to find related symbols.
   * @param stats The processing statistics object to update.
   * @returns An array of RelatedSymbol objects.
   */
  findRelatedSymbolsForNode(node: JSDocableNode, stats: ProcessingStats): RelatedSymbol[] {
    if (!this.isInitializedSuccessfully || !this.isEmbeddingEnabled()) {
      return [];
    }

    // Cast to any to access getSourceFile method
    const sourceFile = (node as any).getSourceFile();
    if (!sourceFile) {
      this.logNodeSourceFileError(node);
      stats.embeddingFailures++;
      return [];
    }

    const nodeContext = this.nodeContextExtractor.getEnhancedNodeContext(node as any, sourceFile);

    if (!this.hasValidEmbedding(nodeContext)) {
      this.logNoEmbeddingWarning(node, nodeContext.id);
      stats.embeddingFailures++;
      return [];
    }

    try {
      const relatedSymbols = this.vectorStore.findRelatedSymbols(
        nodeContext.embedding!,
        this.config.embeddingConfig.minRelationshipScore,
        this.config.embeddingConfig.maxRelatedSymbols,
        nodeContext.id,
      );
      stats.totalRelationshipsDiscovered += relatedSymbols.length;
      return relatedSymbols;
    } catch (error: unknown) {
      // Explicitly define as unknown
      this.logRelatedSymbolsError(node, nodeContext.id, error);
      stats.embeddingFailures++;
      return [];
    }
  }

  /**
   * Checks if a node context contains a valid embedding.
   * @param nodeContext The node context.
   * @returns True if a valid embedding is present, false otherwise.
   */
  private hasValidEmbedding(nodeContext: NodeContext): boolean {
    return Array.isArray(nodeContext.embedding) && nodeContext.embedding.length > 0;
  }

  /**
   * Logs a warning if a node's source file cannot be found in the map.
   * @param node The node that caused the issue.
   */
  private logNodeSourceFileError(node: JSDocableNode): void {
    const nodeName = this.getNodeNameForLogging(node as any);
    logger.warn(
      `Could not find SourceFile in map for node ${nodeName} at ${(node as any).getSourceFile().getFilePath()}. Cannot find related symbols.`,
    );
  }

  /**
   * Logs a debug message if no embedding is found for a node.
   * @param node The node.
   * @param id The node's ID.
   */
  private logNoEmbeddingWarning(node: JSDocableNode, id: string): void {
    const nodeName = this.getNodeNameForLogging(node as any);
    logger.debug(
      `  No embedding found for node '${nodeName}' (${id}). Skipping related symbols search.`,
    );
  }

  /**
   * Logs an error if finding related symbols fails.
   * @param node The node that caused the error.
   * @param id The node's ID.
   * @param error The error object.
   */
  private logRelatedSymbolsError(node: JSDocableNode, id: string, error: unknown): void {
    const nodeName = this.getNodeNameForLogging(node as any);
    logger.error(
      `  ❌ Error finding related symbols for ${nodeName} (${id}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  /**
   * Gets a user-friendly name for a TypeScript node for logging purposes.
   * @param node The ts-morph Node.
   * @returns A string representing the node's name or kind.
   */
  private getNodeNameForLogging(node: Node): string {
    const symbol = node.getSymbol();
    if (symbol) {
      return symbol.getName();
    }
    if (
      Node.hasName(node) &&
      typeof (node as { getName?: () => string | undefined }).getName === 'function'
    ) {
      const name = (node as { getName: () => string | undefined }).getName();
      return name || node.getKindName();
    }
    return node.getKindName();
  }
}
