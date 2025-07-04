import { Plugin, NodeContext, GeneratorConfig } from '../../src/types';
import { logger } from '../../src/utils/logger';
import { BasePlugin } from '../../src/plugins/BasePlugin';

/**
 * A plugin to enhance documentation for Node.js backend services.
 * It identifies Express routes, database models, middleware, and service classes.
 */
export class NodeBackendPlugin extends BasePlugin implements Plugin {
  name = 'node-backend-plugin';
  version = '1.0.0';
  description = 'Enhanced documentation for Node.js backend services including Express routes, models, and services.';

  constructor(config: GeneratorConfig) {
    super(config);
  }

  /**
   * Initializes the plugin.
   */
  async initialize(config: GeneratorConfig): Promise<void> {
    await super.initialize(config);
    logger.info(`🔌 Initializing Node.js Backend Plugin v${this.version}`);
  }

  /**
   * Lifecycle hook before processing a node.
   * Identifies backend-specific patterns and extracts relevant metadata.
   */
  async beforeProcessing(context: NodeContext): Promise<NodeContext> {
    const backendMetadata = this.extractBackendMetadata(context);
    
    if (backendMetadata.isBackendComponent) {
      return {
        ...context,
        customData: {
          ...context.customData,
          ...backendMetadata,
        },
      };
    }
    return context;
  }

  /**
   * Lifecycle hook after AI processing.
   * Enhances JSDoc with backend-specific documentation.
   */
  async afterProcessing(context: NodeContext, result: string): Promise<string> {
    if (context.customData?.isBackendComponent) {
      return this.addBackendDocumentation(result, context);
    }
    return result;
  }

  /**
   * Extracts backend-specific metadata from the node context.
   */
  private extractBackendMetadata(context: NodeContext): any {
    const code = context.codeSnippet;
    const metadata: any = { isBackendComponent: false };

    // Express route handlers
    if (this.isExpressRoute(code)) {
      metadata.isBackendComponent = true;
      metadata.componentType = 'express-route';
      metadata.httpMethod = this.extractHttpMethod(code);
      metadata.routePath = this.extractExpressRoute(code);
      metadata.middleware = this.extractExpressMiddleware(code);
    }

    // Database models (Mongoose, Sequelize, etc.)
    if (this.isDatabaseModel(code)) {
      metadata.isBackendComponent = true;
      metadata.componentType = 'database-model';
      metadata.modelType = this.extractModelType(code);
      metadata.schema = this.extractSchemaFields(code);
    }

    // Service classes
    if (this.isServiceClass(context)) {
      metadata.isBackendComponent = true;
      metadata.componentType = 'service-class';
      metadata.methods = this.extractServiceMethods(code);
      metadata.dependencies = this.extractDependencies(code);
    }

    // Middleware functions
    if (this.isMiddleware(code)) {
      metadata.isBackendComponent = true;
      metadata.componentType = 'middleware';
      metadata.middlewareType = this.classifyMiddleware(code);
    }

    return metadata;
  }

