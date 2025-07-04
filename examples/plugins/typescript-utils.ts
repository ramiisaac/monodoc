import { Plugin, NodeContext, GeneratorConfig } from '../../src/types';
import { logger } from '../../src/utils/logger';
import { BasePlugin } from '../../src/plugins/BasePlugin';

/**
 * A plugin to enhance documentation for TypeScript utility types and generic functions.
 * It provides detailed explanations for complex type definitions, generic constraints,
 * and utility type usage patterns.
 */
export class TypeScriptUtilsPlugin extends BasePlugin implements Plugin {
  name = 'typescript-utils-plugin';
  version = '1.0.0';
  description = 'Enhanced documentation for TypeScript utility types, generics, and advanced type patterns.';

  constructor(config: GeneratorConfig) {
    super(config);
  }

  /**
   * Initializes the plugin.
   */
  async initialize(config: GeneratorConfig): Promise<void> {
    await super.initialize(config);
    logger.info(`🔌 Initializing TypeScript Utils Plugin v${this.version}`);
  }

  /**
   * Lifecycle hook before processing a node.
   * Identifies TypeScript-specific patterns and extracts type information.
   */
  async beforeProcessing(context: NodeContext): Promise<NodeContext> {
    const tsMetadata = this.extractTypeScriptMetadata(context);
    
    if (tsMetadata.isTypeScriptSpecific) {
      return {
        ...context,
        customData: {
          ...context.customData,
          ...tsMetadata,
        },
      };
    }
    return context;
  }

  /**
   * Lifecycle hook after AI processing.
   * Enhances JSDoc with TypeScript-specific documentation.
   */
  async afterProcessing(context: NodeContext, result: string): Promise<string> {
    if (context.customData?.isTypeScriptSpecific) {
      return this.addTypeScriptDocumentation(result, context);
    }
    return result;
  }

  /**
   * Extracts TypeScript-specific metadata from the node context.
   */
  private extractTypeScriptMetadata(context: NodeContext): any {
    const code = context.codeSnippet;
    const metadata: any = { isTypeScriptSpecific: false };

    // Utility types
    if (this.isUtilityType(context)) {
      metadata.isTypeScriptSpecific = true;
      metadata.typeCategory = 'utility-type';
      metadata.utilityPattern = this.classifyUtilityType(code);
      metadata.typeParameters = this.extractTypeParameters(code);
    }

    // Generic functions/classes
    if (this.hasGenerics(code)) {
      metadata.isTypeScriptSpecific = true;
      metadata.typeCategory = metadata.typeCategory || 'generic';
      metadata.genericConstraints = this.extractGenericConstraints(code);
      metadata.typeParameters = this.extractTypeParameters(code);
    }

    // Conditional types
    if (this.isConditionalType(code)) {
      metadata.isTypeScriptSpecific = true;
      metadata.typeCategory = 'conditional-type';
      metadata.conditionalLogic = this.extractConditionalLogic(code);
    }

    // Mapped types
    if (this.isMappedType(code)) {
      metadata.isTypeScriptSpecific = true;
      metadata.typeCategory = 'mapped-type';
      metadata.mappingPattern = this.extractMappingPattern(code);
    }

    // Template literal types
    if (this.isTemplateLiteralType(code)) {
      metadata.isTypeScriptSpecific = true;
      metadata.typeCategory = 'template-literal-type';
      metadata.templatePattern = this.extractTemplatePattern(code);
    }

    return metadata;
  }

  /**
   * Determines if the code defines a utility type.
   */
  private isUtilityType(context: NodeContext): boolean {
    return context.nodeKind === 'TypeAliasDeclaration' &&
           (context.codeSnippet.includes('Partial<') ||
            context.codeSnippet.includes('Pick<') ||
            context.codeSnippet.includes('Omit<') ||
            context.codeSnippet.includes('Record<') ||
            context.codeSnippet.includes('Exclude<') ||
            context.codeSnippet.includes('Extract<') ||
            context.codeSnippet.includes('Required<') ||
            context.codeSnippet.includes('Readonly<'));
  }

