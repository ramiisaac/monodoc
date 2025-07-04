import { CommandRunner } from "../CommandRunner";
import { GeneratorConfig } from "../../types";

// Mock the command implementations
jest.mock("../../commands/GenerateCommand");
jest.mock("../../commands/SetupCommand");
jest.mock("../../commands/AnalyzeCommand");

describe("CommandRunner", () => {
  let commandRunner: CommandRunner;
  let mockConfig: GeneratorConfig;

  beforeEach(() => {
    mockConfig = {
      aiModels: [
        {
          model: "gpt-4",
          provider: "openai",
          apiKey: "test-key",
          temperature: 0.7,
          maxTokens: 1000,
        },
      ],
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts"],
      outputFormat: "inline",
    } as GeneratorConfig;

    commandRunner = new CommandRunner(mockConfig);
  });

  describe("runCommand", () => {
    it("should execute generate command", async () => {
      const options = { dryRun: true };

      // Mock console.log to capture output
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

      await commandRunner.runCommand("generate", options);

      // Verify that command was attempted
      expect(logSpy).toHaveBeenCalled();
      
      logSpy.mockRestore();
    });

    it("should execute setup command", async () => {
      const options = { force: true };

      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

      await commandRunner.runCommand("setup", options);

      expect(logSpy).toHaveBeenCalled();
      
      logSpy.mockRestore();
    });

    it("should execute analyze command", async () => {
      const options = { output: "analysis.json" };

      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

      await commandRunner.runCommand("analyze", options);

      expect(logSpy).toHaveBeenCalled();
      
      logSpy.mockRestore();
    });

    it("should handle unknown commands", async () => {
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      await commandRunner.runCommand("unknown-command" as any, {});

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unknown command")
      );
      
      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("should handle command execution errors", async () => {
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      // Mock a command that throws an error
      jest.doMock("../../commands/GenerateCommand", () => ({
        GenerateCommand: jest.fn().mockImplementation(() => ({
          execute: jest.fn().mockRejectedValue(new Error("Command failed")),
        })),
      }));

      await commandRunner.runCommand("generate", {});

      expect(errorSpy).toHaveBeenCalled();
      
      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe("getAvailableCommands", () => {
    it("should return list of available commands", () => {
      const commands = commandRunner.getAvailableCommands();

      expect(commands).toContain("generate");
      expect(commands).toContain("setup");
      expect(commands).toContain("analyze");
      expect(commands).toContain("watch");
      expect(commands).toContain("quality-check");
    });
  });

  describe("getCommandHelp", () => {
    it("should return help text for commands", () => {
      const help = commandRunner.getCommandHelp("generate");

      expect(help).toContain("generate");
      expect(typeof help).toBe("string");
    });

    it("should return general help for unknown commands", () => {
      const help = commandRunner.getCommandHelp("unknown-command");

      expect(typeof help).toBe("string");
      expect(help.length).toBeGreaterThan(0);
    });
  });
});