// Re-exporting only what is publicly exposed from the CLI module.
// This index.ts primarily exists to define the module's public API.

// We typically do NOT re-export the main CLI entry point (`src/cli.ts`) itself from here,
// as it's meant to be executed directly as a binary.

// The CommandRunner is an internal component, not meant for public API access from here.

// HelpSystem can be considered public API if other modules need to programmatically display help.
export { HelpSystem } from './HelpSystem';
export { InteractiveCLI } from './InteractiveCLI';

// All specific commands are re-exported via src/commands/index.ts.
// This index file would typically only re-export things from its own directory (`src/cli/`)
// that are intended for broader programmatic use, not just CLI execution.
