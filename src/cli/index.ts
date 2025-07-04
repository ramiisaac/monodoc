// Re-exporting only what is publicly exposed from the CLI module.
// Note: InteractiveCLI, HelpSystem, and CommandRunner are now primarily internal
// to the CLI implementation in `src/cli.ts` or specific commands.
// This index.ts primarily exists to define the module's public API.

// No direct exports needed here as `src/cli.ts` handles all CLI logic directly.
// The previous `HelpSystem` export could remain if it's considered a public API,
// but for a clean CLI, the main `cli.ts` manages help output.
// The goal is to minimize direct public exports from this folder, as the CLI is the interface.

// If you want to expose HelpSystem for programmatic use outside of the main CLI, re-add:
// export { HelpSystem } from './HelpSystem';
