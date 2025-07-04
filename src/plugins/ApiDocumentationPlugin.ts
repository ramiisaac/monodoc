import { Plugin, NodeContext } from "../types";
import { BasePlugin } from "./BasePlugin";

// Define ApiEndpoint interface locally
interface ApiEndpoint {
  method: string;
  path: string;
  params?: string[];
  middleware?: string[];
  description?: string;
}

/**
 * A plugin to enhance documentation for API routes and endpoints.
 * It adds specific API-related JSDoc tags like `@route`, `@middleware`, `@apiSuccess`, `@apiError`.
 */
export class ApiDocumentationPlugin extends BasePlugin implements Plugin {
  name = "ApiDocumentationPlugin";
  version = "1.0.0";
  description = "Enhances documentation for API routes and endpoints";

  /**
   * Gets the name of the plugin.
   * @returns The plugin name.
   */
  getName(): string {
    return this.name;
  }

  /**
   * Hook called before analyzing a node.
   * It enhances the node context with API-specific information.
   * @param nodeContext The context of the node being analyzed.
   * @returns Enhanced node context with API-specific details.
   */
  async beforeProcessing(nodeContext: NodeContext): Promise<NodeContext> {
    if (this.isApiRoute(nodeContext)) {
      // Extract API-specific metadata
      const httpMethod = this.extractHttpMethod(nodeContext.codeSnippet);
      const routePath = this.extractRoutePath(nodeContext.fileContext);
      const middleware = this.extractMiddleware(nodeContext.codeSnippet);

      // Try to extract REST endpoints from the code
      const endpoints = this.extractRestEndpoints(nodeContext.codeSnippet);

      // Add to custom data
      nodeContext.customData = {
        ...nodeContext.customData,
        isApiRoute: true,
        httpMethod,
        routePath,
        middleware,
        apiEndpoints: endpoints,
      };
    }

    return nodeContext;
  }

  /**
   * Hook called after JSDoc generation to enhance with API-specific documentation.
   * @param nodeContext The context of the node.
   * @param result The generated JSDoc content.
   * @returns Enhanced JSDoc content with API documentation.
   */
  async afterProcessing(
    nodeContext: NodeContext,
    result: string,
  ): Promise<string> {
    if (nodeContext.customData?.isApiRoute) {
      return this.addApiDocumentation(result, nodeContext);
    }
    return result;
  }

  /**
   * Adds API-specific documentation to the generated JSDoc.
   * @param jsDoc The original JSDoc content.
   * @param context The node context with API metadata.
   * @returns Enhanced JSDoc with API documentation.
   */
  private addApiDocumentation(jsDoc: string, context: NodeContext): string {
    let enhanced = jsDoc;

    // Add endpoint information if available
    const endpoints = context.customData?.apiEndpoints as
      | ApiEndpoint[]
      | undefined;
    if (endpoints && endpoints.length > 0) {
      const apiDoc = this.generateApiDocTemplate(endpoints);
      enhanced += apiDoc;
    }

    // Add middleware information
    const middleware = context.customData?.middleware;
    if (middleware && Array.isArray(middleware) && middleware.length > 0) {
      enhanced += `\n@middleware ${middleware.join(", ")}`;
    }

    return enhanced;
  }

  /**
   * Checks if a node represents an API route handler.
   * @param context The node context to check.
   * @returns True if it's likely an API route handler.
   */
  private isApiRoute(context: NodeContext): boolean {
    // Check for common API route patterns
    return (
      context.fileContext.includes("/api/") ||
      context.fileContext.includes("/routes/") ||
      context.fileContext.includes("/controllers/") ||
      context.nodeName.toLowerCase().includes("handler") ||
      context.nodeName.toLowerCase().includes("controller") ||
      context.nodeName.toLowerCase().includes("route") ||
      context.codeSnippet.includes("express.") ||
      context.codeSnippet.includes("router.") ||
      context.codeSnippet.includes("app.get") ||
      context.codeSnippet.includes("app.post") ||
      context.codeSnippet.includes("app.put") ||
      context.codeSnippet.includes("app.delete")
    );
  }

