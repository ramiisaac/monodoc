import { Plugin, NodeContext, VercelAITool } from "../types";

/**
 * Base class for all generator plugins.
 * It provides default implementations for Plugin interface methods.
 * Plugins typically extend this class and override methods of interest.
 */
export abstract class BasePlugin implements Plugin {
  protected enabled: boolean = true;

  // Add these properties
  abstract name: string;
  abstract version: string;
  abstract description: string;

  /**
   * Gets the name of the plugin.
   * @returns The plugin name.
   */
  getName(): string {
    return this.name;
  }

  /**
   * Initializes the plugin with configuration and context.
   * @param _config The generator configuration.
   * @param _context Optional initialization context.
   */
  async initialize(_config: any, _context?: any): Promise<void> {
    // Base implementation: no-op
  }

  /**
   * Enables the plugin.
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disables the plugin.
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Checks if the plugin is enabled.
   * @returns True if the plugin is enabled, false otherwise.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Hook called before any file processing begins.
   * @param context The node context.
   * @returns The potentially modified context.
   */
  async beforeProcessing(context: NodeContext): Promise<NodeContext> {
    // Base implementation: return unchanged
    return context;
  }

  /**
   * Hook called after all file processing is complete.
   * @param context The node context.
   * @param result The generated result.
   * @returns The potentially modified result.
   */
  async afterProcessing(context: NodeContext, result: string): Promise<string> {
    // Base implementation: return unchanged
    return result;
  }

  /**
   * Hook called before analyzing a specific node for context.
   * @param _nodeContext The context of the node being analyzed.
   * @returns Enhanced or modified node context.
   */
  async beforeAnalyzeNode(_nodeContext: NodeContext): Promise<NodeContext> {
    return _nodeContext; // Default: return unchanged
  }

  /**
   * Hook called after a node has been analyzed.
   * @param _nodeContext The analyzed node context.
   * @returns Enhanced or modified node context.
   */
  async afterAnalyzeNode(_nodeContext: NodeContext): Promise<NodeContext> {
    return _nodeContext; // Default: return unchanged
  }

  /**
   * Hook called before generating JSDoc for a node.
   * @param _nodeContext The context of the node.
   * @param _prompt The prompt to be sent to the AI.
   * @returns Modified prompt or original if unchanged.
   */
  async beforeGenerateJSDoc(
    _nodeContext: NodeContext,
    _prompt: string,
  ): Promise<string> {
    return _prompt; // Default: return unchanged
  }

  /**
   * Hook called after JSDoc has been generated.
   * @param _nodeContext The context of the node.
   * @param _jsDoc The generated JSDoc content.
   * @returns Enhanced or modified JSDoc content.
   */
  async afterGenerateJSDoc(
    _nodeContext: NodeContext,
    _jsDoc: string,
  ): Promise<string> {
    return _jsDoc; // Default: return unchanged
  }

  /**
   * Hook called when an error occurs during processing.
   * @param _error The error that occurred.
   * @param _context Additional context where the error happened.
   */
  async onError(_error: Error, _context?: any): Promise<void> {
    // Base implementation: no-op
  }

  /**
   * Provides AI SDK tools that the plugin wants to expose.
   * @returns An array of VercelAI tools or an empty array.
   */
  getTools(): VercelAITool[] {
    return []; // Base implementation: no tools
  }
}
