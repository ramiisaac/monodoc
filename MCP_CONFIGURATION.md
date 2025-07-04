# MCP Configuration for GitHub Copilot Coding Agent

## Overview

This MCP (Model Context Protocol) configuration enables GitHub Copilot Coding Agent to effectively understand and work with the monodoc repository. The configuration provides access to essential tools and context needed for TypeScript development, AI integration, and documentation generation.

## MCP Servers Configuration

### 1. File System Server (`filesystem`)
**Purpose**: Core file operations for reading/writing source code, configuration files, and documentation.

**Key Capabilities**:
- Read TypeScript source files in `src/` directory
- Write generated JSDoc comments and documentation
- Access configuration files (`package.json`, `tsconfig.json`, etc.)
- Manage example configurations in `examples/` directory

**Use Cases**:
- Analyzing code structure for JSDoc generation
- Reading existing documentation patterns
- Writing updated JSDoc comments
- Managing configuration files

### 2. Git Server (`git`)
**Purpose**: Version control operations essential for incremental processing and change tracking.

**Key Capabilities**:
- Check git status and detect changed files
- View commit history and diffs
- Support incremental JSDoc generation
- Manage branches for feature development

**Use Cases**:
- Implementing incremental documentation updates
- Understanding code evolution for better JSDoc generation
- Managing version control during development

### 3. GitHub Server (`github`)
**Purpose**: Repository operations, issue management, and CI/CD integration.

**Key Capabilities**:
- Access repository information and structure
- Create/manage issues and pull requests
- Search code across the repository
- Integrate with GitHub Actions workflows

**Use Cases**:
- Automating documentation updates via PR workflows
- Managing issues related to documentation gaps
- Integrating with CI/CD pipelines

### 4. Bash Server (`bash`)
**Purpose**: Command execution for build processes, testing, and development workflows.

**Key Capabilities**:
- Run npm scripts (build, test, lint, format)
- Execute TypeScript compilation
- Run Jest tests and ESLint checks
- Execute custom development commands

**Allowed Commands**:
- `npm`, `npx` - Package management and script execution
- `tsc` - TypeScript compilation
- `jest` - Test execution
- `eslint`, `prettier` - Code quality and formatting
- `node` - Node.js execution
- Standard Unix commands (`cat`, `ls`, `pwd`, `find`, `grep`, `wc`)

### 5. Web Server (`web`)
**Purpose**: Access external documentation and API references for AI providers.

**Key Capabilities**:
- Fetch documentation from official sources
- Access API references for supported LLM providers
- Scrape web content for context

**Allowed Domains**:
- GitHub documentation
- TypeScript documentation
- Jest, ESLint, Prettier documentation
- NPM registry
- AI provider documentation (OpenAI, Google, Anthropic, Ollama)

### 6. Memory Server (`memory`)
**Purpose**: Persistent storage for project context, patterns, and preferences.

**Key Capabilities**:
- Store coding patterns and preferences
- Remember project structure and conventions
- Cache frequently accessed information
- Maintain context across sessions

## Project Context

### Repository Structure
```
monodoc/
├── src/                    # Core TypeScript source code
│   ├── commands/          # CLI command implementations
│   ├── config/           # Configuration management
│   ├── plugins/          # Plugin system
│   ├── utils/            # Utility functions
│   └── types/            # TypeScript type definitions
├── examples/             # Configuration examples
├── docs/                # Generated documentation
├── config/              # Build and tool configurations
└── test/               # Test files
```

### Key Technologies
- **TypeScript 5+** - Primary language with complex type system
- **Vercel AI SDK** - Multi-LLM provider integration
- **Jest** - Testing framework
- **ESLint + Prettier** - Code quality and formatting
- **TypeDoc** - API documentation generation
- **Commander.js** - CLI framework

### AI Integration
The project supports multiple AI providers:
- **OpenAI** - GPT-4o, GPT-4o-mini, text-embedding-3-small
- **Google** - Gemini 1.5 Flash/Pro, embedding-001
- **Anthropic** - Claude 3 Haiku/Sonnet
- **Ollama** - Local models (nomic-embed-text)

