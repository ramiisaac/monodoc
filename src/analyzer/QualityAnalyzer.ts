import {
  JSDoc,
  Node,
  JSDocTag,
  FunctionLikeDeclaration,
  JSDocableNode,
  SourceFile,
  SyntaxKind,
} from 'ts-morph';
import { GeneratorConfig } from '../types'; // To access jsdocConfig for rules

/**
 * Defines metrics for documentation quality.
 */
export interface QualityMetrics {
  completenessScore: number; // How much of the expected JSDoc is present
  consistencyScore: number; // How consistent the JSDoc style/tags are
  exampleQuality: number; // Quality score for code examples
  overallScore: number; // Weighted average of the above
  issues: QualityIssue[]; // Detailed list of issues found
}

/**
 * Represents a specific quality issue found in documentation.
 */
export interface QualityIssue {
  type:
    | 'missing_description'
    | 'short_description'
    | 'missing_param'
    | 'missing_return'
    | 'missing_example'
    | 'inconsistent_style'
    | 'poor_example_content'
    | 'unclear_param_description'
    | 'unclear_return_description'
    | 'private_undocumented'
    | 'overly_generic_description'
    | 'no_jsdoc';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  suggestion?: string;
  nodeName?: string; // Name of the node where issue was found
  filePath?: string; // Path of the file where issue was found
}

/**
 * Analyzes the quality of JSDoc comments for a given TypeScript node.
 * It assesses completeness, consistency, and example quality.
 */
export class DocumentationQualityAnalyzer {
  /**
   * Collects all nodes in a source file that are capable of having JSDoc comments,
   * respecting `includeNodeKinds` and `excludeNodeKinds` from the config.
   * @param sourceFile The ts-morph SourceFile to analyze.
   * @param jsdocConfig The JSDoc configuration part of GeneratorConfig.
   * @returns An array of JSDocableNode.
   */
  collectJSDocableNodes(
    sourceFile: SourceFile,
    jsdocConfig: GeneratorConfig['jsdocConfig'],
  ): JSDocableNode[] {
    const nodes: JSDocableNode[] = [];
    const includeKinds = new Set(jsdocConfig.includeNodeKinds);
    const excludeKinds = new Set(jsdocConfig.excludeNodeKinds);

    const isJSDocable = (node: Node): node is JSDocableNode => {
      return (
        'getJsDocs' in node &&
        typeof (node as JSDocableNode).getJsDocs === 'function' &&
        'addJsDoc' in node && // Ensures it's a node that can *have* JSDoc added
        typeof (node as JSDocableNode).addJsDoc === 'function'
      );
    };

    sourceFile.forEachDescendant((node) => {
      if (!isJSDocable(node)) {
        return;
      }

      const nodeKind = node.getKindName();

      // Apply exclusion rules first
      if (excludeKinds.has(nodeKind)) {
        return;
      }

      // Apply inclusion rules: if includeKinds is specified, node must be in it
      if (includeKinds.size > 0 && !includeKinds.has(nodeKind)) {
        // Special case: if a VariableDeclaration is included, we might want its initializer's function/class.
        // This is complex and usually handled by the AI itself.
        return;
      }

      // Filter out simple variable declarations that aren't functions/classes/objects
      if (Node.isVariableDeclaration(node)) {
        const initializer = node.getInitializer();
        if (
          !(
            (
              initializer &&
              (Node.isArrowFunction(initializer) ||
                Node.isFunctionExpression(initializer) ||
                Node.isClassExpression(initializer) ||
                Node.isObjectLiteralExpression(initializer) || // For object literals that might be config
                Node.isCallExpression(initializer))
            ) // For IIFEs or module patterns
          )
        ) {
          return; // Skip simple variable declarations like `const x = 10;`
        }
      }

      // Apply private visibility rule
      if (!jsdocConfig.includePrivate) {
        if (
          Node.isMethodDeclaration(node) ||
          Node.isPropertyDeclaration(node) ||
          Node.isGetAccessorDeclaration(node) ||
          Node.isSetAccessorDeclaration(node) ||
          Node.isConstructorDeclaration(node) // Constructors can also be private
        ) {
          if (node.getModifiers().some((mod) => mod.getKind() === SyntaxKind.PrivateKeyword)) {
            return;
          }
        }
      }

      // Avoid duplicating JSDoc for interface/type members if the parent is also documented
      if (Node.isPropertySignature(node) || Node.isMethodSignature(node)) {
        const parent = node.getParent();
        if (parent && (Node.isInterfaceDeclaration(parent) || Node.isTypeLiteral(parent))) {
          // If the parent is also a JSDocable node and is likely to be documented
          // and we are not explicitly including property signatures
          if (
            isJSDocable(parent) &&
            (includeKinds.size === 0 || includeKinds.has(parent.getKindName()))
          ) {
            // If we're documenting the interface/type, we don't necessarily need to document each member separately,
            // or the member's JSDoc might be merged into the parent. This is a judgment call.
            // For quality analysis, we'll still check them, but for generation we might skip.
            // Here, we decide to include them for analysis to check if *they* have docs.
          }
        }
      }

      nodes.push(node);
    });

    return nodes;
  }

