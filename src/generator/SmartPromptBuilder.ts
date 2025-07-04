import { NodeContext, GeneratorConfig } from '../types';

/**
 * Defines a strategy for building AI prompts.
 * Each strategy provides a `buildPrompt` method to generate
 * a system and user prompt based on the node context and config.
 */
export interface PromptStrategy {
  name: string;
  buildPrompt(
    nodeContext: NodeContext,
    config: GeneratorConfig,
    templateContent: string,
  ): { systemPrompt: string; userPrompt: string };
}

/**
 * Implements a standard prompt strategy.
 * This strategy aims for a balanced approach to documentation generation.
 */
export class StandardPromptStrategy implements PromptStrategy {
  name = 'standard';
  buildPrompt(
    nodeContext: NodeContext,
    config: GeneratorConfig,
    templateContent: string,
  ): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are a senior TypeScript developer specializing in comprehensive documentation.
Your primary goal is to generate high-quality JSDoc comments that are:
1. Accurate and technically precise
2. Comprehensive yet concise
3. Helpful for both humans and AI systems
4. Following JSDoc best practices and conventions
5. Rich in context about business logic and system architecture

Focus on explaining the "why" behind the code, not just the "what". Include details about:
- Business logic and domain context
- Integration points with other components
- Performance considerations
- Security implications
- Common use cases and examples
- Potential pitfalls or gotchas

Always use proper JSDoc tags and maintain consistency in formatting.
When generating examples, ensure they are realistic and demonstrate actual usage patterns.
If the code is truly trivial or purely a type definition that explicitly doesn't need behavioral documentation, respond with a single word "SKIP".`;

    const userPrompt = `Generate a JSDoc comment for the following TypeScript ${nodeContext.nodeKind} named '${nodeContext.nodeName || 'Unnamed'}'.
Follow these guidelines:
- Adhere strictly to the provided JSDoc template structure.
- Fill in all sections accurately based on the code and context.
- Ensure all parameters and return types are correctly documented with their inferred types.
- Provide a clear, concise summary and a detailed description.
- Generate a practical code example demonstrating common usage if generateExamples is enabled.
- Include @see tags for relevant direct symbol references or related symbols if provided in context.

**CONTEXT:**
- File: ${nodeContext.fileContext}
- Package: ${nodeContext.packageContext}
${nodeContext.signatureDetails ? `- Signature: \`${nodeContext.signatureDetails}\`\n` : ''}

${nodeContext.surroundingContext ? `\n**SURROUNDING CONTEXT (e.g., parent class/interface/module):**\n\\\`\`\`typescript\n${nodeContext.surroundingContext}\n\\\`\`\`\n` : ''}
${nodeContext.relevantImports && nodeContext.relevantImports.length > 0 ? `\n**RELEVANT IMPORTS:**\n\\\`\`\`typescript\n${nodeContext.relevantImports.join('\n')}\n\\\`\`\`\n` : ''}
${this.buildSymbolReferencesSection(nodeContext, config)}
${this.buildRelatedSymbolsSection(nodeContext, config)}

**JSDoc TEMPLATE TO FILL:**
\\\`\`\`jsdoc
${templateContent}
\\\`\`\`

**CODE SNIPPET (Target for JSDoc):**
\\\`\`\`typescript
${nodeContext.codeSnippet}
\\\`\`\`

Generate ONLY the JSDoc comment content. Do NOT include markdown code fences (\`\`\`) around the final JSDoc output.`;

    return { systemPrompt, userPrompt };
  }

  protected buildSymbolReferencesSection(
    nodeContext: NodeContext,
    config: GeneratorConfig,
  ): string {
    if (
      nodeContext.symbolUsages &&
      nodeContext.symbolUsages.length > 0 &&
      config.jsdocConfig.includeSymbolReferences
    ) {
      return `\n**DIRECT SYMBOL REFERENCES (where this symbol is used):**\n${nodeContext.symbolUsages.map((u) => `- \`{@link ${u.filePath}:${u.line}}\` (Snippet: \`...${u.snippet || nodeContext.nodeName}...\`)`).join('\n')}\n`;
    }
    return '';
  }

  protected buildRelatedSymbolsSection(nodeContext: NodeContext, config: GeneratorConfig): string {
    if (
      nodeContext.relatedSymbols &&
      nodeContext.relatedSymbols.length > 0 &&
      config.jsdocConfig.includeRelatedSymbols
    ) {
      return `\n**SEMANTICALLY RELATED SYMBOLS (via embeddings):**\n${nodeContext.relatedSymbols.map((s) => `- \`{@link ${s.relativeFilePath}}\` - \`${s.name}\` (${s.kind}) - Score: ${s.relationshipScore.toFixed(2)}`).join('\n')}\n`;
    }
    return '';
  }
}

/**
 * Implements a minimal prompt strategy.
 * This strategy aims for concise JSDoc comments, suitable for basic documentation.
 */
export class MinimalPromptStrategy implements PromptStrategy {
  name = 'minimal';
  buildPrompt(
    nodeContext: NodeContext,
    config: GeneratorConfig,
    templateContent: string,
  ): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are a concise TypeScript documenter.
Your goal is to generate short, essential JSDoc comments.
Focus only on @summary, essential @param/@returns, and a simple @example if strictly necessary.
If the code is self-explanatory, respond with "SKIP".`;

    const userPrompt = `Generate a very concise JSDoc comment for the following TypeScript ${nodeContext.nodeKind} named '${nodeContext.nodeName || 'Unnamed'}'.
Use the provided JSDoc template.
Prioritize brevity and essential information.
Do not include @see, @remarks, or overly detailed descriptions.
If code examples are generated, ensure they are minimal.

**CODE SNIPPET:**
\\\`\`\`typescript
${nodeContext.codeSnippet}
\\\`\`\`

**JSDoc TEMPLATE TO FILL:**
\\\`\`\`jsdoc
${templateContent}
\\\`\`\`

Generate ONLY the JSDoc comment content. Do NOT include markdown code fences.`;
    return { systemPrompt, userPrompt };
  }
}