## Development Guidelines

### Code Style
- **Indentation**: 2 spaces
- **Quotes**: Single quotes
- **Semicolons**: Required
- **Trailing Commas**: Always

### Naming Conventions
- **Files**: kebab-case (e.g., `generate-command.ts`)
- **Functions**: camelCase (e.g., `generateJSDoc`)
- **Classes**: PascalCase (e.g., `GenerateCommand`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `DEFAULT_CONFIG`)
- **Interfaces**: PascalCase (e.g., `GeneratorConfig`)

### Testing
- Test files: `*.test.ts`
- Mock files: `__mocks__/`
- Minimum coverage: 80%
- Run tests: `npm run test`

## Common Development Tasks

### Build and Development
```bash
npm run build          # Compile TypeScript
npm run build:watch    # Watch mode compilation
npm run dev           # Development mode
npm run typecheck     # Type checking only
```

### Testing and Quality
```bash
npm run test                # Run all tests
npm run test:watch          # Watch mode testing
npm run test:coverage       # Coverage report
npm run lint               # ESLint checking
npm run lint:fix           # Auto-fix lint issues
npm run format             # Format code with Prettier
```

### Documentation
```bash
npm run docs:generate      # Generate TypeDoc documentation
npm run example           # Run example configuration
npm run quality           # Quality analysis
npm run benchmark         # Performance benchmarking
```

## AI-Specific Considerations

### JSDoc Generation
The tool specializes in generating JSDoc comments for TypeScript code:
- Function and method documentation
- Parameter and return type descriptions
- Usage examples and best practices
- Complex type documentation

### Configuration Management
Complex configuration system supporting:
- Multiple AI providers
- Workspace directory patterns
- Quality thresholds
- Performance optimization
- Plugin system

### Embedding and Semantic Search
Advanced features for code understanding:
- Semantic similarity analysis
- Related symbol detection
- Intelligent context building
- Caching and optimization

## Usage Examples

### Basic JSDoc Generation
```bash
# Generate JSDoc for entire project
monodoc generate

# Generate for specific files
monodoc generate src/commands/GenerateCommand.ts

# Dry run (preview changes)
monodoc generate --dry-run
```

### Configuration Examples
```bash
# Interactive setup
monodoc setup

# Validate configuration
monodoc validate-config

# List available AI models
monodoc info --list-models
```

### Development Workflow
```bash
# Watch mode for continuous updates
monodoc watch

# Incremental processing (only changed files)
monodoc incremental

# Quality analysis
monodoc quality-check
```

## Environment Setup

### Required Environment Variables
```bash
# AI Provider API Keys
OPENAI_API_KEY=your_openai_key
GOOGLE_API_KEY=your_google_key
ANTHROPIC_API_KEY=your_anthropic_key
OLLAMA_HOST=http://localhost:11434

# GitHub Integration
GITHUB_TOKEN=your_github_token
```

### Development Environment
```bash
# Node.js version
node --version  # Should be >= 18.0.0

# Install dependencies
npm install

# Build project
npm run build

# Run tests
npm run test
```

## Troubleshooting

### Common Issues
1. **TypeScript compilation errors** - Run `npm run typecheck`
2. **Lint errors** - Run `npm run lint:fix`
3. **Test failures** - Run `npm run test` for details
4. **Build failures** - Try `npm run clean && npm run build`

### Performance Issues
- Enable caching in configuration
- Use incremental processing
- Optimize concurrent requests
- Monitor memory usage

### AI Provider Issues
- Verify API keys are set
- Check rate limits
- Validate model availability
- Review network connectivity

## Security Considerations

### API Key Management
- Store API keys in environment variables
- Never commit API keys to version control
- Use different keys for development/production
- Rotate keys regularly

### Command Execution
- Limited to allowed commands only
- Sandboxed execution environment
- No access to system-level operations
- Audit command execution logs

This MCP configuration provides comprehensive support for GitHub Copilot Coding Agent to effectively work with the monodoc repository, understanding its structure, development patterns, and specialized AI-powered documentation generation capabilities.