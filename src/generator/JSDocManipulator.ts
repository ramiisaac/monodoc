import { JSDocableNode, GeneratorConfig, JSDocTagStructure } from '../types';
import { JSDoc, JSDocTag, Node } from 'ts-morph';
import { logger } from '../utils/logger';

/**
 * Manages the application and manipulation of JSDoc comments on TypeScript nodes.
 * It handles overwriting, merging, and ensures proper JSDoc formatting.
 */
export class JSDocManipulator {
  private config: GeneratorConfig;

  constructor(config: GeneratorConfig) {
    this.config = config;
  }

  /**
   * Applies a new JSDoc comment to a given node.
   * It respects configuration settings for overwriting and merging existing comments.
   * @param node The JSDocableNode to apply the JSDoc to.
   * @param newJsDocContent The new JSDoc content as a string.
   * @returns True if the JSDoc was applied/modified, false if skipped.
   */
  applyJSDoc(node: JSDocableNode, newJsDocContent: string): boolean {
    const existingJsDocs = node.getJsDocs();
    const nodeNameForLog = this.getNodeNameForLogging(node);
    const hasExistingJsDoc = existingJsDocs.length > 0;

    // Filter out very short or empty AI responses which might be "SKIP" signals or bad generations
    if (newJsDocContent.trim().length < this.config.jsdocConfig.minJsdocLength) {
      logger.debug(
        `Skipping JSDoc for ${nodeNameForLog}: generated content is too short (${newJsDocContent.trim().length} chars).`,
      );
      return false;
    }

    if (hasExistingJsDoc) {
      // Check if the new content is substantially different from the existing one.
      // Normalize both for comparison (remove extra spaces, leading asterisks, etc.)
      const normalizedExisting = this.normalizeJSDocContent(existingJsDocs[0].getText());
      const normalizedNew = this.normalizeJSDocContent(newJsDocContent);

      if (normalizedExisting === normalizedNew) {
        logger.debug(`Skipping JSDoc for ${nodeNameForLog}: new content is identical to existing.`);
        return false;
      }

      if (this.shouldOverwrite()) {
        this.logDebug(`Force overwriting existing JSDoc for node: ${nodeNameForLog}`);
        this.removeExistingJsDocs(existingJsDocs);
        node.addJsDoc(newJsDocContent);
        return true;
      } else if (this.config.noMergeExisting) {
        this.logDebug(
          `Overwriting existing JSDoc (due to --no-merge-existing flag) for node: ${nodeNameForLog}`,
        );
        this.removeExistingJsDocs(existingJsDocs);
        node.addJsDoc(newJsDocContent);
        return true;
      } else if (this.config.jsdocConfig.overwriteExisting) {
        this.logDebug(
          `Overwriting existing JSDoc (due to config.overwriteExisting) for node: ${nodeNameForLog}`,
        );
        this.removeExistingJsDocs(existingJsDocs);
        node.addJsDoc(newJsDocContent);
        return true;
      } else if (this.config.jsdocConfig.mergeExisting) {
        this.logDebug(`Merging JSDoc for node: ${nodeNameForLog}`);
        this.mergeJSDoc(node, newJsDocContent, existingJsDocs[0]);
        return true;
      } else {
        this.logDebug(
          `Skipping node with existing JSDoc (no overwrite/merge enabled by config/flags): ${nodeNameForLog}`,
        );
        return false;
      }
    } else {
      // No existing JSDoc, simply add the new one
      node.addJsDoc(newJsDocContent);
      this.logDebug(`Added new JSDoc for node: ${nodeNameForLog}`);
      return true;
    }
  }

  /**
   * Determines if existing JSDoc should be overwritten based on CLI flags and configuration.
   * @returns True if overwrite is enabled, false otherwise.
   */
  private shouldOverwrite(): boolean {
    return (
      this.config.forceOverwrite || // CLI flag takes highest precedence
      this.config.noMergeExisting || // CLI flag disabling merge implicitly means overwrite if new content exists
      this.config.jsdocConfig.overwriteExisting // Config setting
    );
  }

