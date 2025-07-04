import { ICommand, CommandContext } from "../types";
import { InteractiveCLI } from "../cli/InteractiveCLI";
import { logger } from "../utils/logger";

/**
 * Implements the 'setup' command logic.
 * This command runs an interactive wizard to configure the `jsdoc-config.yaml` file.
 */
export class SetupCommand implements ICommand {
  async execute(context: CommandContext): Promise<void> {
    logger.info("Running interactive setup wizard...");
    try {
      await InteractiveCLI.runSetup(context.baseDir);
      logger.success("Configuration setup completed successfully.");
    } catch (error) {
      logger.error(
        `Interactive setup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error; // Re-throw to be caught by CommandRunner's error handling
    }
  }
}