  /**
   * Determines if the code is an Express route handler.
   */
  private isExpressRoute(code: string): boolean {
    return /(?:app|router)\.(get|post|put|delete|patch|all)\s*\(/.test(code) ||
           /export\s+(default\s+)?(async\s+)?function\s+(get|post|put|delete|patch)/i.test(code);
  }

  /**
   * Determines if the code represents a database model.
   */
  private isDatabaseModel(code: string): boolean {
    return code.includes('Schema') || 
           code.includes('model') || 
           code.includes('sequelize.define') ||
           code.includes('@Entity') ||
           code.includes('createTable');
  }

  /**
   * Determines if the code is a service class.
   */
  private isServiceClass(context: NodeContext): boolean {
    return (context.nodeKind === 'ClassDeclaration' && 
            (context.nodeName.toLowerCase().includes('service') ||
             context.nodeName.toLowerCase().includes('controller') ||
             context.nodeName.toLowerCase().includes('repository'))) ||
           context.codeSnippet.includes('@Service') ||
           context.codeSnippet.includes('@Controller');
  }

  /**
   * Determines if the code is middleware.
   */
  private isMiddleware(code: string): boolean {
    return /function\s+\w*\s*\([^)]*req[^)]*res[^)]*next/.test(code) ||
           /\([^)]*req[^)]*res[^)]*next[^)]*\)\s*=>/.test(code) ||
           code.includes('next()');
  }

  /**
   * Extracts HTTP method from Express route.
   */
  private extractHttpMethod(code: string): string {
    const methodMatch = code.match(/(?:app|router)\.(get|post|put|delete|patch|all)/i) ||
                       code.match(/export\s+(default\s+)?(async\s+)?function\s+(get|post|put|delete|patch)/i);
    return methodMatch ? methodMatch[methodMatch.length - 1].toUpperCase() : 'UNKNOWN';
  }

  /**
   * Extracts route path from Express route definition.
   */
  private extractExpressRoute(code: string): string {
    const routeMatch = code.match(/(?:app|router)\.(?:get|post|put|delete|patch|all)\s*\(\s*['"`]([^'"`]+)['"`]/);
    return routeMatch ? routeMatch[1] : '/unknown';
  }

  /**
   * Extracts middleware from Express route.
   */
  private extractExpressMiddleware(code: string): string[] {
    const middleware: string[] = [];
    
    // Common middleware patterns
    if (code.includes('authenticate')) middleware.push('authentication');
    if (code.includes('authorize')) middleware.push('authorization');
    if (code.includes('validate')) middleware.push('validation');
    if (code.includes('rateLimit')) middleware.push('rate-limiting');
    if (code.includes('cors')) middleware.push('CORS');
    if (code.includes('helmet')) middleware.push('security');
    if (code.includes('upload')) middleware.push('file-upload');
    
    return middleware;
  }

  /**
   * Extracts model type (Mongoose, Sequelize, etc.).
   */
  private extractModelType(code: string): string {
    if (code.includes('mongoose') || code.includes('Schema')) return 'mongoose';
    if (code.includes('sequelize')) return 'sequelize';
    if (code.includes('@Entity')) return 'typeorm';
    if (code.includes('prisma')) return 'prisma';
    return 'unknown';
  }

  /**
   * Extracts schema fields from model definition.
   */
  private extractSchemaFields(code: string): string[] {
    const fields: string[] = [];
    
    // Simple field extraction for common patterns
    const fieldMatches = code.match(/(\w+):\s*\{[^}]*type:/g);
    if (fieldMatches) {
      fieldMatches.forEach(match => {
        const fieldName = match.split(':')[0].trim();
        if (fieldName) fields.push(fieldName);
      });
    }
    
    return fields;
  }

  /**
   * Extracts service methods from class.
   */
  private extractServiceMethods(code: string): string[] {
    const methods: string[] = [];
    const methodMatches = code.match(/(async\s+)?(\w+)\s*\([^)]*\)\s*\{/g);
    
    if (methodMatches) {
      methodMatches.forEach(match => {
        const methodName = match.match(/(\w+)\s*\(/)?.[1];
        if (methodName && methodName !== 'constructor') {
          methods.push(methodName);
        }
      });
    }
    
    return methods;
  }

  /**
   * Extracts dependencies from service class.
   */
  private extractDependencies(code: string): string[] {
    const dependencies: string[] = [];
    
    // Constructor injection patterns
    const constructorMatch = code.match(/constructor\s*\([^)]*\)/);
    if (constructorMatch) {
      const params = constructorMatch[0].match(/\w+:\s*\w+/g);
      if (params) {
        params.forEach(param => {
          const type = param.split(':')[1]?.trim();
          if (type) dependencies.push(type);
        });
      }
    }
    
    return dependencies;
  }

  /**
   * Classifies middleware type.
   */
  private classifyMiddleware(code: string): string {
    if (code.includes('authenticate') || code.includes('passport')) return 'authentication';
    if (code.includes('authorize') || code.includes('permission')) return 'authorization';
    if (code.includes('validate') || code.includes('joi') || code.includes('yup')) return 'validation';
    if (code.includes('rateLimit')) return 'rate-limiting';
    if (code.includes('cors')) return 'CORS';
    if (code.includes('helmet')) return 'security';
    if (code.includes('logger') || code.includes('morgan')) return 'logging';
    if (code.includes('compression')) return 'compression';
    return 'custom';
  }

  /**
   * Adds backend-specific documentation to JSDoc.
   */
  private addBackendDocumentation(currentJsDoc: string, context: NodeContext): string {
    const metadata = context.customData;
    let enhanced = currentJsDoc;

    switch (metadata.componentType) {
      case 'express-route':
        enhanced += this.addRouteDocumentation(metadata);
        break;
      case 'database-model':
        enhanced += this.addModelDocumentation(metadata);
        break;
      case 'service-class':
        enhanced += this.addServiceDocumentation(metadata);
        break;
      case 'middleware':
        enhanced += this.addMiddlewareDocumentation(metadata);
        break;
    }

    return enhanced;
  }

  /**
   * Adds route-specific documentation.
   */
  private addRouteDocumentation(metadata: any): string {
    let docs = '';
    
    if (metadata.httpMethod && metadata.routePath) {
      docs += `\n@route ${metadata.httpMethod} ${metadata.routePath}`;
    }
    
    if (metadata.middleware?.length > 0) {
      docs += `\n@middleware ${metadata.middleware.join(', ')}`;
    }
    
    docs += `\n@apiSuccess {Object} response Success response object`;
    docs += `\n@apiError {Object} error Error response with message and status code`;
    
    return docs;
  }

  /**
   * Adds model-specific documentation.
   */
  private addModelDocumentation(metadata: any): string {
    let docs = '';
    
    if (metadata.modelType) {
      docs += `\n@model ${metadata.modelType} database model`;
    }
    
    if (metadata.schema?.length > 0) {
      docs += `\n@schema Fields: ${metadata.schema.join(', ')}`;
    }
    
    return docs;
  }

  /**
   * Adds service-specific documentation.
   */
  private addServiceDocumentation(metadata: any): string {
    let docs = '';
    
    if (metadata.methods?.length > 0) {
      docs += `\n@methods Available methods: ${metadata.methods.join(', ')}`;
    }
    
    if (metadata.dependencies?.length > 0) {
      docs += `\n@dependencies Injected dependencies: ${metadata.dependencies.join(', ')}`;
    }
    
    return docs;
  }

  /**
   * Adds middleware-specific documentation.
   */
  private addMiddlewareDocumentation(metadata: any): string {
    let docs = '';
    
    if (metadata.middlewareType) {
      docs += `\n@middleware ${metadata.middlewareType} middleware`;
    }
    
    docs += `\n@param {Request} req Express request object`;
    docs += `\n@param {Response} res Express response object`;
    docs += `\n@param {NextFunction} next Express next function`;
    
    return docs;
  }
}