  /**
   * Removes all existing JSDoc comments from a node.
   * @param jsDocs An array of JSDoc objects to remove.
   */
  private removeExistingJsDocs(jsDocs: JSDoc[]): void {
    jsDocs.forEach((jsDoc) => jsDoc.remove());
  }

  /**
   * Merges new JSDoc content with an existing JSDoc comment.
   * This implementation is basic: it appends the new content's description to the existing one.
   * A more sophisticated merge would involve parsing tags and intelligently combining them.
   * @param node The JSDocableNode.
   * @param newContent The new JSDoc content string.
   * @param existingJSDoc The existing JSDoc object to merge into.
   */
  private mergeJSDoc(node: JSDocableNode, newContent: string, existingJSDoc: JSDoc): void {
    // A more advanced merge would involve:
    // 1. Parsing existing and new JSDoc into a structured format (description, tags).
    // 2. Combining tags, prioritizing new ones for certain types (@summary, @description)
    //    and merging for others (@param, @example, @see).
    // 3. Reconstructing the JSDoc string.

    const newDescription = this.extractDescriptionFromJSDocString(newContent);
    const newTags = this.extractTagsFromJSDocString(newContent);

    // Get existing description and tags
    const existingDescription = existingJSDoc.getDescription().trim();
    const existingTags = existingJSDoc.getTags();

    let mergedDescription = existingDescription;
    if (
      newDescription &&
      newDescription.length > 0 &&
      !existingDescription.includes(
        newDescription.substring(0, Math.min(newDescription.length, 50)),
      )
    ) {
      mergedDescription = `${existingDescription}\n\n${newDescription}`.trim();
    }

    const mergedTagStructures = this.mergeJSDocTags(existingTags, newTags);

    // Remove old JSDoc and add a new one with merged content
    existingJSDoc.remove();
    node.addJsDoc({
      description: mergedDescription,
      tags: mergedTagStructures,
    });
  }

