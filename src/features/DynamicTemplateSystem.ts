import { TemplateSystem } from './TemplateSystem';
import { logger } from '../utils/logger';

/**
 * Extends the base `TemplateSystem` to provide dynamic loading and management
 * of JSDoc templates, including advanced and custom templates.
 * It ensures a fallback to generic templates if specific ones are not found.
 */
export class DynamicTemplateSystem extends TemplateSystem {
  // `customTemplates` are now managed internally, effectively replacing `templates` map in base class
  // or extending it. For this implementation, we will add to the base's `templates` map directly.
  // The `templates` map in the `TemplateSystem` is inherited and used.

  constructor() {
    super(); // Call base class constructor to register default templates
    this.initializeAdvancedTemplates(); // Register dynamic/advanced templates after defaults
  }

  /**
   * Initializes and registers a set of advanced, predefined templates.
   * These can be overridden or supplemented by user-defined custom templates.
   */
  private initializeAdvancedTemplates(): void {
    const templatesData = [
      {
        name: 'react-component',
        content: `
/**
 * @summary React functional component: {{componentName}}
 * @description This component is responsible for rendering the {{componentName}} UI element.
 * It handles state management related to its internal logic and props.
 * This component is designed for reusability across the application.
 {{#if hasProps}}
 * @param props - The properties passed to the component.
 {{/if}}
 {{#each reactProps}}
 * @param props.{{this}} - Description for {{this}}.
 {{/each}}
 * @returns {JSX.Element} The rendered React component.
 * @example
 * \`\`\`tsx
 * import React from 'react';
 * import { {{componentName}} } from './{{componentName}}';
 *
 * function App() {
 *   return <{{componentName}} {{#if hasProps}}key1={value1} key2={value2} {{/if}}/>;
 * }
 * \`\`\`
 * @remarks
 * This component uses {{componentType}} pattern.
 {{#if usesHooks}}
 * It leverages the following React hooks: {{#each hooksUsed}} \`{{this}}\` {{/each}}.
 {{/if}}
 */
`, // Example template content
      },
      {
        name: 'api-endpoint',
        content: `
/**
 * @summary API endpoint handler: {{method}} {{endpoint}}
 * @description This function handles {{method}} requests to the \`{{endpoint}}\` API endpoint.
 * It performs {{#if hasAuth}}authentication, {{/if}}input validation, and business logic execution.
 * Any errors during processing are caught and returned with appropriate HTTP status codes.
 * @param {import('next').NextApiRequest} req - The incoming HTTP request object.
 * @param {import('next').NextApiResponse} res - The outgoing HTTP response object.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 * @throws {ApiResponseError} Throws a custom API response error for invalid inputs or internal server issues.
 * @example
 * \`\`\`typescript
 * // Example usage (client-side fetch)
 * fetch('/api/{{endpoint}}', {
 *   method: '{{method}}',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ key: 'value' })
 * })
 * .then(res => res.json())
 * .then(data => console.log(data));
 * \`\`\`
 * @remarks
 * This handler is designed to be idempotent for {{method}} requests where applicable.
 {{#if hasAuth}}
 * It uses a middleware for authentication and authorization.
 {{/if}}
 */
`,
      },
      {
        name: 'utility-function',
        content: `
/**
 * @summary Utility function: {{functionName}}
 * @description This utility function provides {{functionName}} functionality.
 * It's a pure function designed for reusability and isolation,
 * performing a specific, well-defined task without side effects (if applicable).
 {{#if isAsync}}
 * Asynchronous operation.
 {{/if}}
 {{#if isGeneric}}
 * This function is generic and can operate on various data types.
 {{/if}}
 * @param {...*} args - The arguments for the function.
 * @returns {*} The result of the utility operation.
 * @example
 * \`\`\`typescript
 * const result = {{functionName}}(param1, param2);
 * console.log(result);
 * \`\`\`
 */
`,
      },
      // The 'generic' template is already in the base TemplateSystem
    ];

    templatesData.forEach(({ name, content }) => {
      // Register these advanced templates. They will override any default templates
      // with the same name from the base class, or add new ones.
      this.registerTemplate({
        name: name,
        description: `Advanced template for ${name}`,
        // Pattern will be determined by SmartDocumentationEngine, not by the template itself
        // (as pattern logic is more complex than simple regex matching in file content)
        pattern: new RegExp(''), // Placeholder, actual pattern matching is done by SmartDocEngine
        generate: (context, config) => {
          // This `generate` function is a placeholder. The actual generation
          // with Handlebars/templating logic needs to happen in SmartDocumentationEngine
          // which directly consumes this content.
          return content; // SmartDocumentationEngine will process this content as a template string
        },
      });
    });
    logger.info('📝 Advanced templates initialized for DynamicTemplateSystem.');
  }

  /**
   * Retrieves a template by name. If not found, it falls back to the generic template.
   * This method directly leverages the `getTemplateByName` from the base class.
   * @param name The name of the template to retrieve.
   * @returns The content of the template as a string.
   */
  async getTemplate(name: string): Promise<string> {
    const template = this.getTemplateByName(name); // Use base class method
    if (!template) {
      logger.warn(`Template '${name}' not found, falling back to generic template.`);
      return this.getTemplateByName('generic')?.generate({} as any, {} as any) || ''; // Call generate on generic
    }
    // Return the raw content for SmartDocumentationEngine to process
    return template.generate({} as any, {} as any); // Pass dummy context/config, as content is raw template
  }

  /**
   * Loads and registers a custom template provided as a string.
   * @param name The name for the custom template.
   * @param templateContent The string content of the template.
   */
  async loadCustomTemplate(name: string, templateContent: string): Promise<void> {
    this.registerTemplate({
      name: name,
      description: `User-defined custom template: ${name}`,
      pattern: new RegExp(''), // Placeholder
      generate: (context, config) => templateContent, // Store raw content
    });
    logger.info(`📝 Custom template '${name}' loaded.`);
  }
}