  /**
   * Checks if the code uses generics.
   */
  private hasGenerics(code: string): boolean {
    return /<[A-Z][^>]*>/.test(code) || /\<T\b/.test(code);
  }

  /**
   * Determines if the code defines a conditional type.
   */
  private isConditionalType(code: string): boolean {
    return /\?\s*.*:\s*.*/.test(code) && code.includes('extends');
  }

  /**
   * Determines if the code defines a mapped type.
   */
  private isMappedType(code: string): boolean {
    return /\{\s*\[.*in.*\]/.test(code);
  }

  /**
   * Determines if the code uses template literal types.
   */
  private isTemplateLiteralType(code: string): boolean {
    return /`[^`]*\$\{[^}]+\}[^`]*`/.test(code);
  }

  /**
   * Classifies the type of utility pattern being used.
   */
  private classifyUtilityType(code: string): string {
    if (code.includes('Partial<')) return 'Partial - makes all properties optional';
    if (code.includes('Required<')) return 'Required - makes all properties required';
    if (code.includes('Readonly<')) return 'Readonly - makes all properties readonly';
    if (code.includes('Pick<')) return 'Pick - selects specific properties';
    if (code.includes('Omit<')) return 'Omit - excludes specific properties';
    if (code.includes('Record<')) return 'Record - creates object type with specific keys and values';
    if (code.includes('Exclude<')) return 'Exclude - excludes types from union';
    if (code.includes('Extract<')) return 'Extract - extracts types from union';
    if (code.includes('NonNullable<')) return 'NonNullable - removes null and undefined';
    if (code.includes('ReturnType<')) return 'ReturnType - extracts function return type';
    if (code.includes('Parameters<')) return 'Parameters - extracts function parameter types';
    return 'custom utility type';
  }

  /**
   * Extracts type parameters from generic declarations.
   */
  private extractTypeParameters(code: string): string[] {
    const typeParams: string[] = [];
    const genericMatch = code.match(/<([^>]+)>/);
    
    if (genericMatch) {
      const params = genericMatch[1].split(',').map(p => p.trim());
      params.forEach(param => {
        const paramName = param.split(/\s+extends\s+/)[0].trim();
        if (paramName) typeParams.push(paramName);
      });
    }
    
    return typeParams;
  }

  /**
   * Extracts generic constraints from type parameters.
   */
  private extractGenericConstraints(code: string): Record<string, string> {
    const constraints: Record<string, string> = {};
    const genericMatch = code.match(/<([^>]+)>/);
    
    if (genericMatch) {
      const params = genericMatch[1].split(',').map(p => p.trim());
      params.forEach(param => {
        const constraintMatch = param.match(/(\w+)\s+extends\s+(.+)/);
        if (constraintMatch) {
          constraints[constraintMatch[1]] = constraintMatch[2];
        }
      });
    }
    
    return constraints;
  }

  /**
   * Extracts conditional type logic.
   */
  private extractConditionalLogic(code: string): string {
    const condMatch = code.match(/(\w+)\s+extends\s+([^?]+)\s*\?\s*([^:]+)\s*:\s*(.+)/);
    if (condMatch) {
      return `If ${condMatch[1]} extends ${condMatch[2]}, then ${condMatch[3]}, otherwise ${condMatch[4]}`;
    }
    return 'conditional type logic';
  }