  /**
   * Analyzes the JSDoc quality for a single JSDocable node.
   * @param node The ts-morph JSDocableNode to analyze.
   * @returns A QualityMetrics object containing scores and issues.
   */
  analyzeNode(node: JSDocableNode): QualityMetrics {
    const jsDocs = node.getJsDocs();
    const issues: QualityIssue[] = [];
    const nodeName = this.getNodeNameForLogging(node);

    let completenessScore = 0;
    let consistencyScore = 100; // Placeholder for now, requires project-wide analysis
    let exampleQuality = 0;
    let hasDescription = false;
    let hasParams = false;
    let hasReturns = false;
    let hasExample = false;

    if (jsDocs.length === 0) {
      issues.push({
        type: 'no_jsdoc',
        severity: 'critical',
        message: 'No JSDoc comment found.',
        suggestion: 'Generate a JSDoc comment.',
        nodeName: nodeName,
      });
      // All scores are 0 if no JSDoc exists
      return {
        completenessScore: 0,
        consistencyScore: 0,
        exampleQuality: 0,
        overallScore: 0,
        issues: issues,
      };
    }

    const jsDoc = jsDocs[0]; // Focus on the first JSDoc block if multiple exist

    // 1. Description completeness and quality
    const description = jsDoc.getDescription().trim();
    if (description.length === 0) {
      issues.push({
        type: 'missing_description',
        severity: 'high',
        message: 'JSDoc description is missing or empty.',
        suggestion: 'Provide a detailed summary and description of the code element.',
        nodeName: nodeName,
      });
    } else if (description.length < 30) {
      // Arbitrary minimum length
      issues.push({
        type: 'short_description',
        severity: 'medium',
        message: `JSDoc description is too short (${description.length} chars).`,
        suggestion: 'Expand on the functionality, purpose, and usage.',
        nodeName: nodeName,
      });
    } else if (
      description.toLowerCase().includes('todo') ||
      description.toLowerCase().includes('fixme')
    ) {
      issues.push({
        type: 'overly_generic_description',
        severity: 'medium',
        message: 'JSDoc description contains "TODO" or "FIXME" markers.',
        suggestion: 'Replace placeholder text with actual documentation.',
        nodeName: nodeName,
      });
    } else {
      hasDescription = true;
      completenessScore += 40; // Significant score for a good description
    }

    // 2. Parameter and Return types (for functions/methods)
    if (Node.isFunctionLikeDeclaration(node)) {
      const typedNode = node as Node & FunctionLikeDeclaration;
      const params = typedNode.getParameters();
      const paramTags = jsDoc.getTags().filter((tag) => tag.getTagName() === 'param');

      const missingParams = params.filter(
        (p) => !paramTags.some((tag) => tag.getName() === p.getName()),
      );
      const extraParamsInTags = paramTags.filter(
        (tag) => !params.some((p) => p.getName() === tag.getName()),
      );

      if (missingParams.length > 0) {
        issues.push({
          type: 'missing_param',
          severity: 'high',
          message: `Missing @param tags for: ${missingParams.map((p) => p.getName()).join(', ')}.`,
          suggestion: `Add @param tags for all parameters with type and description.`,
          nodeName: nodeName,
        });
      }
      if (extraParamsInTags.length > 0) {
        issues.push({
          type: 'unclear_param_description', // Or `extra_param_tag`
          severity: 'low',
          message: `Extra @param tags found not matching any parameter: ${extraParamsInTags.map((t) => t.getName()).join(', ')}.`,
          suggestion: 'Remove redundant @param tags or fix parameter names.',
          nodeName: nodeName,
        });
      }
      if (params.length > 0 && missingParams.length === 0) {
        hasParams = true;
        completenessScore += 30; // Score for params
      }

      const returnTags = jsDoc
        .getTags()
        .filter((tag) => tag.getTagName() === 'returns' || tag.getTagName() === 'return');
      // Check if a return type is expected (not void) and tag is missing
      const returnType = typedNode.getReturnTypeNode(); // Get the explicitly declared return type node
      const inferredReturnType = typedNode.getReturnType(); // Get the inferred type

      // Consider missing return tag if the function actually returns something non-void
      const returnsNonVoid =
        inferredReturnType &&
        inferredReturnType.getText() !== 'void' &&
        inferredReturnType.getText() !== 'any';

      if (returnsNonVoid && returnTags.length === 0) {
        issues.push({
          type: 'missing_return',
          severity: 'medium',
          message: 'Missing @returns tag for non-void function.',
          suggestion: 'Add an @returns tag describing the return value.',
          nodeName: nodeName,
        });
      } else if (!returnsNonVoid && returnTags.length > 0) {
        issues.push({
          type: 'unclear_return_description', // Or `extra_return_tag`
          severity: 'low',
          message: 'Unnecessary @returns tag found for void function.',
          suggestion: 'Remove redundant @returns tag.',
          nodeName: nodeName,
        });
      } else if (returnsNonVoid && returnTags.length > 0) {
        hasReturns = true;
        completenessScore += 20; // Score for returns
      }
    } else {
      // For non-function-like nodes (classes, interfaces, types), the score for "params/returns" is simpler
      completenessScore += 50; // Assume full score if description is good.
    }

    // 3. Example quality
    const exampleTags = jsDoc.getTags().filter((tag) => tag.getTagName() === 'example');
    if (exampleTags.length > 0) {
      hasExample = true;
      completenessScore += 10; // Small score for presence
      exampleQuality = this.analyzeExampleQuality(exampleTags[0]); // Analyze content of first example
    } else {
      issues.push({
        type: 'missing_example',
        severity: 'low',
        message: 'Consider adding an @example tag.',
        suggestion: 'Provide a practical code example demonstrating common usage.',
        nodeName: nodeName,
      });
    }

    // Overall score calculation (can be weighted)
    // Adjust total denominator if certain checks don't apply (e.g., function-like vs. others)
    const overallScore = (completenessScore + consistencyScore + exampleQuality) / 3; // Basic average

    return {
      completenessScore: completenessScore,
      consistencyScore: consistencyScore,
      exampleQuality: exampleQuality,
      overallScore: Math.min(100, overallScore), // Cap at 100
      issues: issues,
    };
  }

