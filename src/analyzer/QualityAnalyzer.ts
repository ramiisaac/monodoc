import { Node, SourceFile, JSDoc, JSDocTag, SyntaxKind } from 'ts-morph';
import {
  JSDocableNode,
  NodeQualityMetrics,
  QualityIssue,
  QualityIssueType,
  GeneratorConfig,
} from '../types';
import { logger } from '../utils/logger';

// Re-export QualityIssue to fix imports elsewhere
export { QualityIssue };

/**
 * Defines metrics for documentation quality.
 */
export interface QualityMetrics {
  completenessScore: number;
  consistencyScore: number;
  exampleQuality: number;
  overallScore: number;
  issues: QualityIssue[];
}

/**
 * Analyzes the quality of JSDoc comments for a given TypeScript node.
 * It assesses completeness, consistency, and example quality.
 */
export class DocumentationQualityAnalyzer {
  /**
   * Analyzes a source file to check its documentation quality.
   * @param sourceFile The source file to analyze.
   * @param config The generator configuration.
   * @returns An object containing quality metrics and issues for the file.
   */
  analyzeFile(
    sourceFile: SourceFile,
    config: GeneratorConfig,
  ): {
    issues: Array<{
      node: JSDocableNode;
      nodeKind: string;
      issues: QualityIssue[];
      score: number;
    }>;
    overallScore: number;
  } {
    const issues: Array<{
      node: JSDocableNode;
      nodeKind: string;
      issues: QualityIssue[];
      score: number;
    }> = [];

    const jsdocableNodes = this.getJSDocableNodes(sourceFile);
    let totalScore = 0;
    let nodeCount = 0;

    for (const node of jsdocableNodes) {
      if (this.shouldDocumentNode(node, config)) {
        const nodeMetrics = this.analyzeNodeDocumentation(node, config.jsdocConfig);

        if (nodeMetrics.issues.length > 0) {
          issues.push({
            node,
            nodeKind: node.getKindName(),
            issues: nodeMetrics.issues,
            score: nodeMetrics.overallScore,
          });
        }

        totalScore += nodeMetrics.overallScore;
        nodeCount++;
      }
    }

    return {
      issues,
      overallScore: nodeCount > 0 ? totalScore / nodeCount : 100,
    };
  }

  /**
   * Get all JSDocable nodes from a source file.
   */
  private getJSDocableNodes(sourceFile: SourceFile): JSDocableNode[] {
    const nodes: JSDocableNode[] = [];

    sourceFile.forEachDescendant((node) => {
      if (this.isJSDocableNode(node)) {
        nodes.push(node as JSDocableNode);
      }
    });

    return nodes;
  }

  /**
   * Check if a node is JSDocable.
   */
  private isJSDocableNode(node: Node): boolean {
    return (
      node.getKind() === SyntaxKind.FunctionDeclaration ||
      node.getKind() === SyntaxKind.MethodDeclaration ||
      node.getKind() === SyntaxKind.ClassDeclaration ||
      node.getKind() === SyntaxKind.InterfaceDeclaration ||
      node.getKind() === SyntaxKind.PropertyDeclaration ||
      node.getKind() === SyntaxKind.GetAccessor ||
      node.getKind() === SyntaxKind.SetAccessor ||
      node.getKind() === SyntaxKind.VariableStatement ||
      node.getKind() === SyntaxKind.TypeAliasDeclaration ||
      node.getKind() === SyntaxKind.EnumDeclaration
    );
  }

  /**
   * Determine if a node should be documented based on configuration.
   */
  private shouldDocumentNode(node: JSDocableNode, config: GeneratorConfig): boolean {
    // Check visibility
    if ('getModifiers' in node && typeof node.getModifiers === 'function') {
      const modifiers = node.getModifiers();
      const isPrivate = modifiers.some((m: any) => m.getKind() === SyntaxKind.PrivateKeyword);

      if (isPrivate && !config.documentPrivate) {
        return false;
      }
    }

    return true;
  }

