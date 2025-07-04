import { TemplateSystem } from './TemplateSystem';
import { logger } from '../utils/logger';
import { NodeContext, GeneratorConfig } from '../types';
import Handlebars from 'handlebars';

/**
 * Extends the base `TemplateSystem` to provide dynamic loading and management
 * of Handlebars templates for different documentation strategies.
 */
export class DynamicTemplateSystem extends TemplateSystem {
  /**
   * Loads a template by name, with caching and error handling.
   * @param templateName The name of the template to load.
   * @returns The template content as a string.
   */
  async getTemplate(templateName: string): Promise<string> {
    // First, try to load from the base class (which may load from cache)
    let templateContent = await super.getTemplate(templateName);

    // If not found, attempt to load from a specific directory structure
    if (!templateContent) {
      const fallbackPath = `src/templates/docs/${templateName}.hbs`;
      logger.info(`Template not found in cache, loading from fallback path: ${fallbackPath}`);
      templateContent = await super.getTemplate(fallbackPath);
    }

    // If the template is still not found, throw an error
    if (!templateContent) {
      throw new Error(`Template '${templateName}' not found in system.`);
    }

    return templateContent;
  }
}

/**
 * Defines a documentation strategy, including its name, priority,
 * a function to determine if it can handle a given node context,
 * and a function to generate documentation using a template.
 */
export interface DocumentationStrategy {
  name: string;
  priority: number; // Higher number means higher priority
  canHandle(context: NodeContext): boolean;
  // getTemplateName returns the name of the template to use
  getTemplateName(context: NodeContext): string;
}

/**
 * Interface for data passed to Handlebars templates for React components.
 */
interface ReactComponentTemplateData {
  componentName: string;
  hasProps: boolean;
  usesHooks: boolean;
  componentType: string;
  reactProps: string[]; // List of prop names
  hooksUsed: string[]; // List of hook names used
}

/**
 * Interface for data passed to Handlebars templates for API endpoints.
 */
interface ApiEndpointTemplateData {
  method: string;
  endpoint: string;
  hasAuth: boolean;
  middleware: string[]; // e.g., ['authentication', 'validation']
  fullRoutePath: string; // The full path from file system
}

/**
 * Interface for data passed to Handlebars templates for utility functions.
 */
interface UtilityFunctionTemplateData {
  functionName: string;
  isAsync: boolean;
  isGeneric: boolean;
}

/**
 * Interface for data passed to Handlebars templates for generic nodes.
 */
interface GenericTemplateData {
  name: string;
  nodeType: string;
  hasParameters: boolean;
  hasReturnType: boolean;
  isExported: boolean;
  accessModifier?: string;
  // Add more general properties from NodeContext that all templates might use
  codeSnippet: string;
  fileContext: string;
  packageContext: string;
  relevantImports?: string[];
  surroundingContext?: string;
  symbolUsages?: unknown[]; // Simplified for template data
  relatedSymbols?: unknown[]; // Simplified for template data
  parameters?: Array<{ name: string; type: string; optional: boolean }>;
  returnType?: string;
  isAsync: boolean;
  // Pass config flags that affect template rendering (e.g., generateExamples)
  generateExamples: boolean;
  // Pass any customData from NodeContext if plugins add it
  customData?: Record<string, unknown>;
}

/**
 * The SmartDocumentationEngine intelligently selects the most appropriate documentation strategy
 * and template for a given TypeScript node based on its context and code characteristics.
 * It uses a priority-based system to match strategies and applies Handlebars templates.
 */
export class SmartDocumentationEngine {
  private strategies: DocumentationStrategy[] = [];
  private templateSystem: DynamicTemplateSystem;
  private compiledTemplates: Map<string, Handlebars.TemplateDelegate> = new Map();

  constructor() {
    this.templateSystem = new DynamicTemplateSystem();
    this.initializeStrategies();
    this.registerHandlebarsHelpers();
  }

