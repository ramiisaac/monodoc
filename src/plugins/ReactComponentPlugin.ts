import { Plugin, NodeContext } from "../types";
import { BasePlugin } from "./BasePlugin"; // Import BasePlugin
// import { logger } from '../utils/logger';

/**
 * A plugin to enhance JSDoc generation for React components.
 * It identifies React components and extracts specific information like props and hook usage,
 * which can then be used by the `SmartDocumentationEngine` or `afterProcessing` hook.
 */
export class ReactComponentPlugin extends BasePlugin implements Plugin {
  name = "ReactComponentPlugin";
  version = "1.0.0";
  description = "Enhances JSDoc generation for React components";

  /**
   * Gets the name of the plugin.
   * @returns The plugin name.
   */
  getName(): string {
    return this.name;
  }

  /**
   * Hook called before analyzing a node.
   * It enhances the node context with React-specific information.
   * @param nodeContext The context of the node being analyzed.
   * @returns Enhanced node context with React-specific details.
   */
  async beforeProcessing(nodeContext: NodeContext): Promise<NodeContext> {
    if (this.isReactComponent(nodeContext)) {
      const propTypes = this.extractPropTypes(nodeContext.codeSnippet);
      const hookUsage = this.analyzeHookUsage(nodeContext.codeSnippet);
      const componentType = this.getComponentType(nodeContext.codeSnippet);

      // Add custom data that the SmartDocumentationEngine or afterProcessing hook can use
      return {
        ...nodeContext,
        customData: {
          ...nodeContext.customData, // Preserve existing custom data
          reactProps: propTypes,
          hooksUsed: hookUsage,
          componentType: componentType,
          isReactComponent: true,
        },
      };
    }
    return nodeContext;
  }

  /**
   * Hook called after JSDoc generation to enhance with React-specific documentation.
   * @param nodeContext The context of the node.
   * @param result The generated JSDoc content.
   * @returns Enhanced JSDoc content with React documentation.
   */
  async afterProcessing(
    nodeContext: NodeContext,
    result: string,
  ): Promise<string> {
    if (nodeContext.customData?.isReactComponent) {
      return this.addReactSections(result, nodeContext);
    }
    return result;
  }

  /**
   * Determines if a given NodeContext corresponds to a React component.
   * Checks for JSX, React FC types, or capitalized function components.
   * @param context The NodeContext.
   * @returns True if it's a React component, false otherwise.
   */
  private isReactComponent(context: NodeContext): boolean {
    return (
      context.codeSnippet.includes("JSX.Element") ||
      context.codeSnippet.includes("React.FC") ||
      /return\s*<[A-Za-z]/.test(context.codeSnippet) || // Detects `return <Div...`
      (context.nodeKind === "FunctionDeclaration" &&
        !!context.nodeName.match(/^[A-Z]/)) || // Capitalized function components
      (context.nodeKind === "VariableDeclaration" &&
        !!context.nodeName.match(/^[A-Z]/) &&
        (context.codeSnippet.includes("React.memo") ||
          context.codeSnippet.includes("forwardRef"))) // Memoized/forwardRef components
    );
  }

  /**
   * Extracts prop names from a React component's code snippet.
   * Looks for `interface XProps { ... }` or destructuring in function parameters.
   * @param code The component's code snippet.
   * @returns An array of extracted prop names.
   */
  private extractPropTypes(code: string): string[] {
    const propNames: string[] = [];

    // 1. From interface or type alias `XProps`
    const interfaceMatch = code.match(
      /(interface|type)\s+(\w+Props)\s*\{([^}]+)\}/s,
    ); // `s` for dotall
    if (interfaceMatch && interfaceMatch[3]) {
      const propDefinitions = interfaceMatch[3];
      // Regex to find `propName: type;` or `propName?: type;`
      const propRegex = /(\w+)\s*[\?:-]\s*[^;,\n]+/g; // Removed useless escape character
      let match;
      while ((match = propRegex.exec(propDefinitions)) !== null) {
        propNames.push(match[1]);
      }
    }

    // 2. From direct destructuring in function parameters (e.g., `({ prop1, prop2 })`)
    const destructuringMatch = code.match(
      /function\s+\w+\s*\((?:\{\s*([^}]+)\s*\})?\s*\)/,
    );
    if (destructuringMatch && destructuringMatch[1]) {
      const destructuredProps = destructuringMatch[1]
        .split(",")
        .map((p) => p.trim().split(":")[0].trim())
        .filter(Boolean);
      propNames.push(...destructuredProps);
    }

    return [...new Set(propNames)]; // Return unique prop names
  }

  /**
   * Analyzes a React component's code for common hook usage.
   * @param code The component's code snippet.
   * @returns An array of hook names used (e.g., 'useState', 'useEffect').
   */
  private analyzeHookUsage(code: string): string[] {
    const hooks = [
      "useState",
      "useEffect",
      "useContext",
      "useReducer",
      "useCallback",
      "useMemo",
      "useRef",
      "useImperativeHandle",
      "useLayoutEffect",
      "useDebugValue",
      "useDeferredValue",
      "useTransition",
      "useId",
      "useSyncExternalStore",
      "useInsertionEffect",
      "useFormStatus",
      "useFormState",
      "useActionState",
    ];
    const usedHooks: string[] = [];
    hooks.forEach((hook) => {
      // Regex to match `useHook(...)` or `React.useHook(...)`
      // Removed unnecessary escape character
      if (
        new RegExp(`(?:^|\\s|\\.|\\b)(?:React\\.)?${hook}\\s*\\(`, "g").test(
          code,
        )
      ) {
        usedHooks.push(hook);
      }
    });
    return usedHooks;
  }

  /**
   * Determines the type of React component based on its code structure.
   * @param code The component's code snippet.
   * @returns A string describing the component type (e.g., 'functional', 'class', 'memoized functional').
   */
  private getComponentType(code: string): string {
    if (code.includes("React.memo") || code.includes("memo("))
      return "memoized functional";
    if (code.includes("forwardRef")) return "forwarded-ref functional";
    if (code.includes("class") && code.includes("extends")) return "class";
    return "functional";
  }

  /**
   * Appends React-specific JSDoc tags to the generated documentation.
   * @param currentJsDoc The current JSDoc string.
   * @param context The NodeContext with custom React data.
   * @returns The enhanced JSDoc string.
   */
  private addReactSections(currentJsDoc: string, context: NodeContext): string {
    const { reactProps, hooksUsed, componentType } = context.customData || {};
    let enhanced = currentJsDoc;

    if (componentType && !enhanced.includes(`@component`)) {
      enhanced += `\n@component ${componentType} React component`;
    }

    // Add @props if not already present or if prop details are desired
    if (Array.isArray(reactProps) && reactProps.length > 0) {
      // A simple check to avoid adding a generic `@props` if AI already detailed them
      if (!enhanced.includes("@param props") && !enhanced.includes("@prop")) {
        enhanced += `\n@props Available props: ${reactProps.join(", ")}`;
      }
    }

    if (Array.isArray(hooksUsed) && hooksUsed.length > 0) {
      if (!enhanced.includes("@hooks")) {
        enhanced += `\n@hooks Uses React hooks: ${hooksUsed.join(", ")}`;
      }
    }

    return enhanced;
  }
}