  /**
   * Analyzes JSDoc documentation for a specific node.
   */
  analyzeNodeDocumentation(
    node: JSDocableNode,
    jsDocConfig: GeneratorConfig['jsdocConfig'],
  ): NodeQualityMetrics {
    const jsDoc = this.getNodeJSDoc(node);

    if (!jsDoc) {
      return {
        hasJSDoc: false,
        completeness: 0,
        paramCoverage: 0,
        returnCoverage: 0,
        exampleCount: 0,
        descriptionLength: 0,
        overallScore: 0,
        issues: [
          {
            type: 'no_jsdoc',
            severity: 'error',
            message: 'Missing JSDoc comment',
            suggestion: 'Add JSDoc documentation for this node',
          },
        ],
        suggestions: ['Add JSDoc documentation'],
      };
    }

    const descriptionLength = this.getDescriptionLength(jsDoc);
    const exampleCount = this.countExamples(jsDoc);
    let issues: QualityIssue[] = [];

    // Check description
    if (descriptionLength === 0) {
      issues.push({
        type: 'missing_description',
        severity: 'error',
        message: 'Missing description in JSDoc',
        suggestion: 'Add a descriptive comment',
      });
    } else if (descriptionLength < 20) {
      issues.push({
        type: 'short_description',
        severity: 'warning',
        message: 'Description is too short',
        suggestion: 'Provide a more detailed description',
      });
    }

    // Function-specific checks
    if (this.isFunctionLike(node)) {
      const funcMetrics = this.analyzeFunctionDocumentation(node, jsDoc, jsDocConfig);
      issues = issues.concat(funcMetrics.paramIssues, funcMetrics.returnIssues);

      const completeness = this.calculateCompleteness({
        hasDescription: descriptionLength > 0,
        paramCoverage: funcMetrics.paramCoverage,
        returnCoverage: funcMetrics.returnCoverage,
        hasExamples: exampleCount > 0,
      });

      return {
        hasJSDoc: true,
        completeness,
        paramCoverage: funcMetrics.paramCoverage,
        returnCoverage: funcMetrics.returnCoverage,
        exampleCount,
        descriptionLength,
        overallScore: this.calculateOverallScore({ completeness, exampleCount, descriptionLength }),
        issues,
        suggestions: this.generateSuggestions(issues),
      };
    }

    // Class-specific checks
    if (this.isClassLike(node)) {
      const classMetrics = this.analyzeClassDocumentation(node, jsDoc, jsDocConfig);
      issues = issues.concat(classMetrics.issues);

      const completeness = this.calculateCompleteness({
        hasDescription: descriptionLength > 0,
        hasExamples: exampleCount > 0,
        hasClassTags: classMetrics.hasConstructor || classMetrics.hasProperties,
      });

      return {
        hasJSDoc: true,
        completeness,
        paramCoverage: classMetrics.constructorParamCoverage,
        returnCoverage: 100,
        exampleCount,
        descriptionLength,
        overallScore: this.calculateOverallScore({ completeness, exampleCount, descriptionLength }),
        issues,
        suggestions: this.generateSuggestions(issues),
      };
    }

    // Default case for other node types
    const completeness = descriptionLength > 0 ? 100 : 0;

    return {
      hasJSDoc: true,
      completeness,
      paramCoverage: 100,
      returnCoverage: 100,
      exampleCount,
      descriptionLength,
      overallScore: this.calculateOverallScore({ completeness, exampleCount, descriptionLength }),
      issues,
      suggestions: this.generateSuggestions(issues),
    };
  }

  private getNodeJSDoc(node: JSDocableNode): JSDoc | undefined {
    if ('getJsDocs' in node && typeof node.getJsDocs === 'function') {
      const jsDocs = node.getJsDocs();
      return jsDocs.length > 0 ? jsDocs[0] : undefined;
    }
    return undefined;
  }

  private isFunctionLike(node: JSDocableNode): boolean {
    return (
      node.getKind() === SyntaxKind.FunctionDeclaration ||
      node.getKind() === SyntaxKind.MethodDeclaration ||
      node.getKind() === SyntaxKind.GetAccessor ||
      node.getKind() === SyntaxKind.SetAccessor
    );
  }

