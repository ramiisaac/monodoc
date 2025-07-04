import {
  Project,
  Node,
  SourceFile,
  Symbol,
  SyntaxKind,
  DefinitionInfo,
  ReferenceEntry,
  TypeAliasDeclaration,
  InterfaceDeclaration,
  EnumDeclaration,
  ClassDeclaration,
  FunctionDeclaration,
  VariableDeclaration,
} from 'ts-morph';
import path from 'path';
import { logger } from '../utils/logger';
import { DetailedSymbolInfo, SymbolUsage } from '../types';

/**
 * Analyzes and collects detailed information about symbols (classes, functions, types, variables)
 * and their usages across the entire TypeScript project.
 * This is crucial for building a comprehensive understanding of the codebase structure.
 */
export class SymbolReferenceAnalyzer {
  private project: Project;
  private baseDir: string;
  private symbolMap: Map<string, DetailedSymbolInfo> = new Map(); // Maps unique symbol IDs to DetailedSymbolInfo

  constructor(project: Project, baseDir: string) {
    this.project = project;
    this.baseDir = baseDir;
  }

  /**
   * Initiates the symbol analysis process.
   * It finds all exported and relevant non-exported symbols, their definitions, and their usages.
   * @returns A Promise resolving to a Map where keys are unique symbol IDs and values are DetailedSymbolInfo objects.
   */
  async analyzeSymbols(): Promise<Map<string, DetailedSymbolInfo>> {
    logger.info('🔗 Analyzing symbol references across the monorepo...');
    this.symbolMap.clear(); // Clear any previous analysis

    const sourceFiles = this.project.getSourceFiles();
    let fileCount = 0;
    const totalFiles = sourceFiles.length;

    // First pass: Collect all relevant symbol definitions
    for (const sourceFile of sourceFiles) {
      fileCount++;
      logger.trace(
        `  Collecting definitions in file ${path.relative(this.baseDir, sourceFile.getFilePath())} (${fileCount}/${totalFiles})`,
      );
      this.collectSymbolsInFile(sourceFile);
    }

    logger.info(`✨ Collected definitions for ${this.symbolMap.size} key symbols.`);
    logger.info('🔍 Resolving all symbol usages...');

    // Second pass: Find all usages for the collected symbols
    let usageCount = 0;
    for (const symbolInfo of this.symbolMap.values()) {
      const definitionNode = this.getNodeFromDefinitionLocation(symbolInfo.definitionLocation);
      if (!definitionNode) {
        logger.warn(
          `Could not find definition node for symbol ID: ${symbolInfo.id}. Skipping usage analysis for this symbol.`,
        );
        continue;
      }

      const symbol = definitionNode.getSymbol();
      if (!symbol) {
        logger.debug(
          `No symbol found for definition node at ${symbolInfo.definitionLocation.filePath}:${symbolInfo.definitionLocation.line}.`,
        );
        continue;
      }

      // Get all references to this symbol
      const references: ReferenceEntry[] = symbol.getReferences();

      // Filter and process usages
      symbolInfo.usages = references
        .map((ref) => {
          const referencingNode = ref.getNode();
          const sourceFile = referencingNode.getSourceFile();
          const filePath = sourceFile.getFilePath();
          const line = referencingNode.getStartLineNumber();
          const column = referencingNode.getStart();
          return {
            filePath: path.relative(this.baseDir, filePath), // Store relative path
            line,
            column,
            snippet: this.getUsageSnippet(referencingNode),
          };
        })
        .filter(
          (usage) =>
            usage.filePath !==
              path.relative(this.baseDir, symbolInfo.definitionLocation.filePath) ||
            usage.line !== symbolInfo.definitionLocation.line,
        ); // Exclude the definition itself

      usageCount += symbolInfo.usages.length;
    }

    logger.success(`✨ Collected ${usageCount} symbol usages.`);
    return this.symbolMap;
  }

  /**
   * Retrieves the current state of the analyzed symbol map.
   * @returns The map of analyzed symbols.
   */
  getAnalyzedSymbols(): Map<string, DetailedSymbolInfo> {
    return this.symbolMap;
  }

