import {
  Node,
  SourceFile,
  SyntaxKind,
  ParameterDeclaration,
  TypeElementTypes,
  GetAccessorDeclaration,
  SetAccessorDeclaration,
  PropertySignature,
  MethodSignature,
  VariableDeclaration,
  ArrowFunction,
  FunctionExpression,
  ClassExpression,
  CallExpression,
  ObjectLiteralExpression,
  FunctionLikeDeclaration,
} from 'ts-morph';
import path from 'path';
import { logger } from '../utils/logger';
import {
  NodeContext,
  JSDocableNode,
  WorkspacePackage,
  GeneratorConfig,
  DetailedSymbolInfo,
  SymbolUsage,
  EmbeddedNode,
} from '../types';

/**
 * Extracts comprehensive context information for a given TypeScript node,
 * crucial for AI-powered JSDoc generation. This includes code snippets,
 * file/package context, imports, surrounding code, symbol usages, and embeddings.
 */
export class NodeContextExtractor {
  private config: GeneratorConfig;
  private packages: WorkspacePackage[];
  private baseDir: string;
  private symbolMap: Map<string, DetailedSymbolInfo>; // Injected map of all discovered symbols
  private embeddedNodeMap: Map<string, EmbeddedNode>; // Map of generated embeddings for nodes

  constructor(
    config: GeneratorConfig,
    packages: WorkspacePackage[],
    baseDir: string,
    symbolMap: Map<string, DetailedSymbolInfo>,
    embeddedNodeMap: Map<string, EmbeddedNode> = new Map(),
  ) {
    this.config = config;
    this.packages = packages;
    this.baseDir = baseDir;
    this.symbolMap = symbolMap;
    this.embeddedNodeMap = embeddedNodeMap;
  }

  /**
   * Updates the internal map of embedded nodes.
   * This is called by `RelationshipAnalyzer` after embeddings are generated.
   * @param newEmbeddedNodeMap The new map of embedded nodes.
   */
  updateEmbeddedNodeMap(newEmbeddedNodeMap: Map<string, EmbeddedNode>): void {
    this.embeddedNodeMap = newEmbeddedNodeMap;
    logger.debug(
      `NodeContextExtractor: Updated embedded node map with ${newEmbeddedNodeMap.size} entries.`,
    );
  }

  /**
   * Type guard to check if a node is capable of having JSDoc comments.
   * @param node The ts-morph Node to check.
   * @returns True if the node is JSDocable, false otherwise.
   */
  isJSDocable(node: Node): node is JSDocableNode {
    return (
      'getJsDocs' in node &&
      typeof (node as JSDocableNode).getJsDocs === 'function' &&
      'addJsDoc' in node &&
      typeof (node as JSDocableNode).addJsDoc === 'function'
    );
  }