  /**
   * Analyzes the content of an `@example` JSDoc tag to assess its quality.
   * @param exampleTag The JSDocTag representing the example.
   * @returns A score from 0-100 indicating example quality.
   */
  private analyzeExampleQuality(exampleTag: JSDocTag): number {
    const content = exampleTag.getCommentText() || '';
    let score = 0;

    // Presence of code block syntax
    if (content.includes('```')) {
      score += 30; // Essential for good examples
    }

    // Presence of common programming constructs suggesting actual code
    if (
      content.includes('const') ||
      content.includes('let') ||
      content.includes('function') ||
      content.includes('import')
    ) {
      score += 30;
    }
    // Presence of I/O or function calls
    if (
      content.includes('console.log') ||
      content.includes('return') ||
      content.includes('new') ||
      content.includes('await')
    ) {
      score += 20;
    }
    // Example length
    if (content.length > 80) {
      // Not too short
      score += 10;
    }
    if (content.length > 200) {
      // Provides sufficient detail
      score += 10;
    }

    return Math.min(score, 100); // Cap score at 100
  }

  /**
   * Gets a user-friendly name for a TypeScript node for logging and reporting.
   * @param node The ts-morph Node.
   * @returns A string representing the node's name or kind.
   */
  public getNodeNameForLogging(node: Node): string {
    const symbol = node.getSymbol();
    if (symbol) {
      return symbol.getName();
    }
    if (Node.isIdentifier(node)) {
      return node.getText();
    }
    if (Node.isConstructorDeclaration(node)) {
      return `constructor of ${node.getParent()?.getKindName() || 'unknown class'}`;
    }
    if (Node.hasName(node) && typeof (node as any).getName === 'function') {
      return (node as any).getName() || node.getKindName();
    }
    return node.getKindName();
  }
}