  /**
   * Iterates through a source file to identify and collect symbol definitions.
   * Focuses on exported declarations and other major top-level declarations.
   * @param sourceFile The SourceFile to process.
   */
  private collectSymbolsInFile(sourceFile: SourceFile): void {
    // Process exported declarations (classes, functions, consts, etc.)
    sourceFile.getExportedDeclarations().forEach((decls) => {
      decls.forEach((decl) => {
        const symbol = decl.getSymbol();
        if (symbol) {
          this.processSymbolDefinition(symbol, decl);
        }
      });
    });

    // Also process non-exported top-level declarations that might be important (e.g., internal classes/types)
    sourceFile.getStatements().forEach((statement) => {
      if (
        Node.isClassDeclaration(statement) ||
        Node.isFunctionDeclaration(statement) ||
        Node.isInterfaceDeclaration(statement) ||
        Node.isTypeAliasDeclaration(statement) ||
        Node.isEnumDeclaration(statement)
      ) {
        // Skip if already processed as an export
        if (statement.isExported()) return;
        const symbol = statement.getSymbol();
        if (symbol) {
          this.processSymbolDefinition(symbol, statement);
        }
      } else if (Node.isVariableStatement(statement)) {
        statement.getDeclarations().forEach((decl) => {
          if (statement.isExported()) return; // Skip if handled by exported declarations
          const symbol = decl.getSymbol();
          if (symbol) {
            this.processSymbolDefinition(symbol, decl);
          }
        });
      }
    });

    // Process members of classes and interfaces (public/protected)
    sourceFile.getClasses().forEach((classDecl) => {
      classDecl.getMembers().forEach((member) => {
        const isPrivate =
          (Node.isMethodDeclaration(member) ||
            Node.isPropertyDeclaration(member) ||
            Node.isGetAccessorDeclaration(member) ||
            Node.isSetAccessorDeclaration(member)) &&
          member.getModifiers().some((mod) => mod.getKind() === SyntaxKind.PrivateKeyword);

        if (!isPrivate && member.getSymbol()) {
          this.processSymbolDefinition(member.getSymbolOrThrow(), member);
        }
      });
    });

    sourceFile.getInterfaces().forEach((interfaceDecl) => {
      interfaceDecl.getMembers().forEach((member) => {
        if (member.getSymbol()) {
          this.processSymbolDefinition(member.getSymbolOrThrow(), member);
        }
      });
    });
  }

  /**
   * Processes a symbol definition, adding it to the symbol map if it's new.
   * @param symbol The ts-morph Symbol object.
   * @param node The corresponding ts-morph Node for the definition.
   */
  private processSymbolDefinition(symbol: Symbol, node: Node): void {
    const filePath = node.getSourceFile().getFilePath();
    // Use the name node's start for more precise location
    const nameNode = (node as any).getNameNode ? (node as any).getNameNode() : node;
    const line = nameNode.getStartLineNumber();
    const column = nameNode.getStart();
    const id = `${path.relative(this.baseDir, filePath)}:${line}:${column}`; // Unique ID for the symbol definition

    if (!this.symbolMap.has(id)) {
      const kind = node.getKindName(); // e.g., 'ClassDeclaration', 'FunctionDeclaration'
      this.symbolMap.set(id, {
        id,
        name: symbol.getName(),
        kind: kind,
        definitionLocation: { filePath, line, column }, // Store absolute path internally
        usages: [], // Usages filled in second pass
      });
      logger.trace(
        `  Discovered symbol definition: ${symbol.getName()} (${kind}) at ${path.relative(this.baseDir, filePath)}:${line}`,
      );
    }
  }

  /**
   * Retrieves a Node instance from a given definition location.
   * This is necessary to get the Symbol object for usage analysis.
   * @param location The definition location.
   * @returns The Node at the specified location, or undefined if not found.
   */
  private getNodeFromDefinitionLocation(location: {
    filePath: string;
    line: number;
    column: number;
  }): Node | undefined {
    const sourceFile = this.project.getSourceFile(location.filePath);
    if (!sourceFile) {
      return undefined;
    }
    // Find the node at the specific line and column
    return sourceFile.getDescendantAtPos(location.column);
  }

  /**
   * Extracts a small code snippet around a symbol usage for context.
   * @param node The node representing the symbol's usage.
   * @returns A trimmed code snippet string, or undefined.
   */
  private getUsageSnippet(node: Node): string | undefined {
    const sourceFile = node.getSourceFile();
    const fullText = sourceFile.getText();
    const nodeStart = node.getStart();
    const nodeEnd = node.getEnd();
    const contextLength = 50; // Characters before/after for context

    const start = Math.max(0, nodeStart - contextLength);
    const end = Math.min(fullText.length, nodeEnd + contextLength);

    let snippet = fullText.substring(start, end);

    if (start > 0) snippet = '...' + snippet; // Indicate truncation at start
    if (end < fullText.length) snippet = snippet + '...'; // Indicate truncation at end

    return snippet.replace(/\s+/g, ' ').trim(); // Normalize whitespace
  }
}
