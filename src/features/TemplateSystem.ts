import { NodeContext, GeneratorConfig } from '../types';
import { logger } from '../utils/logger';

/**
 * Defines the structure for a JSDoc template.
 * `pattern` is kept for historical context but actual matching
 * is typically handled by `SmartDocumentationEngine`.
 * `generate` now returns raw string content, to be compiled by Handlebars elsewhere.
 */
export interface JSDocTemplate {
  name: string;
  description: string;
  pattern: RegExp; // Still here for potential external use or legacy pattern matching
  // generate now returns the raw template string, not a compiled function
  generate: (context: NodeContext, config: GeneratorConfig) => string;
}

/**
 * Base class for managing JSDoc templates.
 * It registers a set of default templates that can be extended or overridden
 * by more dynamic template systems.
 */
export class TemplateSystem {
  // Store templates in a Map for efficient lookup by name
  protected templates: Map<string, JSDocTemplate> = new Map();

  constructor() {
    this.registerDefaultTemplates(); // Register initial templates upon instantiation
  }

  /**
   * Registers a set of standard, default JSDoc templates.
   * These are basic templates for common code structures.
   */
  private registerDefaultTemplates(): void {
    // Register basic generic template
    this.registerTemplate({
      name: 'generic',
      description: 'Default template for any code element',
      pattern: /.*/, // Matches everything if used for pattern matching
      generate: (context, config) =>
        `
/**
 * @summary {{nodeName}}
 * @description This is a generic documentation for a TypeScript {{nodeKind}} named \`{{nodeName}}\`.
 * It provides basic information about its purpose.
 *
 {{#if parameters}}
 * @param {object} args - The arguments for this {{nodeKind}}.
 {{#each parameters}}
 * @param {{{{type}}}} {{name}} - {{#if optional}}[Optional] {{/if}}Description for parameter {{name}}.
 {{/each}}
 {{/if}}
 {{#if returnType}}
 * @returns {{{{returnType}}}} The result of this {{nodeKind}}.
 {{/if}}
 {{#if generateExamples}}
 * @example
 * \`\`\`typescript
 * // Example usage for {{nodeName}}
 * {{#if (eq nodeKind 'FunctionDeclaration')}}
 * const result = {{nodeName}}();
 * {{else if (eq nodeKind 'ClassDeclaration')}}
 * const instance = new {{nodeName}}();
 * {{else}}
 * // No specific example generated for this kind.
 * const value = {{nodeName}};
 * {{/if}}
 * \`\`\`
 {{/if}}
 * @remarks
 * This documentation was generated using a generic template.
 */
`.trim(),
    });

    // Register other default templates if they are fundamental and not part of DynamicTemplateSystem's advanced set
    // The `DynamicTemplateSystem` will register more specific templates that might override these.
    // For now, these are the only templates directly registered by this base class.
    logger.debug('Base TemplateSystem initialized with default generic template.');
  }

  /**
   * Registers a new JSDoc template. If a template with the same name already exists,
   * it will be overwritten.
   * @param template The JSDocTemplate object to register.
   */
  registerTemplate(template: JSDocTemplate): void {
    this.templates.set(template.name, template);
  }

  /**
   * Finds a template by its name.
   * @param name The name of the template to retrieve.
   * @returns The JSDocTemplate object, or null if not found.
   */
  getTemplateByName(name: string): JSDocTemplate | null {
    return this.templates.get(name) || null;
  }

  /**
   * Finds a matching template based on a node's context.
   * This method is generally less used directly now that `SmartDocumentationEngine`
   * handles more complex strategy matching. However, it can be used for simple pattern-based lookups.
   * @param context The NodeContext to match against.
   * @returns The first matching JSDocTemplate, or null if no match is found.
   */
  findMatchingTemplate(context: NodeContext): JSDocTemplate | null {
    for (const template of this.templates.values()) {
      if (template.pattern.test(context.codeSnippet)) {
        return template;
      }
    }
    return null;
  }
}
