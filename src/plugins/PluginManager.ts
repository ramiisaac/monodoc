import {
  NodeContext,
  GeneratorConfig,
  ProcessingStats,
  Plugin,
  VercelAITool,
} from "../types";
import { logger } from "../utils/logger";
import path from "path"; // For resolving plugin paths

/**
 * Manages the loading, enabling, and execution of various generator plugins.
 * It provides methods to run plugins at different stages of the documentation generation lifecycle.
 */
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map(); // Stores all loaded plugin instances
  private enabledPlugins: Plugin[] = []; // Stores currently enabled plugin instances
  private tools: VercelAITool[] = []; // Collects AI SDK tools provided by plugins

  constructor(private config: GeneratorConfig) {}

  /**
   * Loads a plugin from a given path (or module name).
   * Plugins are expected to export a class that extends `BasePlugin`.
   * @param pluginPath The path to the plugin file or its package name.
   * @throws An error if the plugin cannot be loaded or is invalid.
   */
  async loadPlugin(pluginPath: string): Promise<void> {
    try {
      // Attempt to resolve the plugin module.
      // This allows loading from node_modules (e.g., 'my-custom-plugin')
      // or from local files (e.g., './plugins/MyLocalPlugin.ts').
      let module: any; // Corrected `any`
      try {
        // First try direct import assuming it's a relative path or an installed module
        module = await import(pluginPath);
      } catch (importError: unknown) {
        // Corrected `importError` type
        // If that fails, try resolving relative to process.cwd() for flexibility with local paths
        const resolvedPath = path.resolve(process.cwd(), pluginPath);
        module = await import(resolvedPath);
      }

      const PluginClass = module.default || module; // Handle ES module default export or CommonJS export

      if (typeof PluginClass !== "function") {
        throw new Error(
          `Plugin at ${pluginPath} does not export a loadable constructor (expected a class or function).`,
        );
      }

      const pluginInstance: Plugin = new PluginClass(this.config); // Instantiate the plugin
      if (this.plugins.has(pluginInstance.name)) {
        logger.warn(
          `⚠️ Plugin with name '${pluginInstance.name}' already loaded. Skipping duplicate.`,
        );
        return;
      }
      this.plugins.set(pluginInstance.name, pluginInstance); // Store the instance

      // Call the plugin's initialize method
      if (typeof pluginInstance.initialize === "function") {
        await pluginInstance.initialize(this.config);
      }

      // If the plugin provides AI SDK tools, collect them
      if (typeof pluginInstance.getTools === "function") {
        const pluginTools = pluginInstance.getTools();
        this.tools.push(...pluginTools);
        logger.debug(
          `Plugin '${pluginInstance.name}' provided ${pluginTools.length} AI SDK tools.`,
        );
      }

      logger.info(
        `🔌 Loaded plugin: ${pluginInstance.name} v${pluginInstance.version}`,
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error(
          `Failed to load plugin from ${pluginPath}: ${error.message}`,
        );
      } else {
        logger.error(`Failed to load plugin from ${pluginPath}: Unknown error`);
      }
      throw error; // Re-throw to indicate a critical loading failure
    }
  }

  /**
   * Enables a loaded plugin by its name. Enabled plugins will have their lifecycle hooks executed.
   * @param name The name of the plugin to enable.
   */
  enablePlugin(name: string): void {
    const plugin = this.plugins.get(name);
    if (plugin) {
      // Check if already enabled to prevent duplicate entries in `enabledPlugins` array
      const isAlreadyEnabled = this.enabledPlugins.some((p) => p.name === name);
      if (isAlreadyEnabled) {
        logger.debug(`Plugin ${name} is already enabled.`);
        return;
      }

      // Call the plugin's `enable` method if it exists
      if (typeof plugin.enable === "function") {
        plugin.enable(); // Let the plugin manage its own internal enabled state
      }
      this.enabledPlugins.push(plugin);
      logger.info(`✅ Enabled plugin: ${name}`);
    } else {
      logger.warn(`Plugin '${name}' not found. Cannot enable.`);
    }
  }

  /**
   * Runs the `beforeProcessing` hook for all enabled plugins.
   * Plugins can modify the `NodeContext` before AI generation.
   * @param context The initial `NodeContext`.
   * @returns A Promise resolving to the modified `NodeContext`.
   */
  async runBeforeProcessing(context: NodeContext): Promise<NodeContext> {
    let modifiedContext = context;
    for (const plugin of this.enabledPlugins) {
      // Ensure plugin has `beforeProcessing` method and is enabled
      if (typeof plugin.beforeProcessing === "function" && plugin.isEnabled()) {
        try {
          modifiedContext = await plugin.beforeProcessing(modifiedContext);
        } catch (error) {
          logger.warn(
            `Plugin ${plugin.name} failed in beforeProcessing hook: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Notify the plugin itself about the error if it has an onError hook
          if (typeof plugin.onError === "function") {
            await plugin.onError(
              error instanceof Error ? error : new Error(String(error)),
              context,
            );
          }
        }
      }
    }
    return modifiedContext;
  }

  /**
   * Runs the `afterProcessing` hook for all enabled plugins.
   * Plugins can modify the generated JSDoc string.
   * @param context The `NodeContext` for which JSDoc was generated.
   * @param result The generated JSDoc string.
   * @returns A Promise resolving to the modified JSDoc string.
   */
  async runAfterProcessing(
    context: NodeContext,
    result: string,
  ): Promise<string> {
    let modifiedResult = result;
    for (const plugin of this.enabledPlugins) {
      // Ensure plugin has `afterProcessing` method and is enabled
      if (typeof plugin.afterProcessing === "function" && plugin.isEnabled()) {
        try {
          modifiedResult = await plugin.afterProcessing(
            context,
            modifiedResult,
          );
        } catch (error) {
          logger.warn(
            `Plugin ${plugin.name} failed in afterProcessing hook: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Notify the plugin itself about the error
          if (typeof plugin.onError === "function") {
            await plugin.onError(
              error instanceof Error ? error : new Error(String(error)),
              context,
            );
          }
        }
      }
    }
    return modifiedResult;
  }

  /**
   * Runs the `onComplete` hook for all enabled plugins.
   * This is called once after the entire documentation generation process has finished.
   * @param stats The final `ProcessingStats` for the run.
   */
  async finalize(stats?: ProcessingStats): Promise<void> {
    logger.info("🔌 Finalizing plugins...");
    for (const plugin of this.enabledPlugins) {
      // Iterate only over plugins that were enabled
      if (typeof plugin.onComplete === "function") {
        try {
          if (stats) {
            // Pass stats if available
            await plugin.onComplete(stats);
          }
          logger.debug(`✅ Plugin ${plugin.name} finalized`);
        } catch (error) {
          logger.warn(
            `⚠️ Error finalizing plugin ${plugin.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Notify the plugin itself about the error during finalization
          if (typeof plugin.onError === "function") {
            await plugin.onError(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }
      }
    }
  }

  /**
   * Returns all AI SDK tools collected from enabled plugins.
   * These tools can be registered with the `AIClient`.
   * @returns An array of `VercelAITool` objects.
   */
  getAITools(): VercelAITool[] {
    return this.tools;
  }

  /**
   * Calls the onError hook on all enabled plugins.
   * This allows plugins to handle errors in a custom way.
   * @param error The error that occurred
   * @param nodeContext Optional context for the node where the error occurred
   * @param filePath Optional file path where the error occurred
   */
  async onError(
    error: Error | string,
    nodeContext?: NodeContext,
    filePath?: string,
  ): Promise<void> {
    const errorObj = typeof error === "string" ? new Error(error) : error;

    for (const plugin of this.enabledPlugins) {
      if (plugin.onError) {
        try {
          await plugin.onError(errorObj, nodeContext);
        } catch (pluginError) {
          logger.warn(
            `Plugin ${plugin.getName()} threw an error in onError hook: ${
              pluginError instanceof Error
                ? pluginError.message
                : String(pluginError)
            }`,
          );
        }
      }
    }
  }
}
