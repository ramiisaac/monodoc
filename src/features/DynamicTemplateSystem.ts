import { TemplateSystem } from "./TemplateSystem";
import { logger } from "../utils/logger";
import { NodeContext, GeneratorConfig } from "../types";

/**
 * Extends the base `TemplateSystem` to provide dynamic loading and management
 * of JSDoc templates, including advanced and custom templates.
 * It ensures a fallback to generic templates if specific ones are not found.
 */
export class DynamicTemplateSystem extends TemplateSystem {
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
        name: "react-component",
        content: `
/**
 * @summary React functional component: {{nodeName}}
 * @description This component is responsible for rendering the {{nodeName}} UI element.
 * It handles state management related to its internal logic and props.
 * This component is designed for reusability across the application.
 *
 {{#if customData.reactProps}}
 * @param {object} props - The properties passed to the component.
 {{#each customData.reactProps}}
 * @param {any} {{this}} - Description for prop {{this}}.
 {{/each}}
 {{/if}}
 * @returns {JSX.Element} The rendered React component.
 * @example
 * \`\`\`tsx
 * import React from 'react';
 * import { {{nodeName}} } from './{{nodeName}}';
 *
 * function App() {
 *   return <{{nodeName}} />;
 * }
 * \`\`\`
 * @remarks
 * This component uses the {{customData.componentType}} pattern.
 {{#if customData.hooksUsed}}
 * It leverages the following React hooks: {{#each customData.hooksUsed}} \`{{this}}\` {{/each}}.
 {{/if}}
 */
`, // Example template content with customData access
      },
      {
        name: "api-endpoint",
        content: `
/**
 * @summary API endpoint handler: {{customData.httpMethod}} {{customData.routePath}}
 * @description This function handles {{customData.httpMethod}} requests to the \`{{customData.routePath}}\` API endpoint.
 * It performs {{#if customData.hasAuth}}authentication, {{/if}}input validation, and business logic execution.
 * Any errors during processing are caught and returned with appropriate HTTP status codes.
 * @param {import('next').NextApiRequest} req - The incoming HTTP request object.
 * @param {import('next').NextApiResponse} res - The outgoing HTTP response object.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 * @throws {ApiResponseError} Throws a custom API response error for invalid inputs or internal server issues.
 *
 {{#if customData.middleware}}
 * @middleware Uses the following middleware: {{#each customData.middleware}} \`{{this}}\` {{/each}}.
 {{/if}}
 * @apiSuccess {object} response - Standard success response format.
 * @apiError {object} error - Standard error response format.
 *
 * @example
 * \`\`\`typescript
 * // Example usage (client-side fetch)
 * fetch('/api{{customData.routePath}}', {
 *   method: '{{customData.httpMethod}}',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ key: 'value' })
 * })
 * .then(res => res.json())
 * .then(data => console.log(data));
 * \`\`\`
 * @remarks
 * This handler is designed to be idempotent for {{customData.httpMethod}} requests where applicable.
 */
`,
      },
      {
        name: "utility-function",
        content: `
/**
 * @summary Utility function: {{nodeName}}
 * @description This utility function provides \`{{nodeName}}\` functionality.
 * It's a pure function designed for reusability and isolation,
 * performing a specific, well-defined task without side effects (if applicable).
 *
 {{#if isAsync}}
 * Asynchronous operation.
 {{/if}}
 {{#if (eq nodeKind 'FunctionDeclaration')}}
 {{#if parameters}}
 * @param {object} args - The arguments for this function.
 {{#each parameters}}
 * @param {{{{type}}}} {{name}} - {{#if optional}}[Optional] {{/if}}Description for parameter {{name}}.
 {{/each}}
 {{/if}}
 {{#if returnType}}
 * @returns {{{{returnType}}}} The result of this utility function.
 {{/if}}
 {{/if}}
 *
 * @example
 * \`\`\`typescript
 * const result = {{nodeName}}(param1, param2);
 * console.log(result);
 * \`\`\`
 * @remarks
 * This function adheres to functional programming principles for testability.
 */
`,
      },
    ];

    templatesData.forEach(({ name, content }) => {
      this.registerTemplate({
        name: name,
        description: `Advanced template for ${name}`,
        pattern: new RegExp(""), // Placeholder, actual pattern matching is done by SmartDocEngine
        generate: (_context: unknown, _config: unknown) => content, // Returns raw content for SmartDocumentationEngine to compile
      });
    });
    logger.info("📝 Advanced templates initialized for DynamicTemplateSystem.");
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
      logger.warn(
        `Template '${name}' not found, falling back to generic template.`,
      );
      // Call generate on generic template instance to get its content
      const genericTemplate = this.getTemplateByName("generic");
      if (genericTemplate) {
        return genericTemplate.generate(
          {} as NodeContext,
          {} as GeneratorConfig,
        ); // Pass dummy context/config
      }
      return ""; // Fallback if even generic is missing
    }
    // Return the raw content for SmartDocumentationEngine to process
    return template.generate({} as NodeContext, {} as GeneratorConfig); // Pass dummy context/config, as content is raw template
  }

  /**
   * Loads and registers a custom template provided as a string.
   * @param name The name for the custom template.
   * @param templateContent The string content of the template.
   */
  async loadCustomTemplate(
    name: string,
    templateContent: string,
  ): Promise<void> {
    this.registerTemplate({
      name: name,
      description: `User-defined custom template: ${name}`,
      pattern: new RegExp(""), // Placeholder
      generate: (_context: NodeContext, _config: GeneratorConfig) =>
        templateContent, // Store raw content
    });
    logger.info(`📝 Custom template '${name}' loaded.`);
  }
}