  /**
   * Collects all JSDocable nodes within a given source file,
   * applying include/exclude kind filters and private member filters from the configuration.
   * @param sourceFile The ts-morph SourceFile to analyze.
   * @returns An array of JSDocableNode objects found in the file.
   */
  collectJSDocableNodes(sourceFile: SourceFile): JSDocableNode[] {
    const nodes: JSDocableNode[] = [];
    const jsdocableKinds = new Set(this.config.jsdocConfig.includeNodeKinds);
    const excludeKinds = new Set(this.config.jsdocConfig.excludeNodeKinds);

    const checkAndAddNode = (node: Node) => {
      if (!this.isJSDocable(node)) {
        return; // Not a node that can directly have JSDoc
      }

      const nodeKind = node.getKindName();

      // Skip nodes explicitly excluded by kind
      if (excludeKinds.has(nodeKind)) {
        logger.trace(
          `    [Node Filter] Skipping node by kind exclusion: ${nodeKind} - ${this.getNodeNameForLogging(node)}`,
        );
        return;
      }

      // If `includeNodeKinds` is specified, only include nodes of those kinds
      if (jsdocableKinds.size > 0 && !jsdocableKinds.has(nodeKind)) {
        logger.trace(
          `    [Node Filter] Skipping node by kind inclusion: ${nodeKind} - ${this.getNodeNameForLogging(node)}`,
        );
        return;
      }

      // Special handling for VariableDeclarations: only document if they are function/class expressions or complex objects
      if (Node.isVariableDeclaration(node)) {
        const initializer = node.getInitializer();
        if (
          !(
            (
              initializer &&
              (Node.isArrowFunction(initializer) ||
                Node.isFunctionExpression(initializer) ||
                Node.isClassExpression(initializer) ||
                Node.isObjectLiteralExpression(initializer) || // e.g., `const MyObject = { ... }`
                Node.isCallExpression(initializer))
            ) // e.g., `const instance = new MyClass()` or `const result = myFunction()`
          )
        ) {
          logger.trace(
            `    [Node Filter] Skipping simple variable declaration (no complex initializer): ${this.getNodeNameForLogging(node)}`,
          );
          return;
        }
      }

      // Filter out private members if `includePrivate` is false
      if (!this.config.jsdocConfig.includePrivate) {
        if (
          Node.isMethodDeclaration(node) ||
          Node.isPropertyDeclaration(node) ||
          Node.isGetAccessorDeclaration(node) ||
          Node.isSetAccessorDeclaration(node) ||
          Node.isConstructorDeclaration(node)
        ) {
          if (node.getModifiers().some((mod) => mod.getKind() === SyntaxKind.PrivateKeyword)) {
            logger.trace(
              `    [Node Filter] Skipping private member: ${this.getNodeNameForLogging(node)}`,
            );
            return;
          }
        }
      }

      // Filter out interface/type members if their parent is also JSDocable and might be documented
      // This avoids redundant JSDoc for properties/methods within an interface that itself gets JSDoc.
      if (
        (Node.isPropertySignature(node) || Node.isMethodSignature(node)) &&
        !jsdocableKinds.has(nodeKind) // Only apply this filter if this specific kind is NOT in includeNodeKinds
      ) {
        const parent = node.getParent();
        if (
          parent &&
          this.isJSDocable(parent) &&
          (jsdocableKinds.size === 0 || jsdocableKinds.has(parent.getKindName()))
        ) {
          logger.trace(
            `    [Node Filter] Skipping interface/type member (parent likely to be documented): ${this.getNodeNameForLogging(node)}`,
          );
          return;
        }
      }

      nodes.push(node);
    };

    // Traverse the AST to find JSDocable nodes
    sourceFile.forEachChild((child) => {
      checkAndAddNode(child); // Check top-level declarations

      // For declarations that can contain other declarations (e.g., classes, interfaces, modules)
      if (
        Node.isClassDeclaration(child) ||
        Node.isInterfaceDeclaration(child) ||
        Node.isEnumDeclaration(child) ||
        Node.isTypeAliasDeclaration(child) ||
        Node.isModuleDeclaration(child)
      ) {
        // Recursively check descendants within these
        child.forEachDescendant((descendant) => {
          if (descendant !== child) {
            // Avoid re-checking the parent itself
            checkAndAddNode(descendant);
          }
        });
      }
    });

    // Handle exported variable statements (e.g., `export const x = ...`)
    sourceFile.getStatements().forEach((statement) => {
      if (Node.isVariableStatement(statement) && statement.isExported()) {
        statement.getDeclarations().forEach((decl) => checkAndAddNode(decl));
      }
    });

    // Prioritize exported declarations if configured, ensuring they are always included
    if (this.config.jsdocConfig.prioritizeExports) {
      sourceFile.getExportedDeclarations().forEach((declarations) => {
        declarations.forEach((decl) => {
          if (this.isJSDocable(decl) && !nodes.includes(decl)) {
            // Add if not already present from earlier traversal
            checkAndAddNode(decl);
          }
        });
      });
    }

    // Filter for unique nodes to avoid duplicates from various traversal paths
    const uniqueNodes = nodes.filter(
      (node, index, arr) =>
        arr.findIndex((n) => n.getStart() === node.getStart() && n.getEnd() === node.getEnd()) ===
        index,
    );

    logger.debug(
      `  Found ${uniqueNodes.length} JSDocable nodes in ${path.relative(this.baseDir, sourceFile.getFilePath())}`,
    );
    return uniqueNodes;
  }

