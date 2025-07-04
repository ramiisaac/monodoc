// Re-exporting all public components from the plugins module.
export { BasePlugin } from './BasePlugin';
export { PluginManager } from './PluginManager';
// Re-export example plugins directly if they are considered "built-in" and discoverable by name.
export { ApiDocumentationPlugin } from './ApiDocumentationPlugin';
export { ReactComponentPlugin } from './ReactComponentPlugin';
