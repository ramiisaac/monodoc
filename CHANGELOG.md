# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- 🚀 **Vercel AI SDK v5 Integration**: Replaced custom LLM abstraction with AI SDK for unified interaction with OpenAI, Google, Anthropic, and Ollama.
- 🎯 **Centralized AI Client**: Refactored `src/generator/AIClient.ts` to be a simplified, SDK-native interface.
- ♻️ **Refactored Configuration Model**: Simplified `src/config.ts` and `jsdoc-config.yaml` to directly map to AI SDK requirements.
- 💡 **Modular CLI Structure**: Overhauled `src/cli.ts` to use `commander.js` with isolated command handlers (`src/commands/*`).
- 🏃 **CommandRunner**: Introduced `src/cli/CommandRunner.ts` for managing command lifecycle and shared context.
- 📦 **Abstract Core Operations**: Extracted core end-to-end logic into high-level operations (`src/operations/*`).
- 🧩 **Decomposed JSDocGenerator**: Broke down `src/generator/JSDocGenerator.ts` into `FileProcessor.ts`, `DocumentationGenerator.ts`, `JSDocWriter.ts` (remaining `JSDocGenerator` acts as orchestrator).
- ⚡ **Parallel File Processing**: Implemented concurrent file processing using `p-limit` for performance.
- 🔍 **Clarified WorkspaceAnalyzer Role**: Refined `src/analyzer/WorkspaceAnalyzer.ts` to focus solely on project structure analysis.
- 🛠️ **Internal CodeAnalysis Tool (Foundation)**: Laid groundwork and interfaces for AI SDK `tool` integration, allowing LLMs to request dynamic context.
- 🌐 **External Toolkits Exploration**: Prepared for potential integration of `browser-tool` or `Freestyle` via plugin system.
- 🔌 **Plugin System Adaptation**: Updated `Plugin` interface to support `getTools()` for AI SDK tools.
- ✅ **Comprehensive Linting Fixes**: Addressed all `no-unused-vars`, `no-explicit-any`, `no-redeclare`, `no-undef`, and `no-useless-escape` errors.
- 🌳 **Complete Directory Structure**: Provided all missing files (examples, husky, github CI/CD, docs, etc.) for a full, ready-to-use project.
- ⚙️ **Node.js Module Type**: Added `"type": "module"` to `package.json` to explicitly define the project as an ES module, resolving Node.js warnings.

### Changed

- 🗑️ **Removed Custom LLM Abstraction**: Deleted `src/llm` directory and all custom provider implementations.
- 🧹 **Dependency Cleanup**: Removed deprecated LLM SDK packages (`@anthropic-ai/sdk`, `@google/generative-ai`, `openai`, `ollama`) from `package.json`.
- ✨ **Updated Dependencies**: Added new `@ai-sdk/*` packages for Vercel AI SDK integration.
- 📄 **Documentation Overhaul**: Updated `README.MD` and `docs/` content to reflect new features, CLI commands, and architecture.
- 📂 **Restructured Docs**: Organized `docs/` into `guides/`, `project/`, and `api/` for clearer separation of concerns.
- 🧪 **Improved Test Setup**: Enhanced `src/utils/test-setup.ts` for more robust mocking.
- 🔄 **Config Migration**: `ConfigMigrator.ts` updated to handle new `aiModels` and `aiClientConfig` structures.
- 🚀 **CLI Command Syntax**: Changed CLI commands from flags (e.g., `ai-jsdoc --generate`) to subcommands (e.g., `ai-jsdoc generate`).

### Fixed

- 🐛 **All Linting Errors**: Resolved over 100 linting problems across the codebase, ensuring strict type safety and code quality.
- 🧹 **Codebase Redundancy**: Eliminated duplicate `FileProcessor.ts` files and consolidated logic.
- ⚡ **Performance Logging**: Ensured performance metrics are accurately captured and reported.
- 🔒 **API Key Handling**: Improved clarity and consistency in API key detection and saving.
- 📄 **Documentation Gaps**: Filled in missing documentation and examples.

## [2.0.1] - 2024-01-20

### 🚀 Production-Ready Release

This release focuses on production readiness and open source deployment preparation, building upon the enterprise-grade foundation of v2.0.0.

### Added