  /**
   * Extracts and enriches context information for a given JSDocable node.
   * This context is vital for the AI to generate accurate JSDoc.
   * @param node The JSDocableNode for which to extract context.
   * @param sourceFile The SourceFile containing the node.
   * @returns A comprehensive NodeContext object.
   */
  getEnhancedNodeContext(node: JSDocableNode, sourceFile: SourceFile): NodeContext {
    const relativeFilePath = path.relative(this.baseDir, sourceFile.getFilePath());
    const nodeId = `${relativeFilePath}:${node.getStartLineNumber()}:${node.getStart()}`;

    let codeSnippet = node.getText();
    if (codeSnippet.length > this.config.jsdocConfig.maxSnippetLength) {
      // Truncate long snippets to avoid exceeding LLM context limits
      codeSnippet =
        codeSnippet.substring(0, this.config.jsdocConfig.maxSnippetLength) +
        '\n// ... (snippet truncated)';
    }

    const nodeKind = node.getKindName();
    let nodeName = this.getNodeNameForLogging(node); // Consistent naming

    let signatureDetails = '';
    let parameters: Array<{ name: string; type: string; optional: boolean }> = [];
    let returnType: string | undefined;
    let isAsync = false;
    let accessModifier: 'public' | 'private' | 'protected' | undefined;
    let isExported = false;

    try {
      if (
        Node.isFunctionLikeDeclaration(node) ||
        (Node.isVariableDeclaration(node) &&
          node.getInitializer &&
          Node.isFunctionLikeExpression(node.getInitializer()))
      ) {
        const funcNode = Node.isFunctionLikeDeclaration(node)
          ? node
          : (node.getInitializer() as FunctionExpression | ArrowFunction);
        parameters = funcNode.getParameters().map((p: ParameterDeclaration) => ({
          name: p.getName(),
          type: p.getType().getText(),
          optional: p.isOptional(),
        }));
        returnType = funcNode.getReturnType().getText();
        signatureDetails = `${nodeName}(${parameters.map((p) => p.name).join(', ')})${returnType ? `: ${returnType}` : ''}`;
        if ('isAsync' in funcNode && typeof (funcNode as any).isAsync === 'function') {
          isAsync = (funcNode as FunctionLikeDeclaration).isAsync();
        }
      } else if (
        Node.isPropertyDeclaration(node) ||
        Node.isPropertySignature(node) ||
        Node.isGetAccessorDeclaration(node) ||
        Node.isSetAccessorDeclaration(node)
      ) {
        signatureDetails = `${nodeName}: ${node.getType().getText()}`;
      } else if (Node.isEnumDeclaration(node)) {
        const members = node
          .getMembers()
          .map((m) => m.getName())
          .join(', ');
        signatureDetails = `enum ${nodeName} { ${members} }`;
      } else if (Node.isTypeAliasDeclaration(node)) {
        signatureDetails = `type ${nodeName} = ${node.getTypeNode()?.getText() || '(complex type)'}`;
      } else if (Node.isInterfaceDeclaration(node)) {
        const members = node
          .getMembers()
          .map((m: TypeElementTypes) => {
            const memberSymbol = m.getSymbol();
            if (memberSymbol) return memberSymbol.getName();
            if (Node.isPropertySignature(m) || Node.isMethodSignature(m)) {
              return m.getNameNode().getText();
            }
            return m.getKindName();
          })
          .join('; ');
        signatureDetails = `interface ${nodeName} { ${members} }`;
      }

      // Check access modifier for class members
      if (
        Node.isMethodDeclaration(node) ||
        Node.isPropertyDeclaration(node) ||
        Node.isGetAccessorDeclaration(node) ||
        Node.isSetAccessorDeclaration(node)
      ) {
        const mods = node.getModifiers().map((m) => m.getText());
        if (mods.includes('private')) accessModifier = 'private';
        else if (mods.includes('protected')) accessModifier = 'protected';
        else accessModifier = 'public'; // Default to public if no explicit modifier
      }

      // Check if exported
      isExported = node.isExported();
    } catch (error: unknown) {
      logger.error(
        `Failed to collect signature details from node ${nodeName} in ${relativeFilePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // Fallback to minimal details if error occurs during extraction
      signatureDetails = `(Error extracting signature details: ${error instanceof Error ? error.message : 'unknown'})`;
    }

    const packageContext = this.getPackageContext(sourceFile.getFilePath());

    const relevantImports: string[] = sourceFile
      .getImportDeclarations()
      .filter((imp) => {
        const moduleSpecifier = imp.getModuleSpecifierValue();
        // Include external library imports and internal project imports from other packages
        return (
          !moduleSpecifier.startsWith('.') || // External imports
          this.packages.some(
            (pkg) =>
              moduleSpecifier.startsWith(pkg.name) &&
              pkg.name !== this.getPackageContext(sourceFile.getFilePath()),
          ) // Cross-package imports
          // Add specific popular libraries (react, lodash etc.) if not covered by direct import analysis
        );
      })
      .map((imp) => imp.getText());

    let surroundingContext: string | undefined;
    const parent = node.getParent();
    // Include context from direct parent if it's a significant declaration type
    if (
      parent &&
      (Node.isClassDeclaration(parent) ||
        Node.isInterfaceDeclaration(parent) ||
        Node.isTypeAliasDeclaration(parent) ||
        Node.isModuleDeclaration(parent) ||
        Node.isFunctionDeclaration(parent) ||
        Node.isVariableDeclaration(parent)) // For function/class expressions as variable declarations
    ) {
      surroundingContext = parent.getText();
      if (surroundingContext.length > 1500) {
        // Limit context length
        surroundingContext =
          surroundingContext.substring(0, 1500) + '\n// ... (surrounding context truncated)';
      }
    }

    let symbolUsages: SymbolUsage[] | undefined;
    const symbolDefinitionId = `${relativeFilePath}:${node.getStartLineNumber()}:${node.getStart()}`;
    const symbolInfo = this.symbolMap.get(symbolDefinitionId);
    if (symbolInfo) {
      // Filter out self-references from usages
      symbolUsages = symbolInfo.usages.filter(
        (usage) => usage.filePath !== relativeFilePath || usage.line !== node.getStartLineNumber(),
      );
      if (symbolUsages.length === 0) symbolUsages = undefined; // No usages found
    }

    // Retrieve embedding if available
    const embeddedNodeInfo = this.embeddedNodeMap.get(nodeId);
    const embedding = embeddedNodeInfo?.embedding;

    return {
      id: nodeId,
      codeSnippet,
      nodeKind,
      nodeName,
      signatureDetails,
      fileContext: relativeFilePath,
      packageContext,
      relevantImports,
      surroundingContext,
      symbolUsages,
      embedding,
      parameters,
      returnType,
      isAsync,
      isExported,
      accessModifier,
      // Custom data can be added by plugins via beforeProcessing hook
      customData: {},
    };
  }

  /**
   * Determines the package context for a given file path within the monorepo.
   * @param filePath The absolute file path.
   * @returns A descriptive string of the package context.
   */
  private getPackageContext(filePath: string): string {
    const foundPackage = this.packages.find((pkg) => filePath.startsWith(pkg.path));
    if (foundPackage) {
      return `Part of ${foundPackage.type} workspace, ${foundPackage.name} package`;
    }
    const relativePath = path.relative(this.baseDir, filePath);
    const pathParts = relativePath.split(path.sep);
    if (pathParts.length >= 2) {
      return `Possibly in ${pathParts[0]} workspace, ${pathParts[1]} directory`;
    }
    return 'Unknown package context';
  }

  /**
   * Gets a user-friendly name for a TypeScript node for logging and display purposes.
   * @param node The ts-morph Node.
   * @returns A string representing the node's name (if available) or its kind.
   */
  public getNodeNameForLogging(node: Node): string {
    const symbol = node.getSymbol();
    if (symbol) return symbol.getName();
    if (Node.isIdentifier(node)) return node.getText();
    if (Node.isConstructorDeclaration(node))
      return `constructor of ${node.getParent()?.getKindName() || 'unnamed class'}`;
    if (Node.hasName(node) && typeof (node as any).getName === 'function')
      return (node as any).getName() || node.getKindName();
    return node.getKindName();
  }
}