  private isClassLike(node: JSDocableNode): boolean {
    return node.getKind() === SyntaxKind.ClassDeclaration;
  }

  private getDescriptionLength(jsDoc: JSDoc): number {
    return jsDoc.getDescription().trim().length;
  }

  private countExamples(jsDoc: JSDoc): number {
    return jsDoc.getTags().filter((tag) => tag.getTagName() === 'example').length;
  }

  private calculateCompleteness(metrics: {
    hasDescription: boolean;
    paramCoverage?: number;
    returnCoverage?: number;
    hasExamples?: boolean;
    hasClassTags?: boolean;
  }): number {
    let score = 0;
    let maxScore = 0;

    if (metrics.hasDescription) score += 40;
    maxScore += 40;

    if (metrics.paramCoverage !== undefined) {
      score += metrics.paramCoverage * 0.3;
      maxScore += 30;
    }

    if (metrics.returnCoverage !== undefined) {
      score += metrics.returnCoverage * 0.2;
      maxScore += 20;
    }

    if (metrics.hasExamples) score += 10;
    maxScore += 10;

    return (score / maxScore) * 100;
  }

  private calculateOverallScore(metrics: {
    completeness: number;
    exampleCount: number;
    descriptionLength: number;
  }): number {
    return (
      metrics.completeness * 0.6 +
      (metrics.exampleCount > 0 ? 20 : 0) +
      Math.min(20, metrics.descriptionLength / 10)
    );
  }

  private analyzeFunctionDocumentation(
    node: Node,
    jsDoc: JSDoc,
    _jsDocConfig: GeneratorConfig['jsdocConfig'],
  ): {
    paramCoverage: number;
    returnCoverage: number;
    paramIssues: QualityIssue[];
    returnIssues: QualityIssue[];
  } {
    const paramIssues: QualityIssue[] = [];
    const returnIssues: QualityIssue[] = [];

    // Simple implementation - you can expand this
    const paramTags = jsDoc.getTags().filter((tag) => tag.getTagName() === 'param');
    const returnTag = jsDoc.getTags().find((tag) => tag.getTagName() === 'returns');

    const paramCoverage = paramTags.length > 0 ? 100 : 0;
    const returnCoverage = returnTag ? 100 : 0;

    if (paramTags.length === 0) {
      paramIssues.push({
        type: 'missing_param',
        severity: 'warning',
        message: 'Missing @param tags',
        suggestion: 'Add @param tags for function parameters',
      });
    }

    if (!returnTag) {
      returnIssues.push({
        type: 'missing_return',
        severity: 'warning',
        message: 'Missing @returns tag',
        suggestion: 'Add @returns tag for function return value',
      });
    }

    return { paramCoverage, returnCoverage, paramIssues, returnIssues };
  }

  private analyzeClassDocumentation(
    node: Node,
    jsDoc: JSDoc,
    _jsDocConfig: GeneratorConfig['jsdocConfig'],
  ): {
    issues: QualityIssue[];
    hasConstructor: boolean;
    hasProperties: boolean;
    constructorParamCoverage: number;
  } {
    const issues: QualityIssue[] = [];

    // Simple implementation
    const tags = jsDoc.getTags();
    const hasConstructor = tags.some((tag) => tag.getTagName() === 'constructor');
    const hasProperties = tags.some((tag) => tag.getTagName() === 'property');

    return {
      issues,
      hasConstructor,
      hasProperties,
      constructorParamCoverage: 100,
    };
  }

  private generateSuggestions(issues: QualityIssue[]): string[] {
    return issues.map((issue) => issue.suggestion).filter((s): s is string => s !== undefined);
  }

  private analyzeExampleQuality(exampleTag: JSDocTag): number {
    const content = exampleTag.getCommentText() || '';
    if (content.length < 10) return 0;
    if (content.length < 50) return 50;
    return 100;
  }

  public getNodeNameForLogging(node: Node): string {
    try {
      if ('getName' in node && typeof node.getName === 'function') {
        return node.getName() || '<anonymous>';
      }
      return '<unnamed>';
    } catch (_e) {
      return '<error getting name>';
    }
  }
}