  /**
   * Initializes the predefined documentation strategies and sorts them by priority.
   */
  private initializeStrategies(): void {
    this.strategies.push({
      name: 'react-component',
      priority: 100, // Highest priority for specific component types
      canHandle: (context) => this.isReactComponent(context),
      getTemplateName: (_context) => 'react-component', // Unused _context lint fix
    });
    this.strategies.push({
      name: 'api-endpoint',
      priority: 90,
      canHandle: (context) => this.isApiEndpoint(context),
      getTemplateName: (_context) => 'api-endpoint', // Unused _context lint fix
    });
    this.strategies.push({
      name: 'utility-function',
      priority: 80,
      canHandle: (context) => this.isUtilityFunction(context),
      getTemplateName: (_context) => 'utility-function', // Unused _context lint fix
    });
    this.strategies.push({
      name: 'class-method',
      priority: 70,
      canHandle: (context) => context.nodeKind === 'MethodDeclaration',
      getTemplateName: (_context) => 'generic', // Could have a specific one // Unused _context lint fix
    });
    this.strategies.push({
      name: 'interface',
      priority: 60,
      canHandle: (context) => context.nodeKind === 'InterfaceDeclaration',
      getTemplateName: (_context) => 'generic', // Unused _context lint fix
    });
    this.strategies.push({
      name: 'type-alias',
      priority: 50,
      canHandle: (context) => context.nodeKind === 'TypeAliasDeclaration',
      getTemplateName: (_context) => 'generic', // Unused _context lint fix
    });
    this.strategies.push({
      name: 'class',
      priority: 40,
      canHandle: (context) => context.nodeKind === 'ClassDeclaration',
      getTemplateName: (_context) => 'generic', // Unused _context lint fix
    });
    this.strategies.push({
      name: 'generic',
      priority: 1, // Lowest priority, acts as a fallback
      canHandle: () => true, // Always matches
      getTemplateName: (_context) => 'generic', // Unused _context lint fix
    });

    // Sort strategies by priority in descending order
    this.strategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Registers custom Handlebars helpers for template rendering.
   */
  private registerHandlebarsHelpers(): void {
    Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
    Handlebars.registerHelper('neq', (a: unknown, b: unknown) => a !== b);
    Handlebars.registerHelper('if_eq', function (this: unknown, a, b, options) {
      // Corrected `any` usage
      if (a === b) {
        return options.fn(this);
      }
      return options.inverse(this);
    });
  }

  /**
   * Generates JSDoc documentation for a given node context by selecting and applying a template.
   * @param context The NodeContext for which to generate documentation.
   * @param config The GeneratorConfig (can influence template behavior, e.g., example generation).
   * @returns A Promise resolving to the generated JSDoc string.
   */
  async generateDocumentation(context: NodeContext, config: GeneratorConfig): Promise<string> {
    const strategy = this.strategies.find((s) => s.canHandle(context));
    if (!strategy) {
      logger.warn(
        `No suitable documentation strategy found for ${context.nodeName}. Falling back to generic.`,
      );
      return this.generateGenericDoc(context, config);
    }

    const templateName = strategy.getTemplateName(context);
    const templateContent = await this.templateSystem.getTemplate(templateName);

    // Compile the template if not already compiled
    if (!this.compiledTemplates.has(templateName)) {
      this.compiledTemplates.set(templateName, Handlebars.compile(templateContent));
    }
    const compiledTemplate = this.compiledTemplates.get(templateName)!;

    // Prepare data for the template
    let templateData: Record<string, unknown>; // Use a generic record for data
    switch (templateName) {
      case 'react-component': {
        const data = this.getReactComponentTemplateData(context, config);
        templateData = data as unknown as Record<string, unknown>;
        break;
      }
      case 'api-endpoint': {
        const data = this.getApiEndpointTemplateData(context, config);
        templateData = data as unknown as Record<string, unknown>;
        break;
      }
      case 'utility-function': {
        const data = this.getUtilityFunctionTemplateData(context, config);
        templateData = data as unknown as Record<string, unknown>;
        break;
      }
      case 'generic':
      default: {
        const data = this.getGenericTemplateData(context, config);
        templateData = data as unknown as Record<string, unknown>;
        break;
      }
    }

    try {
      return compiledTemplate(templateData).trim();
    } catch (error) {
      logger.error(
        `Error rendering template '${templateName}' for node ${context.nodeName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.generateGenericDoc(context, config); // Fallback to generic on error
    }
  }

  // --- Strategy Matching Logic ---

  /**
   * Determines if a node context represents a React functional component.
   * @param context The NodeContext.
   * @returns True if it's a React component, false otherwise.
   */
  private isReactComponent(context: NodeContext): boolean {
    const hasJSXElements = context.codeSnippet.includes('JSX.Element');
    const hasReactFC = context.codeSnippet.includes('React.FC');
    const hasJSXReturnPattern = /return\s*<[A-Za-z]/.test(context.codeSnippet);
    const isCapitalizedFunction =
      context.nodeKind === 'FunctionDeclaration' && !!context.nodeName.match(/^[A-Z]/);

    return hasJSXElements || hasReactFC || hasJSXReturnPattern || isCapitalizedFunction;
  }

  /**
   * Determines if a node context represents an API endpoint handler.
   * @param context The NodeContext.
   * @returns True if it's an API endpoint, false otherwise.
   */
  private isApiEndpoint(context: NodeContext): boolean {
    return (
      context.fileContext.includes('/api/') || // Conventional API route directory
      context.fileContext.includes('/routes/') || // Another common API route directory
      /export\s+(default\s+)?(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/.test(
        // Removed unnecessary escape character
        context.codeSnippet,
      ) // Common HTTP method export patterns
    );
  }

  /**
   * Determines if a node context represents a general utility function.
   * @param context The NodeContext.
   * @returns True if it's a utility function, false otherwise.
   */
  private isUtilityFunction(context: NodeContext): boolean {
    return (
      context.fileContext.includes('/utils/') ||
      context.fileContext.includes('/helpers/') ||
      /^(is|has|get|set|format|parse|validate|transform|create|update|delete|find|calculate|apply)/.test(
        context.nodeName,
      ) // Common utility function prefixes
    );
  }

  // --- Template Data Preparation ---

  /**
   * Prepares data specific to React component templates.
   * @param context The NodeContext.
   * @param _config The GeneratorConfig. (Marked as unused with _)
   * @returns Data for the React component template.
   */
  private getReactComponentTemplateData(
    context: NodeContext,
    _config: GeneratorConfig,
  ): ReactComponentTemplateData {
    // These properties are expected to be in customData if the ReactComponentPlugin ran
    const propTypes = (context.customData?.reactProps as string[]) || [];
    const hookUsage = (context.customData?.hooksUsed as string[]) || [];
    const componentType = (context.customData?.componentType as string) || 'functional';

    return {
      componentName: context.nodeName,
      hasProps: propTypes.length > 0,
      usesHooks: hookUsage.length > 0,
      componentType: componentType,
      reactProps: propTypes,
      hooksUsed: hookUsage,
    };
  }

  /**
   * Prepares data specific to API endpoint templates.
   * @param context The NodeContext.
   * @param _config The GeneratorConfig. (Marked as unused with _)
   * @returns Data for the API endpoint template.
   */
  private getApiEndpointTemplateData(
    context: NodeContext,
    _config: GeneratorConfig,
  ): ApiEndpointTemplateData {
    // These properties are expected to be in customData if the ApiDocumentationPlugin ran
    const httpMethod = (context.customData?.httpMethod as string) || 'UNKNOWN';
    const routePath = (context.customData?.routePath as string) || '/unknown';
    const middleware = (context.customData?.middleware as string[]) || [];

    return {
      method: httpMethod,
      endpoint: routePath.replace(/^\/api\//, '/'), // Display path without /api prefix
      fullRoutePath: routePath,
      hasAuth: !!context.customData?.hasAuth,
      middleware: middleware,
    };
  }

  /**
   * Prepares data specific to utility function templates.
   * @param context The NodeContext.
   * @param _config The GeneratorConfig. (Marked as unused with _)
   * @returns Data for the utility function template.
   */
  private getUtilityFunctionTemplateData(
    context: NodeContext,
    _config: GeneratorConfig,
  ): UtilityFunctionTemplateData {
    return {
      functionName: context.nodeName,
      isAsync: context.isAsync || false,
      isGeneric: context.codeSnippet.includes('<T>') || context.signatureDetails.includes('<T>'), // Check for generics
    };
  }

  /**
   * Prepares data for generic templates, suitable for any node type.
   * @param context The NodeContext.
   * @param config The GeneratorConfig. (Marked as used for `generateExamples`)
   * @returns Data for the generic template.
   */
  private getGenericTemplateData(
    context: NodeContext,
    config: GeneratorConfig,
  ): GenericTemplateData {
    return {
      name: context.nodeName,
      nodeType: context.nodeKind,
      hasParameters: (context.parameters || []).length > 0,
      hasReturnType: !!context.returnType,
      isExported: !!context.isExported,
      accessModifier: context.accessModifier,
      codeSnippet: context.codeSnippet,
      fileContext: context.fileContext,
      packageContext: context.packageContext,
      relevantImports: context.relevantImports,
      surroundingContext: context.surroundingContext,
      symbolUsages: context.symbolUsages as unknown[], // Corrected `any` usage
      relatedSymbols: context.relatedSymbols as unknown[], // Corrected `any` usage
      parameters: context.parameters,
      returnType: context.returnType,
      isAsync: !!context.isAsync,
      generateExamples: config.jsdocConfig.generateExamples, // Pass example generation flag
      customData: context.customData,
    };
  }
  private async generateGenericDoc(context: NodeContext, config: GeneratorConfig): Promise<string> {
    // Fallback to a very basic, manually constructed JSDoc string
    const params = (context.parameters || [])
      .map((p) => `   * @param {${p.type}} ${p.name} - Description for ${p.name}.`)
      .join('\n');
    const returns = context.returnType
      ? `   * @returns {${context.returnType}} - Description of return value.`
      : '';

    return `/**
   * @summary ${context.nodeName}
   * @description A basic description for ${context.nodeName}.
${params ? `${params}\n` : ''}${returns ? `${returns}\n` : ''}   */`;
  }
}
