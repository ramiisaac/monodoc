# monodoc: AI-Powered JSDoc Generator for TypeScript Monorepos

[![npm version](https://badge.fury.io/js/monodoc.svg)](https://www.npmjs.com/package/monodoc)
[![GitHub Package](https://img.shields.io/badge/GitHub%20Package-Available-blue?logo=github)](https://github.com/ramiisaac/monodoc/packages/monodoc)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-brightgreen.svg)](https://nodejs.org/)
[![Downloads](https://img.shields.io/npm/dm/monodoc.svg)](https://www.npmjs.com/package/monodoc)

A production-ready tool for generating comprehensive JSDoc documentation in TypeScript monorepos using AI. Features **Vercel AI SDK integration**, **intelligent caching**, and **quality analysis** to streamline documentation workflows.

## Features

### ALL Major LLM Providers Supported

- Seamless integration with all major LLM providers via built-in Vercel AI SDK, including OpenAI, Google Gemini, Anthropic Claude, and Ollama (local)
- Unified API for text generation and embeddings
- Intelligent fallback and load balancing managed by the SDK

### Performance Optimizations

- Intelligent caching reduces AI API costs by up to 70%
- Concurrent file processing on multi-core machines (50+ files per minute)
- Memory-efficient processing for large monorepos (under 200MB for 10,000+ files)
- Incremental processing for fast CI/CD integration

### Developer Experience

- Interactive configuration wizard
- Real-time documentation updates in watch mode
- Comprehensive quality analysis and recommendations
- Extensible plugin system for custom strategies

### Enterprise Features

- Production-ready configuration templates
- Performance monitoring and telemetry (opt-in)
- Multi-language template support (planned)
- CI/CD integration examples

## Installation and Setup

### Installation

#### From NPM (Recommended)

```bash
# Install globally
npm install -g monodoc
# Or install in your project
npm install --save-dev monodoc
```

#### From GitHub Packages

```bash
# Configure registry first
npm config set @raisaac:registry https://npm.pkg.github.com
# Install globally
npm install -g @raisaac/monodoc
# Or install in your project
npm install --save-dev @raisaac/monodoc
```

### Quick Start

```bash
# 1. Interactive setup wizard (creates jsdoc-config.yaml)
monodoc setup

# 2. Set your AI API key as an environment variable (e.g., for OpenAI)
export OPENAI_API_KEY="sk-..."
# Or save it globally/locally via CLI:
monodoc --api-key YOUR_OPENAI_KEY --save-api-key global

# 3. Preview changes without modifying files
monodoc generate --dry-run

# 4. Generate documentation
monodoc generate
```

## Usage

### Basic Commands

```bash
# Generate JSDoc for entire monorepo (default command)
monodoc generate

# Watch mode for development
monodoc watch

# Process only changed files (great for CI)
monodoc incremental

# Quality analysis
monodoc quality-check

# Performance benchmarking
monodoc benchmark

# Validate your config file
monodoc validate-config
```

### Advanced Usage

```bash
# Generate docs with a custom configuration file
monodoc generate --config production-config.yaml

# Target specific files or patterns
monodoc generate "packages/ui/**/*.tsx" "src/utils/helpers.ts"

# Force overwrite existing JSDoc comments
monodoc generate --force-overwrite

# Disable embedding-based relationship analysis for a faster run
monodoc generate --no-embed

# Override the default AI model for a specific run
monodoc generate --model gpt-4o-mini
```

## Configuration

The primary configuration file is `jsdoc-config.yaml` (or `.json`).
A basic setup can be created using `ai-jsdoc setup`.

### Example `jsdoc-config.yaml`

```yaml
workspaceDirs:
  - packages
  - apps
aiModels:
  - id: openai-gpt4o
    provider: openai
    model: gpt-4o
    type: generation
    apiKeyEnvVar: OPENAI_API_KEY
    temperature: 0.2
    maxOutputTokens: 4096
  - id: openai-embedding
    provider: openai
    model: text-embedding-3-small
    type: embedding
    apiKeyEnvVar: OPENAI_API_KEY
    dimensions: 1536
aiClientConfig:
  defaultGenerationModelId: openai-gpt4o
  defaultEmbeddingModelId: openai-embedding
  maxConcurrentRequests: 3
  requestDelayMs: 500
  maxRetries: 3
  retryDelayMs: 1000
  maxTokensPerBatch: 8000
embeddingConfig:
  enabled: false # Embeddings disabled by default for basic config
  modelId: openai-embedding
  minRelationshipScore: 0.7
  maxRelatedSymbols: 3
jsdocConfig:
  generateExamples: true
  mergeExisting: true
  includePrivate: false
  minJsdocLength: 50
outputConfig:
  logLevel: info
  reportDir: ./reports/basic
```

### Enterprise Configuration

See [examples/configurations/enterprise.yaml](examples/configurations/enterprise.yaml) for a full enterprise setup demonstrating:

- Multi-provider fallback strategies
- Advanced caching and performance tuning
- Quality thresholds and telemetry settings
- Custom node inclusion/exclusion rules

## Supported AI Providers (via Vercel AI SDK)

The tool supports models from various providers through the Vercel AI SDK. Configure them in your `jsdoc-config.yaml` under `aiModels`.

### OpenAI

```yaml
- id: openai-gpt4o-mini
  provider: openai
  model: gpt-4o-mini
  type: generation
  apiKeyEnvVar: OPENAI_API_KEY
```

### Google (Gemini)

```yaml
- id: google-gemini-flash
  provider: google
  model: gemini-1.5-flash
  type: generation
  apiKeyEnvVar: GOOGLE_API_KEY
```

### Anthropic (Claude)

```yaml
- id: anthropic-haiku
  provider: anthropic
  model: claude-3-haiku-20240307
  type: generation
  apiKeyEnvVar: ANTHROPIC_API_KEY
```

### Ollama (Local LLMs)

```yaml
- id: ollama-llama3
  provider: ollama
  model: llama3
  type: generation
  apiKeyEnvVar: OLLAMA_HOST # Typically `OLLAMA_HOST` or `OLLAMA_BASE_URL`
  baseUrl: http://localhost:11434
```

## Plugin System

The plugin system allows for powerful customizations and extensions.
Plugins can hook into `beforeProcessing` (to modify node context), `afterProcessing` (to modify generated JSDoc), and `onComplete` (for final reporting/actions).

### Built-in Plugins

- **React Component Plugin**: Enhanced JSDoc for React components with prop analysis.
- **API Documentation Plugin**: Special handling for REST/GraphQL endpoints.
- **Library Documentation Plugin**: Special handling for shared library components (example not provided in this package but can be implemented).

### Example Plugin Registration in `jsdoc-config.yaml`

```yaml
plugins:
  - name: react-component-plugin # Name must match the plugin's exported class name
    enabled: true
    options:
      enhanceProps: true
      detectHooks: true
  - name: api-documentation-plugin
    enabled: true
    options:
      generateExamples: true
      includeMiddleware: true
      detectValidation: true
  # Example of a custom plugin if you have one locally
  # - name: MyCustomMonorepoPlugin
  #   enabled: true
  #   path: "./src/plugins/MyCustomMonorepoPlugin.ts" # Relative path from project root
```

## Quality Analysis

The tool provides comprehensive quality scoring to help improve your codebase documentation.
It assesses:

- **Completeness**: How much of the expected JSDoc is present.
- **Consistency**: Adherence to JSDoc standards and patterns.
- **Example Quality**: Presence and quality of code examples.
- **Relationship Mapping**: Cross-reference accuracy via embeddings.

### Run a Quality Check

```bash
ai-jsdoc quality-check
```

```
📊 Quality Analysis Report
Overall Score: 87/100
Quality Metrics:
- Completeness: 92.3%
- Consistency: 89.1%
- Example Quality: 78.4%
Recommendations:
- Add more examples for utility functions
- Improve parameter descriptions in API modules
```

## CI/CD Integration

Integrate `monodoc` into your CI/CD pipeline to automate documentation updates.

### GitHub Actions

```yaml
name: Update Documentation
on:
  push:
    branches: [main]
jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
      - name: Install monodoc
        run: npm install -g monodoc
      - name: Generate JSDoc incrementally
        run: monodoc incremental --config jsdoc-config.production.yaml # Use a production-tuned config
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }} # Ensure all necessary API keys are set
          GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
          NODE_ENV: production # Important for triggering production optimizations
      - name: Commit & Push changes
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          # Only commit if there are actual changes
          git add .
          git diff --cached --exit-code || git commit -m "docs: auto-update JSDoc [skip ci]" # [skip ci] to prevent infinite loop
          git push
```

### GitLab CI

```yaml
update-docs:
  stage: documentation
  script:
    - npm install -g monodoc
    - monodoc incremental
  variables:
    OPENAI_API_KEY: $OPENAI_API_KEY # Or other AI provider key
  only:
    - main
```

## Performance Benchmarks

Run benchmarks to understand and optimize the tool's performance on your codebase.

### Run Benchmarks

```bash
ai-jsdoc benchmark
```

### Optimization Tips

1. **Enable Caching**: Set `performance.enableCaching: true` in your config to reduce repeat processing and AI API calls.
2. **Use Incremental Mode**: `ai-jsdoc incremental` only processes changed files, ideal for CI.
3. **Optimize Concurrency**: Adjust `aiClientConfig.maxConcurrentRequests` and `performance.maxConcurrentFiles` in your config.
4. **Local LLM**: Using Ollama allows for unlimited local processing, bypassing external AI API rate limits.

## Security and Privacy

- **AI API Keys**: Stored securely in environment variables (recommended) or encrypted local/global files.
- **Telemetry**: Optional and fully anonymized.
- **Local Processing**: Ollama support enables processing in air-gapped or privacy-sensitive environments.
- **Data Handling**: No code or generated documentation is stored externally without explicit configuration.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and contribution guidelines.

## Examples

Explore the `examples/` directory for various configurations and usage patterns:

- **Monorepo Configurations**: `basic.yaml`, `enterprise.yaml`, `nextjs.yaml`, `nx-monorepo.yaml`, `production.yaml`
- **Plugin Examples**: `api-documentation.ts`, `react-component.ts`
- **Workflow Examples**: `complete.ts`, `quickstart.ts`

## Troubleshooting

### Common Issues

**AI API Key Error**

```bash
# Ensure AI API key is set in environment:
export OPENAI_API_KEY=your-key-here # Or GOOGLE_API_KEY, ANTHROPIC_API_KEY, OLLAMA_HOST
# Validate your config:
ai-jsdoc validate-config
```

**Performance Issues**

````bash
ai-jsdoc generate --cache-clear # Clear cache to test fresh run
ai-jsdoc benchmark # Run benchmarks to identify bottlenecks
ai-jsdoc generate --performance # Generate detailed performance report```
**Quality Issues**
```bash
ai-jsdoc quality-check # Run quality analysis
````

### Debug Mode

```bash
DEBUG_JSDOC_GEN=true ai-jsdoc generate --verbose
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://github.com/ramiisaac/monodoc#readme)
- 🐛 [Issues](https://github.com/ramiisaac/monodoc/issues)
- 💬 [Discussions](https://github.com/ramiisaac/monodoc/discussions)
- 📧 [Email Support](mailto:raisaac@icloud.com)
