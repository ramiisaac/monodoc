import { ConfigValidator } from "../ConfigValidator";
import { GeneratorConfig } from "../../types";

describe("ConfigValidator", () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    validator = new ConfigValidator();
  });

  describe("validateConfig", () => {
    it("should validate a valid configuration", () => {
      const validConfig: Partial<GeneratorConfig> = {
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
      };

      const result = validator.validateConfig(validConfig);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should return errors for invalid configuration", () => {
      const invalidConfig = {
        aiModels: [], // Empty array should be invalid
        include: [], // Empty include should be invalid
      };

      const result = validator.validateConfig(invalidConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should validate AI model configuration", () => {
      const configWithInvalidModel = {
        aiModels: [
          {
            // Missing required fields
            model: "",
            provider: "invalid-provider",
          },
        ],
        include: ["src/**/*.ts"],
      };

      const result = validator.validateConfig(configWithInvalidModel);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes("model"))).toBe(true);
    });

    it("should validate include patterns", () => {
      const configWithNoIncludes = {
        aiModels: [
          {
            model: "gpt-4",
            provider: "openai",
            apiKey: "test-key",
          },
        ],
        include: [],
      };

      const result = validator.validateConfig(configWithNoIncludes);
      expect(result.isValid).toBe(false);
    });
  });

  describe("validateAIModel", () => {
    it("should validate OpenAI model configuration", () => {
      const openaiModel = {
        model: "gpt-4",
        provider: "openai",
        apiKey: "sk-test-key",
        temperature: 0.7,
        maxTokens: 1000,
      };

      const result = validator.validateAIModel(openaiModel);
      expect(result.isValid).toBe(true);
    });

    it("should validate Google model configuration", () => {
      const googleModel = {
        model: "gemini-pro",
        provider: "google",
        apiKey: "test-google-key",
      };

      const result = validator.validateAIModel(googleModel);
      expect(result.isValid).toBe(true);
    });

    it("should reject invalid provider", () => {
      const invalidModel = {
        model: "test-model",
        provider: "invalid-provider",
        apiKey: "test-key",
      };

      const result = validator.validateAIModel(invalidModel);
      expect(result.isValid).toBe(false);
    });

    it("should require API key for cloud providers", () => {
      const modelWithoutKey = {
        model: "gpt-4",
        provider: "openai",
        // Missing apiKey
      };

      const result = validator.validateAIModel(modelWithoutKey);
      expect(result.isValid).toBe(false);
    });
  });
});