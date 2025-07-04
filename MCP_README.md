# MCP Configuration for GitHub Copilot Coding Agent

This directory contains MCP (Model Context Protocol) configuration files that enable GitHub Copilot Coding Agent to effectively work with the monodoc repository.

## Files Overview

### Configuration Files

- **`mcp-servers.json`** - Standard MCP server configuration for client integration
- **`mcp-config.json`** - Comprehensive configuration with project context and guidelines
- **`MCP_CONFIGURATION.md`** - Detailed documentation of the MCP setup
- **`MCP_SERVERS_LIST.md`** - Complete list of MCP servers with explanations

### Research Files

- **`mcp-servers-research.md`** - Research notes on MCP servers relevant to this project

## Quick Start

### 1. Install MCP Servers

```bash
# Install essential MCP servers globally
npm install -g @modelcontextprotocol/server-filesystem
npm install -g @modelcontextprotocol/server-git
npm install -g @modelcontextprotocol/server-github
npm install -g @modelcontextprotocol/server-bash
npm install -g @modelcontextprotocol/server-web
npm install -g @modelcontextprotocol/server-memory
```

### 2. Set Environment Variables

```bash
# GitHub integration
export GITHUB_TOKEN=your_github_token

# AI provider keys (for project context)
export OPENAI_API_KEY=your_openai_key
export GOOGLE_API_KEY=your_google_key
export ANTHROPIC_API_KEY=your_anthropic_key
export OLLAMA_HOST=http://localhost:11434
```

### 3. Use Configuration

Point your MCP client to the appropriate configuration file:

- For standard integration: `mcp-servers.json`
- For comprehensive context: `mcp-config.json`

## MCP Servers Included

### Essential Servers

1. **File System** - Read/write TypeScript source files and configurations
2. **Git** - Version control operations for incremental processing
3. **GitHub** - Repository operations and CI/CD integration
4. **Bash** - Command execution for build, test, and development workflows
5. **Web** - Access external documentation and API references
6. **Memory** - Persistent storage for project context and patterns

### Why These Servers?

- **TypeScript Focus**: Essential for working with complex TypeScript codebase
- **AI Integration**: Supports multiple LLM providers (OpenAI, Google, Anthropic, Ollama)
- **Documentation**: Specialized for JSDoc generation and quality analysis
- **Development Workflow**: Covers build, test, lint, and formatting operations

## Project Context

### Repository Structure

```
monodoc/
├── src/                    # TypeScript source code
│   ├── commands/          # CLI command implementations
│   ├── config/           # Configuration management
│   ├── plugins/          # Plugin system
│   ├── utils/            # Utility functions
│   └── types/            # Type definitions
├── examples/             # Configuration examples
├── docs/                # Generated documentation
└── config/              # Build configurations
```

### Key Technologies

- **TypeScript 5+** with complex type system
- **Vercel AI SDK** for multi-LLM integration
- **Jest** for testing
- **ESLint + Prettier** for code quality
- **TypeDoc** for API documentation

### AI Providers Supported

- OpenAI (GPT-4o, embeddings)
- Google (Gemini 1.5, embeddings)
- Anthropic (Claude 3)
- Ollama (local models)

## Common Development Tasks

### Build and Test

```bash
npm run build          # Compile TypeScript
npm run test          # Run Jest tests
npm run lint          # ESLint checking
npm run format        # Prettier formatting
npm run typecheck     # Type checking
```

### Documentation Generation

```bash
npm run docs:generate  # Generate TypeDoc documentation
npm run example       # Run example configuration
npm run quality       # Quality analysis
npm run benchmark     # Performance benchmarking
```

### Monodoc-Specific Commands

```bash
monodoc generate      # Generate JSDoc comments
monodoc setup        # Interactive configuration
monodoc watch        # Watch mode for continuous updates
monodoc incremental  # Process only changed files
monodoc quality-check # Analyze documentation quality
```

## Security Notes

### Command Restrictions

- Bash server limited to approved commands only
- File system access restricted to project directory
- Network access limited to trusted domains

### API Key Management

- Store keys as environment variables
- Never commit keys to version control
- Use different keys for development/production

## Troubleshooting

### Installation Issues

- Ensure Node.js >= 18.0.0
- Install MCP servers globally with npm
- Check network connectivity for package installation

### Configuration Issues

- Verify file paths are correct
- Check environment variables are set
- Validate JSON syntax in configuration files

### Runtime Issues

- Monitor MCP server logs
- Check API rate limits
- Verify file system permissions

## Contributing

When updating MCP configurations:

1. Test changes with actual MCP client
2. Update documentation to reflect changes
3. Verify security implications
4. Test with different operating systems

## Additional Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification)
- [MCP Server Implementations](https://github.com/modelcontextprotocol/servers)
- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
- [monodoc Project Documentation](README.MD)

This MCP configuration enables GitHub Copilot Coding Agent to understand and effectively work with the monodoc repository's TypeScript codebase, AI integrations, and documentation generation capabilities.
