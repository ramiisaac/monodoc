# monodoc: AI-Powered JSDoc Generator for TypeScript Monorepos

[![npm version](https://badge.fury.io/js/monodoc.svg)](https://www.npmjs.com/package/monodoc)
[![GitHub Package](https://img.shields.io/badge/GitHub%20Package-Available-blue?logo=github)](https://github.com/ramiisaac/monodoc/packages/monodoc)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-brightgreen.svg)](https://nodejs.org/)
[![Downloads](https://img.shields.io/npm/dm/monodoc.svg)](https://www.npmjs.com/package/monodoc)
[![Test Coverage](https://img.shields.io/badge/Coverage-Comprehensive-green.svg)](./coverage)

A production-ready, enterprise-grade tool for generating comprehensive JSDoc documentation in TypeScript monorepos using AI. Features **Vercel AI SDK integration**, **intelligent caching**, **cost control measures**, and **quality analysis** to streamline documentation workflows at scale.

## ✨ Key Features

### 🤖 ALL Major LLM Providers Supported
- **Vercel AI SDK Integration**: Seamless integration with OpenAI GPT-4, Google Gemini, Anthropic Claude, and Ollama (local)
- **Unified API**: Single interface for text generation and embeddings across all providers
- **Intelligent Fallback**: Automatic provider switching and load balancing
- **Cost Control**: Built-in spending limits and usage monitoring to prevent unexpected bills

### ⚡ Performance & Scale
- **Intelligent Caching**: Reduces AI API costs by up to 70% with smart cache invalidation
- **Concurrent Processing**: Multi-core optimization processes 50+ files per minute
- **Memory Efficient**: Handles 10,000+ files using under 200MB memory
- **Incremental Updates**: Process only changed files for lightning-fast CI/CD integration
- **Gitignore Integration**: Automatically respects .gitignore patterns with override capabilities

### 🎯 Developer Experience
- **Interactive Setup Wizard**: Get started in minutes with guided configuration
- **Watch Mode**: Real-time documentation updates during development
- **Quality Analysis**: Comprehensive quality scoring and actionable recommendations
- **Intuitive CLI**: Streamlined command-line interface with helpful defaults
- **IDE Integration**: VS Code tasks and npm scripts generation

### 🏢 Enterprise Ready
- **Production Templates**: Battle-tested configurations for Next.js, Nx, Turborepo, React Native, Vue.js
- **Plugin System**: Extensible architecture with React, API, Node.js backend, and TypeScript utility plugins
- **CI/CD Examples**: GitHub Actions, pre-commit hooks, and pipeline integration guides
- **Comprehensive Examples**: 15+ example configurations covering all major frameworks and workflows
- **Telemetry & Monitoring**: Optional performance monitoring and usage analytics

## 🚀 Quick Start

### Installation

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

## 📖 Usage

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

# Get help for any command
monodoc --help
monodoc generate --help
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

# Clear cache before processing
monodoc generate --cache-clear

# Run in analyze-only mode for debugging
monodoc generate --analyze-only
```

## ⚙️ Configuration

The primary configuration file is `jsdoc-config.yaml` (or `.json`).
A basic setup can be created using `monodoc setup`.

### Example `jsdoc-config.yaml`

```yaml
# Workspace configuration
workspaceDirs:
  - packages
  - apps
  - libs

# AI model definitions
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

# AI client configuration
aiClientConfig:
  defaultGenerationModelId: openai-gpt4o
  defaultEmbeddingModelId: openai-embedding
  maxConcurrentRequests: 5
  requestDelayMs: 200
  maxRetries: 3

# Cost control (NEW)
costControl:
  enabled: true
  maxDailyCost: 50.00
  maxMonthlyCost: 500.00
  alertThresholds: [0.8, 0.9]

# Gitignore integration (NEW)
gitignoreIntegration:
  enabled: true
  respectGitignore: true
  allowOverrides: true

# Plugin configuration
plugins:
  - name: react-component-plugin
    enabled: true
    options:
      enhanceProps: true
      detectHooks: true
  - name: api-documentation-plugin
    enabled: true
    options:
      generateExamples: true

# Quality thresholds
qualityThresholds:
  minimumScore: 80
  requireDescriptions: true
  requireParams: true
  requireReturns: true
```

## 🎯 Examples & Templates

### Framework-Specific Configurations

We provide battle-tested configurations for popular frameworks:

#### Next.js Applications
```bash
# Use the Next.js optimized configuration
cp examples/community/nextjs-config.yaml jsdoc-config.yaml
```

#### Nx Monorepos
```bash
# Enterprise-grade Nx configuration
cp examples/community/nx-monorepo.yaml jsdoc-config.yaml
```

#### React Native Projects
```bash
# Mobile-optimized configuration
cp examples/community/react-native.yaml jsdoc-config.yaml
```

#### Turborepo Workspaces
```bash
# High-performance Turborepo setup
cp examples/community/turborepo.yaml jsdoc-config.yaml
```

#### Vue.js Applications
```bash
# Vue 3 with Composition API support
cp examples/community/vue.yaml jsdoc-config.yaml
```

### Plugin Examples

Extend functionality with our comprehensive plugin examples:

- **React Component Plugin** (`examples/plugins/react-component.ts`)
  - Analyzes React components, props, and hook usage
  - Generates component-specific JSDoc tags
  
- **API Documentation Plugin** (`examples/plugins/api-documentation.ts`)
  - Enhances API routes with HTTP methods, middleware, and examples
  - Perfect for Next.js API routes and Express endpoints
  
- **Node.js Backend Plugin** (`examples/plugins/node-backend.ts`)
  - Comprehensive backend service documentation
  - Express routes, database models, middleware, and service classes
  
- **TypeScript Utils Plugin** (`examples/plugins/typescript-utils.ts`)
  - Advanced TypeScript pattern documentation
  - Utility types, generics, conditional types, and mapped types

### Workflow Examples

Integrate monodoc into your development workflow:

#### CI/CD Integration (`examples/workflows/ci-integration.ts`)
```bash
# GitHub Actions
node examples/workflows/ci-integration.js github-actions

# General CI/CD pipeline
node examples/workflows/ci-integration.js ci

# Pre-commit hooks
node examples/workflows/ci-integration.js pre-commit
```

#### Development Workflows (`examples/workflows/development-workflows.ts`)
```bash
# Interactive development mode
node examples/workflows/development-workflows.js interactive

# Watch mode for development
node examples/workflows/development-workflows.js watch

# Generate VS Code tasks
node examples/workflows/development-workflows.js vscode-tasks
```

### Complete Workflow Example (`examples/workflows/complete.ts`)
Demonstrates end-to-end usage including:
- Initial setup and analysis
- Incremental updates
- Quality checking
- Report generation

## 🔌 Plugin System

The plugin system allows for powerful customizations and extensions.
Plugins can hook into `beforeProcessing` (to modify node context), `afterProcessing` (to modify generated JSDoc), and `onComplete` (for final reporting/actions).

### Built-in Plugins

- **React Component Plugin**: Enhanced JSDoc for React components with prop analysis and hook detection
- **API Documentation Plugin**: Special handling for REST/GraphQL endpoints with route and middleware detection

### Custom Plugin Example

```typescript
import { Plugin, NodeContext, GeneratorConfig } from 'monodoc';

export class MyCustomPlugin implements Plugin {
  name = 'my-custom-plugin';
  
  async beforeProcessing(context: NodeContext): Promise<NodeContext> {
    // Modify context before AI processing
    return context;
  }
  
  async afterProcessing(context: NodeContext, result: string): Promise<string> {
    // Enhance the generated JSDoc
    return result;
  }
}
```

### Plugin Registration in `jsdoc-config.yaml`

```yaml
plugins:
  - name: react-component-plugin
    enabled: true
    options:
      enhanceProps: true
      detectHooks: true
  - name: api-documentation-plugin
    enabled: true
    options:
      generateExamples: true
      includeMiddleware: true
  - name: node-backend-plugin
    enabled: true
  - name: typescript-utils-plugin
    enabled: true
```

## 🎯 Quality Analysis

The tool provides comprehensive quality scoring to help improve your codebase documentation with actionable insights.

### Quality Metrics

- **Completeness**: How much of the expected JSDoc is present
- **Consistency**: Adherence to JSDoc standards and patterns  
- **Example Quality**: Presence and quality of code examples
- **Relationship Mapping**: Cross-reference accuracy via embeddings
- **Parameter Coverage**: Documentation of function parameters and return values

### Run a Quality Check

```bash
monodoc quality-check

# With specific quality thresholds
monodoc quality-check --min-score 85
```

**Sample Output:**
```
📊 Quality Analysis Report
═══════════════════════════════════════════════════════════════
Overall Score: 87/100 ✅

Quality Metrics:
  Completeness:    92.3% ✅
  Consistency:     89.1% ✅  
  Example Quality: 78.4% ⚠️
  Coverage:        94.7% ✅

📝 Recommendations:
  • Add more examples for utility functions in /src/utils
  • Improve parameter descriptions in API modules
  • Consider adding @throws documentation for error cases
  
📈 Trends (vs last run):
  Overall Score:   +2.3% ↗️
  Example Quality: +5.1% ↗️
```

## 🚀 CI/CD Integration

Integrate `monodoc` into your CI/CD pipeline to automate documentation updates with enterprise-grade reliability.

### GitHub Actions

```yaml
name: Update Documentation
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  documentation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Install monodoc
        run: npm install -g monodoc
        
      - name: Generate documentation
        run: monodoc generate --config .github/jsdoc-config.yaml
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          CI: true
          
      - name: Quality check
        run: monodoc quality-check --min-score 80
        
      - name: Upload coverage reports
        uses: actions/upload-artifact@v4
        with:
          name: documentation-reports
          path: reports/
```

### Pre-commit Hooks

```bash
# Install husky for git hooks
npm install --save-dev husky

# Create pre-commit hook
npx husky add .husky/pre-commit "monodoc generate --dry-run --target-changed-files"
```

### Jenkins Pipeline

```groovy
pipeline {
    agent any
    
    environment {
        OPENAI_API_KEY = credentials('openai-api-key')
    }
    
    stages {
        stage('Documentation') {
            steps {
                sh 'npm install -g monodoc'
                sh 'monodoc generate --config ci-config.yaml'
                sh 'monodoc quality-check --min-score 75'
            }
            
            post {
                always {
                    archiveArtifacts artifacts: 'reports/**/*', allowEmptyArchive: true
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: false,
                        keepAll: true,
                        reportDir: 'reports',
                        reportFiles: 'index.html',
                        reportName: 'Documentation Report'
                    ])
                }
            }
        }
    }
}
```

## 💰 Cost Control & Monitoring

Enterprise-grade cost control features prevent unexpected AI API bills:

### Built-in Cost Controls

```yaml
# In jsdoc-config.yaml
costControl:
  enabled: true
  maxDailyCost: 50.00      # Maximum daily spend
  maxMonthlyCost: 500.00   # Maximum monthly spend
  alertThresholds: [0.8, 0.9]  # Alert at 80% and 90%
  emergencyStop: true      # Auto-stop at 95% of limits
  
  # Provider-specific limits
  providerLimits:
    openai: 300.00         # Max monthly spend per provider
    anthropic: 200.00
```

### Monitoring & Alerts

```bash
# Check current usage
monodoc info --cost-usage

# Output:
# 💰 Cost Usage Report
# ═══════════════════════════════════════
# Current Month: $127.45 / $500.00 (25.5%)
# Today: $8.32 / $50.00 (16.6%)
# 
# By Provider:
#   OpenAI:     $89.23 (70.0%)
#   Anthropic:  $38.22 (30.0%)
# 
# Status: ✅ Within limits
```

## 🔧 Performance Optimization

### Caching Strategy

Intelligent caching reduces costs by up to 70%:

```yaml
cacheConfig:
  enabled: true
  ttl: 86400000           # 24 hours
  maxSize: 1000           # Max cached items
  compressionEnabled: true
  
  # Cache invalidation triggers
  invalidateOn:
    - fileChange: true
    - configChange: true
    - majorVersionUpdate: true
```

### Performance Monitoring

```bash
# Run performance benchmarks
monodoc benchmark

# Sample output:
# ⚡ Performance Benchmark
# ═══════════════════════════════════════
# Files Processed:    1,247 files
# Processing Speed:    52.3 files/minute
# Cache Hit Rate:      73.2%
# Memory Usage:        186 MB peak
# Total Duration:      23.8 seconds
# 
# AI Provider Performance:
#   OpenAI GPT-4:       avg 2.1s/request
#   Claude Sonnet:      avg 1.8s/request
#   Gemini Flash:       avg 1.2s/request
```

## 🛠️ Development

### NPM Scripts

Add these to your `package.json`:

```json
{
  "scripts": {
    "docs:generate": "monodoc generate",
    "docs:preview": "monodoc generate --dry-run --verbose",
    "docs:watch": "monodoc watch",
    "docs:quality": "monodoc quality-check",
    "docs:validate": "monodoc validate-config"
  }
}
```

### IDE Integration

#### VS Code Tasks

Generate VS Code tasks:

```bash
monodoc generate-vscode-tasks
```

This creates `.vscode/tasks.json` with:
- Documentation generation
- Watch mode
- Quality checks
- Configuration validation

### Environment Variables

```bash
# AI Provider API Keys
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export GOOGLE_API_KEY="AIza..."

# Optional: Ollama configuration
export OLLAMA_HOST="http://localhost:11434"

# Cost control notifications
export MONODOC_SLACK_WEBHOOK="https://hooks.slack.com/..."
export MONODOC_EMAIL_ALERTS="admin@company.com"

# Performance tuning
export MONODOC_MAX_WORKERS="8"
export MONODOC_CACHE_DIR="/tmp/monodoc-cache"
```

## 🚨 Troubleshooting

### Common Issues

#### API Key Issues
```bash
# Check saved credentials
monodoc info --list-credentials

# Test API connectivity
monodoc validate-config --test-apis
```

#### Performance Issues
```bash
# Clear cache and restart
monodoc generate --cache-clear

# Reduce concurrency
monodoc generate --max-concurrent 2

# Disable embeddings for speed
monodoc generate --no-embed
```

#### Quality Issues
```bash
# Get detailed quality report
monodoc quality-check --verbose --output-format json

# Analyze specific files
monodoc quality-check --target "src/problematic-file.ts"
```

### Debug Mode

```bash
# Enable debug logging
DEBUG=monodoc:* monodoc generate --verbose

# Or via environment
export DEBUG=monodoc:*
export LOG_LEVEL=debug
monodoc generate
```

## 📚 Documentation

- **[API Reference](./docs/api/)** - Complete API documentation
- **[Configuration Guide](./docs/configuration.md)** - Detailed configuration options
- **[Plugin Development](./docs/plugins.md)** - Creating custom plugins
- **[Migration Guide](./docs/migration.md)** - Upgrading from older versions
- **[Best Practices](./docs/best-practices.md)** - Recommended patterns and workflows

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/ramiisaac/monodoc.git
cd monodoc

# Install dependencies
npm install

# Run tests
npm test

# Run in development mode
npm run dev

# Build for production
npm run build
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[Vercel AI SDK](https://sdk.vercel.ai/)** - For the excellent AI provider abstraction
- **[TypeScript](https://www.typescriptlang.org/)** - For the powerful type system
- **[ts-morph](https://ts-morph.com/)** - For TypeScript AST manipulation
- **Community Contributors** - For feedback, bug reports, and feature requests

## 🔗 Links

- **[NPM Package](https://www.npmjs.com/package/monodoc)**
- **[GitHub Repository](https://github.com/ramiisaac/monodoc)**
- **[Issues & Bug Reports](https://github.com/ramiisaac/monodoc/issues)**
- **[Discussions](https://github.com/ramiisaac/monodoc/discussions)**
- **[Release Notes](CHANGELOG.md)**

---

**Made with ❤️ by [Rami Isaac](https://ramiisaac.com) and the monodoc community.**
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
monodoc benchmark
```

### Optimization Tips

1. **Enable Caching**: Set `performance.enableCaching: true` in your config to reduce repeat processing and AI API calls.
2. **Use Incremental Mode**: `monodoc incremental` only processes changed files, ideal for CI.
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
monodoc validate-config
```

**Performance Issues**

````bash
monodoc generate --cache-clear # Clear cache to test fresh run
monodoc benchmark # Run benchmarks to identify bottlenecks
monodoc generate --performance # Generate detailed performance report```
**Quality Issues**
```bash
monodoc quality-check # Run quality analysis
````

### Debug Mode

```bash
DEBUG_JSDOC_GEN=true monodoc generate --verbose
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://github.com/ramiisaac/monodoc#readme)
- 🐛 [Issues](https://github.com/ramiisaac/monodoc/issues)
- 💬 [Discussions](https://github.com/ramiisaac/monodoc/discussions)
- 📧 [Email Support](mailto:raisaac@icloud.com)