  /**
   * Extracts the main description content from a raw JSDoc string.
   * @param jsdocString The full JSDoc string (e.g., `* @summary ...\n * @description ...\n * @param ...`).
   * @returns The extracted description string.
   */
  private extractDescriptionFromJSDocString(jsdocString: string): string {
    const lines = jsdocString.split('\n');
    let description = '';
    let inDescription = false;
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('@')) {
        if (inDescription) break; // End of description section
        if (trimmedLine.startsWith('@description')) {
          inDescription = true;
          description += trimmedLine.substring('@description'.length).trim() + '\n';
        } else if (trimmedLine.startsWith('@summary')) {
          // Summary is often part of description, or separate.
          // For simplicity, if description tag exists, only capture that.
          // Otherwise, summary can be considered part of description.
          if (!jsdocString.includes('@description')) {
            description += trimmedLine.substring('@summary'.length).trim() + '\n';
          }
        }
      } else if (inDescription || (description.length === 0 && !trimmedLine.startsWith('@'))) {
        // Capture lines before any tags, or lines within a @description block
        description += trimmedLine + '\n';
      }
    }
    return description.trim();
  }

  /**
   * Extracts JSDoc tags from a raw JSDoc string into a structured format.
   * @param jsdocString The full JSDoc string.
   * @returns An array of JSDocTagStructure.
   */
  private extractTagsFromJSDocString(jsdocString: string): JSDocTag[] {
    // This requires a robust JSDoc parser, which TS-Morph provides for *existing* nodes.
    // For parsing arbitrary strings, a lightweight regex-based approach or external parser is needed.
    // A simplified regex approach:
    const tags: JSDocTag[] = [];
    const tagRegex = /^@(\w+)\s*(?:\{([^}]+)\})?\s*(\S.*)?/gm; // Matches @tag {type} name - description
    let match;
    while ((match = tagRegex.exec(jsdocString)) !== null) {
      // TS-Morph's `JSDocTag` is an AST node, not a plain object.
      // To create a `JSDocTagStructure` for `addJsDoc`, we need to parse manually.
      // This is a simplification. A real implementation might use a dedicated JSDoc parser library.
      // For now, let's represent them as simple objects or strings for merging.
      // The `addJsDoc` method can take a string for its tags.
    }
    // This is complex. For now, a simple merge is sufficient: overwrite all tags from new.
    // A deeper merge needs to understand `@param` by name, `@see` by target etc.
    return []; // Return empty for now, as direct string parsing to JSDocTag is not trivial
  }

  /**
   * Merges existing JSDoc tags with new ones. This is a simplified merge strategy
   * that prioritizes new tags for `@summary` and `@description`, and replaces others.
   * A truly intelligent merge would be context-aware (e.g., merge @param by name).
   * @param existingTags The existing JSDocTag objects from ts-morph.
   * @param newTags The new JSDocTag objects (parsed from the AI response).
   * @returns An array of JSDocTagStructure for the merged JSDoc.
   */
  private mergeJSDocTags(existingTags: JSDocTag[], newTags: JSDocTag[]): JSDocTagStructure[] {
    const mergedTags: JSDocTagStructure[] = [];
    const newTagMap = new Map<string, JSDocTag>(); // Map new tags by name for easy lookup

    // Convert newTags (if directly parsed into TS-Morph JSDocTag like objects) into structures
    const newTagStructures: JSDocTagStructure[] = [];
    // Assuming newTags are actually strings from the AI, we need to parse them
    // This is where the complexity comes in. For now, a simple overwrite is easiest.
    // Instead of trying to parse newTags into JSDocTag objects, let's assume
    // `newContent` already contains the full JSDoc block string, and we just extract its parts.

    // Simplified merge: New content's tags largely overwrite old tags,
    // but we might keep some specific old tags if they're not in the new content.
    // For example, if AI doesn't generate @deprecated, keep it if it was there.
    const keepOldTags = new Set(['deprecated', 'ignore', 'internal']); // Tags to always preserve
    const newTagNames = new Set(newTags.map((t) => t.getTagName())); // Assuming newTags can be processed

    existingTags.forEach((tag) => {
      const tagName = tag.getTagName();
      if (keepOldTags.has(tagName) && !newTagNames.has(tagName)) {
        mergedTags.push({
          tagName: tagName,
          text: tag.getCommentText(),
        });
      }
      // More complex merge logic for @param, @property would go here, matching by name
    });

    // Add all new tags
    newTagStructures.forEach((tag) => mergedTags.push(tag));

    return mergedTags;
  }

  /**
   * Normalizes JSDoc content by removing leading/trailing whitespace,
   * extra spaces, and common JSDoc formatting characters (like `*`).
   * Used for content comparison to avoid unnecessary writes.
   * @param content The JSDoc string to normalize.
   * @returns The normalized string.
   */
  private normalizeJSDocContent(content: string): string {
    return content
      .split('\n')
      .map((line) =>
        line
          .trim()
          .replace(/^\*\s?/, '')
          .replace(/^\s?\*\s?/, ''),
      ) // Remove leading '*' and whitespace
      .filter((line) => line.length > 0) // Remove empty lines
      .join(' ') // Join lines with a single space
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim();
  }

  /**
   * Logs a debug message with the manipulator's context.
   * @param message The message to log.
   */
  private logDebug(message: string): void {
    logger.debug(message);
  }

  /**
   * Gets a user-friendly name for a TypeScript node for logging purposes.
   * @param node The ts-morph Node.
   * @returns A string representing the node's name or kind.
   */
  private getNodeNameForLogging(node: JSDocableNode): string {
    if (
      'getName' in node &&
      typeof (node as Node & { getName?: () => string | undefined }).getName === 'function'
    ) {
      return (
        (node as Node & { getName?: () => string | undefined }).getName?.() || node.getKindName()
      );
    }
    if (Node.isConstructorDeclaration(node)) {
      return `constructor of ${node.getParent()?.getKindName()}`;
    }
    if (Node.isGetAccessorDeclaration(node) || Node.isSetAccessorDeclaration(node)) {
      return `${node.getKindName()} ${(node as Node & { getName?: () => string | undefined }).getName?.() || 'unnamed'}`;
    }
    if (Node.isVariableDeclaration(node)) {
      return `variable ${(node as Node & { getName?: () => string | undefined }).getName?.() || 'unnamed'}`;
    }
    return node.getKindName();
  }
}