  /**
   * Extracts mapping pattern from mapped types.
   */
  private extractMappingPattern(code: string): string {
    const mapMatch = code.match(/\{\s*\[(\w+)\s+in\s+([^\]]+)\]\s*:\s*([^}]+)\s*\}/);
    if (mapMatch) {
      return `Maps each ${mapMatch[1]} in ${mapMatch[2]} to type ${mapMatch[3]}`;
    }
    return 'mapped type pattern';
  }

  /**
   * Extracts template pattern from template literal types.
   */
  private extractTemplatePattern(code: string): string {
    const templateMatch = code.match(/`([^`]*)`/);
    if (templateMatch) {
      const pattern = templateMatch[1];
      const placeholders = pattern.match(/\$\{[^}]+\}/g) || [];
      return `Template pattern: ${pattern} with placeholders: ${placeholders.join(', ')}`;
    }
    return 'template literal pattern';
  }

  /**
   * Adds TypeScript-specific documentation to JSDoc.
   */
  private addTypeScriptDocumentation(currentJsDoc: string, context: NodeContext): string {
    const metadata = context.customData;
    let enhanced = currentJsDoc;

    // Add type category information
    if (metadata.typeCategory) {
      enhanced += `\n@category ${metadata.typeCategory}`;
    }

    // Add specific documentation based on category
    switch (metadata.typeCategory) {
      case 'utility-type':
        enhanced += this.addUtilityTypeDocumentation(metadata);
        break;
      case 'generic':
        enhanced += this.addGenericDocumentation(metadata);
        break;
      case 'conditional-type':
        enhanced += this.addConditionalTypeDocumentation(metadata);
        break;
      case 'mapped-type':
        enhanced += this.addMappedTypeDocumentation(metadata);
        break;
      case 'template-literal-type':
        enhanced += this.addTemplateLiteralDocumentation(metadata);
        break;
    }

    // Add type parameters documentation
    if (metadata.typeParameters?.length > 0) {
      enhanced += `\n@typeParam Available type parameters: ${metadata.typeParameters.join(', ')}`;
    }

    // Add constraints documentation
    if (metadata.genericConstraints && Object.keys(metadata.genericConstraints).length > 0) {
      const constraintEntries = Object.entries(metadata.genericConstraints)
        .map(([param, constraint]) => `${param} extends ${constraint}`)
        .join(', ');
      enhanced += `\n@constraints ${constraintEntries}`;
    }

    return enhanced;
  }

  /**
   * Adds utility type specific documentation.
   */
  private addUtilityTypeDocumentation(metadata: any): string {
    let docs = '';
    
    if (metadata.utilityPattern) {
      docs += `\n@utility ${metadata.utilityPattern}`;
    }
    
    docs += `\n@example
// Usage example:
type Example = ${metadata.utilityPattern.split(' - ')[0]}<OriginalType>;`;
    
    return docs;
  }

  /**
   * Adds generic function/class documentation.
   */
  private addGenericDocumentation(metadata: any): string {
    let docs = '';
    
    if (metadata.typeParameters?.length > 0) {
      metadata.typeParameters.forEach((param: string) => {
        docs += `\n@template ${param} - Generic type parameter`;
      });
    }
    
    return docs;
  }

  /**
   * Adds conditional type documentation.
   */
  private addConditionalTypeDocumentation(metadata: any): string {
    let docs = '';
    
    if (metadata.conditionalLogic) {
      docs += `\n@conditional ${metadata.conditionalLogic}`;
    }
    
    docs += `\n@example
// Conditional type usage:
type Result = ConditionalType<SomeType>;`;
    
    return docs;
  }

  /**
   * Adds mapped type documentation.
   */
  private addMappedTypeDocumentation(metadata: any): string {
    let docs = '';
    
    if (metadata.mappingPattern) {
      docs += `\n@mapping ${metadata.mappingPattern}`;
    }
    
    docs += `\n@example
// Mapped type usage:
type Mapped = MappedType<OriginalType>;`;
    
    return docs;
  }

  /**
   * Adds template literal type documentation.
   */
  private addTemplateLiteralDocumentation(metadata: any): string {
    let docs = '';
    
    if (metadata.templatePattern) {
      docs += `\n@template-literal ${metadata.templatePattern}`;
    }
    
    docs += `\n@example
// Template literal type usage:
type StringType = TemplateLiteralType<"prefix", "suffix">;`;
    
    return docs;
  }
}