  /**
   * Extracts the HTTP method from a code snippet.
   * @param code The code snippet of the API handler.
   * @returns The HTTP method or 'GET' as default.
   */
  private extractHttpMethod(code: string): string {
    const methodMatch = code.match(
      /\.(get|post|put|delete|patch|options|head)\s*\(/i,
    );
    return methodMatch ? methodMatch[1].toUpperCase() : "GET";
  }

  /**
   * Extracts the route path from the file path.
   * @param filePath The relative file path of the API route.
   * @returns The inferred route path.
   */
  private extractRoutePath(filePath: string): string {
    // Infer route from file path (e.g., /api/users/index.ts -> /users)
    const apiIndex = filePath.indexOf("/api/");
    const routesIndex = filePath.indexOf("/routes/");
    let route = "/";
    if (apiIndex !== -1) {
      route = filePath.substring(apiIndex + 4); // Get part after '/api/'
    } else if (routesIndex !== -1) {
      route = filePath.substring(routesIndex + 7); // Get part after '/routes/'
    }
    // Remove file extension and 'index' if present
    route = route.replace(/\.(ts|js|tsx|jsx)$/, "").replace(/\/index$/, "");
    // Ensure route starts with /
    if (!route.startsWith("/")) route = "/" + route;
    return route;
  }

  /**
   * Infers common middleware types from the code snippet by looking for keywords.
   * @param code The code snippet of the API handler.
   * @returns An array of middleware names.
   */
  private extractMiddleware(code: string): string[] {
    const middleware = [];
    if (code.includes("authenticate") || code.includes("authMiddleware"))
      middleware.push("authentication");
    if (code.includes("authorize") || code.includes("permissionMiddleware"))
      middleware.push("authorization");
    if (
      code.includes("validate") ||
      code.includes("schemaValidation") ||
      code.includes("joi")
    )
      middleware.push("validation");
    if (code.includes("rateLimit")) middleware.push("rate-limiting");
    if (code.includes("cors")) middleware.push("CORS");
    return middleware;
  }

  /**
   * Extracts REST API endpoints from the node's code.
   * This is a basic implementation that looks for Express-style route definitions.
   * @param code The source code to analyze.
   * @returns An array of extracted endpoint information.
   */
  private extractRestEndpoints(code: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const routeRegex =
      /\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = routeRegex.exec(code)) !== null) {
      const method = match[1].toUpperCase();
      const path = match[2];

      // Extract parameters from the path
      const params = this.extractPathParams(path);

      // Try to extract middleware (basic approach)
      const middlewareMatch = code.match(
        new RegExp(
          `\\.${match[1]}\\s*\\([^,]+,\\s*([^,]+(?:,\\s*[^,]+)*),\\s*(?:async\\s*)?(?:function|\\()`,
          "s",
        ),
      );
      const middleware = middlewareMatch
        ? middlewareMatch[1]
            .split(",")
            .map((m) => m.trim())
            .filter((m) => m && !m.includes("("))
        : [];

      endpoints.push({
        method,
        path,
        params,
        middleware,
        description: `${method} ${path}`,
      });
    }

    return endpoints;
  }

  /**
   * Extracts path parameters from a route path.
   * @param path The route path (e.g., "/users/:id").
   * @returns An array of parameter names.
   */
  private extractPathParams(path: string): string[] {
    const paramRegex = /:(\w+)/g;
    const params: string[] = [];
    let match;
    while ((match = paramRegex.exec(path)) !== null) {
      params.push(match[1]);
    }
    return params;
  }

  /**
   * Generates a documentation template for REST API endpoints.
   * @param endpoints The extracted API endpoints.
   * @returns A formatted string for inclusion in JSDoc.
   */
  private generateApiDocTemplate(endpoints: ApiEndpoint[]): string {
    if (endpoints.length === 0) return "";

    let doc = "\n\n## API Endpoints\n";
    endpoints.forEach((endpoint) => {
      doc += `\n### ${endpoint.method} ${endpoint.path}\n`;
      if (endpoint.description) {
        doc += `${endpoint.description}\n`;
      }
      if (endpoint.params && endpoint.params.length > 0) {
        doc += `\n**Path Parameters:**\n`;
        endpoint.params.forEach((param) => {
          doc += `- \`${param}\`: [description]\n`;
        });
      }
      if (
        endpoint.middleware &&
        Array.isArray(endpoint.middleware) &&
        endpoint.middleware.length > 0
      ) {
        doc += `\n**Middleware:**\n`;
        endpoint.middleware.forEach((mw) => {
          doc += `- ${mw}\n`;
        });
      }
      // Placeholder for query params, body, and responses
      doc += `\n**Query Parameters:**\n- None\n`;
      doc += `\n**Request Body:**\n\`\`\`json\n// Example request body\n\`\`\`\n`;
      doc += `\n**Response:**\n\`\`\`json\n// Example response\n\`\`\`\n`;
    });

    return doc;
  }

  /**
   * Hook called after JSDoc generation to enhance with API-specific documentation.
   * @param nodeContext The context of the node.
   * @param jsDoc The generated JSDoc content.
   * @returns Enhanced JSDoc content with API documentation.
   */
  async afterGenerateJSDoc(
    nodeContext: NodeContext,
    jsDoc: string,
  ): Promise<string> {
    let enhanced = jsDoc;

    // Add endpoint information if available
    const endpoints = nodeContext.customData?.apiEndpoints as
      | ApiEndpoint[]
      | undefined;
    if (endpoints && endpoints.length > 0) {
      const apiDoc = this.generateApiDocTemplate(endpoints);
      enhanced += apiDoc;
    }

    // Add middleware information
    const middleware = nodeContext.customData?.middleware;
    if (middleware && Array.isArray(middleware) && middleware.length > 0) {
      enhanced += `\n@middleware ${middleware.join(", ")}`;
    }

    return enhanced;
  }
}
