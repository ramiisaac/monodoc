# Monodoc AI SDK Configuration Example

This example demonstrates how to configure the AI SDK integration in monodoc for production use.

## Environment Variables

First, set up your API keys:

```bash
export OPENAI_API_KEY="your-openai-api-key"
export ANTHROPIC_API_KEY="your-anthropic-api-key"
export GOOGLE_API_KEY="your-google-api-key"
```

## Configuration File

Create a `monodoc.config.yaml` file:

```yaml
# Workspace configuration
workspaceDirs:
  - "src"
  - "packages"
  - "libs"

# Include patterns for TypeScript files
includePatterns:
  - "**/*.ts"
  - "**/*.tsx"

# Ignore patterns
ignorePatterns:
  - "node_modules/**"
  - "dist/**"
  - "build/**"
  - "**/*.test.ts"
  - "**/*.spec.ts"

# AI Models Configuration
aiModels:
  # Generation models
  - id: "openai-gpt4o"
    provider: "openai"
    model: "gpt-4o"
    type: "generation"
    apiKeyEnvVar: "OPENAI_API_KEY"
    temperature: 0.7
    maxOutputTokens: 1500
    
  - id: "anthropic-sonnet"
    provider: "anthropic"
    model: "claude-3-5-sonnet-20241022"
    type: "generation"
    apiKeyEnvVar: "ANTHROPIC_API_KEY"
    temperature: 0.6
    maxOutputTokens: 1500
    
  - id: "google-flash"
    provider: "google"
    model: "gemini-1.5-flash"
    type: "generation"
    apiKeyEnvVar: "GOOGLE_API_KEY"
    temperature: 0.8
    maxOutputTokens: 1000
    
  # Embedding models
  - id: "openai-embedding-small"
    provider: "openai"
    model: "text-embedding-3-small"
    type: "embedding"
    apiKeyEnvVar: "OPENAI_API_KEY"
    dimensions: 1536
    
  - id: "openai-embedding-large"
    provider: "openai"
    model: "text-embedding-3-large"
    type: "embedding"
    apiKeyEnvVar: "OPENAI_API_KEY"
    dimensions: 3072

# AI Client Configuration
aiClientConfig:
  defaultGenerationModelId: "openai-gpt4o"
  defaultEmbeddingModelId: "openai-embedding-small"
  maxConcurrentRequests: 5
  requestDelayMs: 100
  maxRetries: 3
  retryDelayMs: 1000
  maxTokensPerBatch: 10000

# Embedding Configuration
embeddingConfig:
  enabled: true
  modelId: "openai-embedding-small"
  minRelationshipScore: 0.7
  maxRelatedSymbols: 10
  embeddingBatchSize: 100

# JSDoc Configuration
jsdocConfig:
  prioritizeExports: true
  includePrivate: false
  includeNodeKinds:
    - "FunctionDeclaration"
    - "ClassDeclaration"
    - "InterfaceDeclaration"
    - "TypeAliasDeclaration"
    - "MethodDefinition"
    - "VariableDeclaration"
  excludeNodeKinds:
    - "ImportDeclaration"
    - "ExportDeclaration"
  maxSnippetLength: 500
  generateExamples: true
  overwriteExisting: false
  mergeExisting: true
  minJsdocLength: 50
  includeSymbolReferences: true
  includeRelatedSymbols: true

# Output Configuration
outputConfig:
  reportFileName: "monodoc-report.json"
  reportDir: "docs/reports"
  logLevel: "info"

# Performance Configuration
performance:
  enableCaching: true
  maxConcurrentFiles: 4
  batchSize: 10
  timeoutMs: 300000

# Quality Thresholds
qualityThresholds:
  minimumScore: 7.5
  requireDescriptions: true
  requireExamples: false
  requireParams: true
  requireReturns: true

# Runtime flags
dryRun: false
forceOverwrite: false
noMergeExisting: false
disableEmbeddings: false
```

## Usage Examples

### Basic Usage

```bash
# Generate JSDoc for entire workspace
npx monodoc generate

# Dry run to see what would be generated
npx monodoc generate --dry-run

# Use specific model
npx monodoc generate --model anthropic-sonnet

# Target specific paths
npx monodoc generate --target-paths src/core src/utils
```

### Advanced Usage

```bash
# Force overwrite existing JSDoc
npx monodoc generate --force-overwrite

# Disable embeddings for faster processing
npx monodoc generate --no-embed

# Generate with verbose logging
npx monodoc generate --verbose

# Watch mode for development
npx monodoc watch

# Quality check existing documentation
npx monodoc quality-check

# Benchmark performance
npx monodoc benchmark
```

## Model Selection Guidelines

### For High-Quality Documentation (Recommended)
- **Primary**: `openai-gpt4o` - Best balance of quality and speed
- **Alternative**: `anthropic-sonnet` - Excellent for complex code explanations

### For Fast Processing
- **Primary**: `google-flash` - Fastest generation
- **Alternative**: `openai-gpt4o-mini` (if configured)

### For Cost-Effective Processing
- **Primary**: `google-flash` - Most cost-effective
- **Alternative**: `anthropic-haiku` (if configured)

## Best Practices

1. **Start with dry runs** to understand the scope
2. **Use incremental mode** for large codebases
3. **Set appropriate quality thresholds** based on your needs
4. **Enable caching** for repeated runs
5. **Monitor API costs** using the built-in cost estimation
6. **Use embeddings** for better context-aware documentation

## Troubleshooting

### Common Issues

1. **API Key Not Found**
   ```bash
   # Verify environment variables are set
   echo $OPENAI_API_KEY
   ```

2. **Rate Limiting**
   ```yaml
   # Increase delays in configuration
   aiClientConfig:
     requestDelayMs: 200
     maxConcurrentRequests: 3
   ```

3. **Large Codebases**
   ```yaml
   # Optimize for large codebases
   performance:
     maxConcurrentFiles: 2
     batchSize: 5
   ```

4. **Memory Issues**
   ```bash
   # Increase Node.js memory limit
   NODE_OPTIONS="--max-old-space-size=8192" npx monodoc generate
   ```