/**
 * Implements a detailed prompt strategy.
 * This strategy aims for comprehensive JSDoc comments, including deep context and references.
 */
export class DetailedPromptStrategy extends StandardPromptStrategy implements PromptStrategy {
  name = 'detailed';
  buildPrompt(
    nodeContext: NodeContext,
    config: GeneratorConfig,
    templateContent: string,
  ): { systemPrompt: string; userPrompt: string } {
    const basePrompts = super.buildPrompt(nodeContext, config, templateContent);

    const detailedSystemPrompt = `${basePrompts.systemPrompt}
You are operating as an expert TypeScript architect. Provide extensive detail on:
- Architectural implications and design patterns.
- Business domain context and user impact.
- Integration patterns with other services/modules.
- Performance, security, and scalability considerations.
- Edge cases and error handling.
- Any notable trade-offs or future improvements.`;

    const detailedUserPrompt = `${basePrompts.userPrompt}

**ADDITIONAL REQUIREMENTS:**
- Elaborate significantly on the @description section, providing an in-depth analysis.
- Ensure @param and @returns descriptions are exceptionally thorough, including types, constraints, and examples of values.
- Provide comprehensive @example sections, demonstrating multiple use cases if applicable.
- Maximize the use of @see tags for both direct and semantically related symbols, explaining the relationship.
- Include @throws for all possible errors with conditions.
- Use @remarks for implementation details, design rationale, or future considerations.`;

    return { systemPrompt: detailedSystemPrompt, userPrompt: detailedUserPrompt };
  }
}

/**
 * Selects and builds the appropriate prompt based on the node's context
 * and the configured documentation style/features.
 */
export class SmartPromptBuilder {
  private strategies: Map<string, PromptStrategy> = new Map();

  constructor() {
    this.registerStrategy(new StandardPromptStrategy());
    this.registerStrategy(new MinimalPromptStrategy());
    this.registerStrategy(new DetailedPromptStrategy());
  }

  /**
   * Registers a prompt strategy. Overwrites if a strategy with the same name exists.
   * @param strategy The PromptStrategy to register.
   */
  registerStrategy(strategy: PromptStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  /**
   * Builds the AI prompt by selecting the most appropriate strategy
   * and generating the system and user messages.
   * @param nodeContext The context of the TypeScript node.
   * @param config The generator configuration.
   * @param templateContent The content of the selected JSDoc template to fill.
   * @returns An object containing the system and user prompt strings.
   */
  buildPrompt(
    nodeContext: NodeContext,
    config: GeneratorConfig,
    templateContent: string,
  ): { systemPrompt: string; userPrompt: string } {
    const strategy = this.selectStrategy(nodeContext, config);
    return this.strategies.get(strategy)!.buildPrompt(nodeContext, config, templateContent);
  }

  /**
   * Selects the most appropriate prompt strategy based on heuristic rules.
   * Factors considered include code complexity, presence of related symbols,
   * and configuration settings (e.g., whether examples are desired).
   * @param nodeContext The context of the TypeScript node.
   * @param config The generator configuration.
   * @returns The name of the selected prompt strategy.
   */
  private selectStrategy(nodeContext: NodeContext, config: GeneratorConfig): string {
    const codeLength = nodeContext.codeSnippet.length;
    const hasRelatedSymbols = (nodeContext.relatedSymbols?.length || 0) > 0;
    const isExportedOrPublic = nodeContext.isExported || nodeContext.accessModifier === 'public';

    // Heuristics for strategy selection:
    // 1. Detailed for complex, important, or highly interconnected code.
    // 2. Minimal for very simple, self-explanatory code.
    // 3. Standard for everything else.

    if (
      isExportedOrPublic &&
      (codeLength > 500 || hasRelatedSymbols || config.jsdocConfig.generateExamples)
    ) {
      return 'detailed';
    } else if (
      codeLength < 100 &&
      !nodeContext.surroundingContext &&
      !hasRelatedSymbols &&
      !config.jsdocConfig.generateExamples
    ) {
      return 'minimal';
    } else {
      return 'standard';
    }
  }
}
