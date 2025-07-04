import { NodeContext, GeneratorConfig } from '../types';
import { logger } from '../utils/logger';
import { DynamicTemplateSystem } from './DynamicTemplateSystem';
import Handlebars from 'handlebars'; // Import Handlebars for template compilation

/**
 * Defines a documentation strategy, including its name, priority,
 * a function to determine if it can handle a given node context,
 * and a function to generate documentation using a template.
 */
export interface DocumentationStrategy {
  name: string;
  priority: number; // Higher number means higher priority
  canHandle(context: NodeContext): boolean;
  // generate returns the name of the template to use
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
      getTemplateName: (context) => 'react-component',
    });
    this.strategies.push({
      name: 'api-endpoint',
      priority: 90,
      canHandle: (context) => this.isApiEndpoint(context),
      getTemplateName: (context) => 'api-endpoint',
    });
    this.strategies.push({
      name: 'utility-function',
      priority: 80,
      canHandle: (context) => this.isUtilityFunction(context),
      getTemplateName: (context) => 'utility-function',
    });
    this.strategies.push({
      name: 'class-method',
      priority: 70,
      canHandle: (context) => context.nodeKind === 'MethodDeclaration',
      getTemplateName: (context) => 'generic', // Could have a specific one
    });
    this.strategies.push({
      name: 'interface',
      priority: 60,
      canHandle: (context) => context.nodeKind === 'InterfaceDeclaration',
      getTemplateName: (context) => 'generic',
    });
    this.strategies.push({
      name: 'type-alias',
      priority: 50,
      canHandle: (context) => context.nodeKind === 'TypeAliasDeclaration',
      getTemplateName: (context) => 'generic',
    });
    this.strategies.push({
      name: 'class',
      priority: 40,
      canHandle: (context) => context.nodeKind === 'ClassDeclaration',
      getTemplateName: (context) => 'generic',
    });
    this.strategies.push({
      name: 'generic',
      priority: 1, // Lowest priority, acts as a fallback
      canHandle: () => true, // Always matches
      getTemplateName: (context) => 'generic',
    });

    // Sort strategies by priority in descending order
    this.strategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Registers custom Handlebars helpers for template rendering.
   */
  private registerHandlebarsHelpers(): void {
    Handlebars.registerHelper('json', function (context) {
      return JSON.stringify(context);
    });
    Handlebars.registerHelper('if', function (conditional, options) {
      if (conditional) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });
    Handlebars.registerHelper('each', function (context, options) {
      let ret = '';
      if (context && context.length > 0) {
        for (let i = 0; i < context.length; i++) {
          ret = ret + options.fn(context[i]);
        }
      } else {
        ret = options.inverse(this);
      }
      return ret;
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
        `No documentation strategy found for node: ${context.nodeName}. Falling back to generic.`,
      );
      // This case should ideally not happen due to the 'generic' fallback strategy
      return this.generateGenericDoc(context);
    }

    const templateName = strategy.getTemplateName(context);
    logger.debug(
      `Using strategy '${strategy.name}' with template '${templateName}' for ${context.nodeName} (${context.nodeKind}).`,
    );

    const templateContent = await this.templateSystem.getTemplate(templateName);

    // Compile the template if not already compiled
    if (!this.compiledTemplates.has(templateName)) {
      this.compiledTemplates.set(templateName, Handlebars.compile(templateContent));
    }
    const template = this.compiledTemplates.get(templateName)!;

    // Prepare data based on the selected strategy's template needs
    let templateData: any;
    switch (templateName) {
      case 'react-component':
        templateData = this.getReactComponentTemplateData(context, config);
        break;
      case 'api-endpoint':
        templateData = this.getApiEndpointTemplateData(context, config);
        break;
      case 'utility-function':
        templateData = this.getUtilityFunctionTemplateData(context, config);
        break;
      case 'generic':
      default:
        templateData = this.getGenericTemplateData(context, config);
        break;
    }

    // Add common data fields for all templates
    templateData.nodeName = context.nodeName;
    templateData.nodeKind = context.nodeKind;
    templateData.signatureDetails = context.signatureDetails;
    templateData.fileContext = context.fileContext;
    templateData.packageContext = context.packageContext;
    templateData.codeSnippet = context.codeSnippet;
    templateData.relevantImports = context.relevantImports;
    templateData.surroundingContext = context.surroundingContext;
    templateData.symbolUsages = context.symbolUsages;
    templateData.relatedSymbols = context.relatedSymbols;
    templateData.parameters = context.parameters;
    templateData.returnType = context.returnType;
    templateData.isAsync = context.isAsync;
    templateData.isExported = context.isExported;
    templateData.accessModifier = context.accessModifier;
    templateData.generateExamples = config.jsdocConfig.generateExamples; // Pass config flag to template

    try {
      return template(templateData);
    } catch (templateError) {
      logger.error(
        `Error rendering template '${templateName}' for ${context.nodeName}: ${templateError instanceof Error ? templateError.message : String(templateError)}`,
      );
      // Fallback to generic template if specific template rendering fails
      return this.generateGenericDoc(context);
    }
  }

  // --- Strategy Matching Logic ---

  /**
   * Determines if a node context represents a React functional component.
   * @param context The NodeContext.
   * @returns True if it's a React component, false otherwise.
   */
  private isReactComponent(context: NodeContext): boolean {
    return (
      context.codeSnippet.includes('JSX.Element') ||
      context.codeSnippet.includes('React.FC') ||
      /return\s*<[A-Za-z]/.test(context.codeSnippet) || // Basic JSX return check
      (context.nodeKind === 'FunctionDeclaration' && context.nodeName.match(/^[A-Z]/)) // Capitalized function name
    );
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
   * @param config The GeneratorConfig.
   * @returns Data for the React component template.
   */
  private getReactComponentTemplateData(
    context: NodeContext,
    config: GeneratorConfig,
  ): ReactComponentTemplateData {
    // Extract prop types from interface or type alias definitions within the component's scope
    const propTypes = this.extractPropTypes(context.codeSnippet);
    const hookUsage = this.analyzeHookUsage(context.codeSnippet);
    const componentType = this.getReactComponentType(context.codeSnippet);

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
   * Extracts prop names from a React component's code snippet.
   * This looks for `interface XProps { ... }` or `type XProps = { ... }`.
   * @param code The component's code snippet.
   * @returns An array of prop names.
   */
  private extractPropTypes(code: string): string[] {
    const propNames: string[] = [];
    const interfaceMatch = code.match(/(interface|type)\s+(\w+Props)\s*\{([^}]+)\}/s); // `s` for dotall
    if (interfaceMatch && interfaceMatch[3]) {
      const propDefinitions = interfaceMatch[3];
      // Regex to find `propName: type;` or `propName?: type;`
      const propRegex = /(\w+)\s*[\?:-]\s*[^;,\n]+/g;
      let match;
      while ((match = propRegex.exec(propDefinitions)) !== null) {
        propNames.push(match[1]);
      }
    }
    // Also consider direct destructuring in function parameters
    const destructuringMatch = code.match(/function\s+\w+\s*\((?:\{\s*([^}]+)\s*\})?\s*\)/);
    if (destructuringMatch && destructuringMatch[1]) {
      const destructuredProps = destructuringMatch[1]
        .split(',')
        .map((p) => p.trim().split(':')[0].trim())
        .filter(Boolean);
      propNames.push(...destructuredProps);
    }

    return [...new Set(propNames)]; // Deduplicate
  }

  /**
   * Analyzes a React component's code for common hook usage.
   * @param code The component's code snippet.
   * @returns An array of hook names used (e.g., 'useState', 'useEffect').
   */
  private analyzeHookUsage(code: string): string[] {
    const hooks = [
      'useState',
      'useEffect',
      'useContext',
      'useReducer',
      'useCallback',
      'useMemo',
      'useRef',
      'useRouter',
      'useSWR',
    ];
    return hooks.filter((hook) => code.includes(hook));
  }

  /**
   * Determines the type of React component (e.g., functional, class, memoized).
   * @param code The component's code snippet.
   * @returns A string describing the component type.
   */
  private getReactComponentType(code: string): string {
    if (code.includes('React.memo') || code.includes('memo(')) return 'memoized functional';
    if (code.includes('forwardRef')) return 'forwarded-ref functional';
    if (code.includes('class') && code.includes('extends React.Component')) return 'class';
    return 'functional';
  }

  /**
   * Prepares data specific to API endpoint templates.
   * @param context The NodeContext.
   * @param config The GeneratorConfig.
   * @returns Data for the API endpoint template.
   */
  private getApiEndpointTemplateData(
    context: NodeContext,
    config: GeneratorConfig,
  ): ApiEndpointTemplateData {
    const httpMethod = this.extractHttpMethod(context.codeSnippet);
    const fullRoutePath = this.extractEndpointPath(context.fileContext);
    const middleware = this.extractMiddleware(context.codeSnippet); // Extract middleware if identifiable

    return {
      method: httpMethod,
      endpoint: fullRoutePath.replace(/^\/api\//, '/'), // Display path without /api prefix
      fullRoutePath: fullRoutePath,
      hasAuth:
        context.codeSnippet.includes('auth') ||
        context.codeSnippet.includes('authenticate') ||
        context.codeSnippet.includes('authorize'),
      middleware: middleware,
    };
  }

  /**
   * Extracts the HTTP method from an API route handler code snippet.
   * @param code The code snippet.
   * @returns The HTTP method (e.g., 'GET', 'POST'), or 'UNKNOWN'.
   */
  private extractHttpMethod(code: string): string {
    const match = code.match(
      /export\s+(default\s+)?(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/,
    );
    return match ? match[3] : 'UNKNOWN';
  }

  /**
   * Extracts the API endpoint path from the file context.
   * Assumes a conventional `/pages/api/` or `/src/routes/api/` structure.
   * @param filePath The full file path.
   * @returns The extracted API endpoint path.
   */
  private extractEndpointPath(filePath: string): string {
    const apiIndex = filePath.indexOf('/api/');
    if (apiIndex !== -1) {
      let route = filePath.substring(apiIndex + 4); // Get part after '/api/'
      route = route.replace(/\.[^/.]+$/, ''); // Remove file extension
      route = route.replace(/\[([^\]]+)\]/g, ':$1'); // Replace [param] with :param for express-style
      return route;
    }
    const routesIndex = filePath.indexOf('/routes/');
    if (routesIndex !== -1) {
      let route = filePath.substring(routesIndex + 7);
      route = route.replace(/\.[^/.]+$/, '');
      route = route.replace(/\[([^\]]+)\]/g, ':$1');
      return route;
    }
    return '/unknown';
  }

  /**
   * Extracts common middleware names from an API route handler code.
   * @param code The code snippet.
   * @returns An array of identified middleware names.
   */
  private extractMiddleware(code: string): string[] {
    const middleware: string[] = [];
    if (code.includes('authenticate') || code.includes('authMiddleware'))
      middleware.push('authentication');
    if (code.includes('authorize') || code.includes('permissionMiddleware'))
      middleware.push('authorization');
    if (code.includes('validate') || code.includes('schema')) middleware.push('validation');
    if (code.includes('rateLimit')) middleware.push('rate-limiting');
    if (code.includes('cors')) middleware.push('CORS');
    return [...new Set(middleware)]; // Deduplicate
  }

  /**
   * Prepares data specific to utility function templates.
   * @param context The NodeContext.
   * @param config The GeneratorConfig.
   * @returns Data for the utility function template.
   */
  private getUtilityFunctionTemplateData(
    context: NodeContext,
    config: GeneratorConfig,
  ): UtilityFunctionTemplateData {
    return {
      functionName: context.nodeName,
      isAsync: context.isAsync || false, // Use NodeContext property
      isGeneric: context.codeSnippet.includes('<T>') || context.signatureDetails.includes('<T>'), // Check for generics
    };
  }

  /**
   * Prepares data for generic templates, suitable for any node type.
   * @param context The NodeContext.
   * @param config The GeneratorConfig.
   * @returns Data for the generic template.
   */
  private getGenericTemplateData(
    context: NodeContext,
    config: GeneratorConfig,
  ): GenericTemplateData {
    return {
      name: context.nodeName,
      nodeType: context.nodeType || context.nodeKind,
      hasParameters: (context.parameters?.length || 0) > 0,
      hasReturnType: !!context.returnType && context.returnType !== 'void',
      isExported: context.isExported || false,
      accessModifier: context.accessModifier,
    };
  }

  /**
   * A fallback function to generate a basic JSDoc comment if no specific template/strategy matches
   * or if template rendering fails. This ensures there's always some output.
   * @param context The NodeContext.
   * @returns A basic JSDoc string.
   */
  private async generateGenericDoc(context: NodeContext): Promise<string> {
    const defaultTemplateContent = await this.templateSystem.getTemplate('generic');
    const template = Handlebars.compile(defaultTemplateContent);
    return template(this.getGenericTemplateData(context, {} as any)); // Use minimal data for fallback
  }
}