- ✅ **Production-ready codebase** with comprehensive testing and validation
- 🔧 **Enhanced build pipeline** with automated quality checks
- 📊 **Performance optimizations** for large-scale deployments
- 🛡️ **Security audit compliance** with vulnerability resolution
- 📋 **Comprehensive documentation** for deployment and maintenance

### Changed

- 🔍 **All linting errors resolved** (40+ issues fixed)
- 📝 **TypeScript compilation** fully optimized
- 🔒 **Security vulnerabilities** addressed through dependency updates
- 📦 **Package distribution** optimized for npm registry

### Fixed

- 🚫 **Unused variables and imports** removed
- 🔧 **Type safety issues** resolved with proper TypeScript types
- ⚡ **Performance bottlenecks** in large monorepo processing
- 🔄 **Integration test stability** improved

## [2.0.0] - 2024-01-20

### 🎉 Major Release - Enterprise-Grade AI Documentation Generator

This release represents a complete rewrite and enhancement of the original monorepo JSDoc generator, introducing enterprise-level features, multi-LLM support, and production-ready optimizations.

### Added

#### 🤖 Multi-LLM Provider Support

- **OpenAI GPT-4/GPT-3.5 Turbo** integration with streaming support
- **Anthropic Claude 3** (Sonnet/Opus) with advanced reasoning capabilities
- **Google Gemini 1.5 Pro** with multi-modal support
- **Ollama Local LLM** for privacy-conscious deployments
- Automatic provider fallback and load balancing
- Health monitoring and provider switching

#### ⚡ Performance Enhancements

- Intelligent caching system reducing API costs by 70%
- Batch processing for efficient large-scale operations
- Incremental processing for CI/CD workflows
- Memory-efficient streaming for large codebases
- Performance monitoring with detailed metrics

#### 🧠 Advanced Features

- **Embedding-based analysis** for discovering code relationships
- **Smart documentation engine** with context-aware generation
- **Template system** with customizable documentation patterns
- **Plugin architecture** for extensible functionality
- **Watch mode** for real-time documentation updates
- **Quality analysis** with comprehensive scoring

#### �️ Developer Experience

- Interactive setup wizard for quick configuration
- Comprehensive CLI with rich options
- Real-time progress tracking
- Detailed error reporting and recovery
- Debug mode for troubleshooting

#### 📊 Analytics & Reporting

- Performance benchmarking tools
- Quality analysis reports
- Telemetry collection (opt-in)
- Comprehensive JSON and Markdown reports
- Analytics dashboard for monitoring

#### 🏢 Enterprise Features

- Production-optimized configurations
- Multi-workspace support
- Team collaboration features
- CI/CD integration examples
- Security and compliance options

### Changed

- Complete TypeScript rewrite for better type safety
- Migrated from single LLM to multi-provider architecture
- Enhanced prompt engineering for better JSDoc quality
- Improved error handling and recovery mechanisms
- Modernized CLI with better user experience

### Fixed

- Memory leaks in large monorepo processing
- Rate limiting issues with API providers
- Incorrect JSDoc placement in complex TypeScript files
- Symbol resolution in cross-package references
- Performance bottlenecks in file analysis

### Security

- API keys stored securely in environment variables
- Optional telemetry with full anonymization
- Support for air-gapped environments via Ollama
- No external code transmission without explicit configuration

## [1.0.0] - 2023-06-15

### Initial Release

- Basic JSDoc generation for TypeScript files
- OpenAI GPT-3.5 integration
- Simple CLI interface
- Basic monorepo support
- JSON configuration file support

---

## Upgrading from 1.x to 2.0

### Breaking Changes

1. Configuration file format has changed significantly
2. CLI commands have been restructured
3. API client initialization is different
4. Plugin system API has been redesigned

### Migration Guide

1. Run `ai-jsdoc setup` to create a new configuration
2. Update environment variables for API keys
3. Review new CLI options with `ai-jsdoc --help`
4. Update any custom plugins to new API

### New Requirements

- Node.js 18+ (previously 14+)
- TypeScript 4.5+ (previously 4.0+)
- Additional peer dependencies for LLM providers
  For detailed migration instructions, see [docs/project/MIGRATION.md](docs/project/MIGRATION.md).
