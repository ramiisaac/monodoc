import { CostController, CostLimits } from "../CostController";
import { GeneratorConfig } from "../../types";

// Mock fs module
jest.mock("fs", () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

describe("CostController", () => {
  let costController: CostController;
  let mockConfig: GeneratorConfig;
  let mockLimits: Partial<CostLimits>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfig = {
      aiModels: [
        {
          id: "test-openai",
          provider: "openai",
          model: "gpt-4",
          type: "generation",
          apiKeyEnvVar: "OPENAI_API_KEY",
        },
        {
          id: "test-anthropic",
          provider: "anthropic",
          model: "claude-3-5-sonnet",
          type: "generation",
          apiKeyEnvVar: "ANTHROPIC_API_KEY",
        },
      ],
    } as GeneratorConfig;

    mockLimits = {
      maxDailySpend: 5.0,
      maxMonthlySpend: 50.0,
      maxTokensPerRequest: 2000,
      maxRequestsPerHour: 10,
      maxRequestsPerDay: 100,
    };

    costController = new CostController(mockConfig, mockLimits);
  });

  describe("canMakeRequest", () => {
    it("should allow requests within limits", async () => {
      const result = await costController.canMakeRequest(1000, "test-openai");
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should block requests exceeding token limit", async () => {
      const result = await costController.canMakeRequest(3000, "test-openai");
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("token limit");
    });

    it("should generate warnings when approaching limits", async () => {
      // Make several requests to approach the daily limit (80% of $5 = $4)
      await costController.recordRequest(4000, 4.2, "test-openai"); // Over 80% of limit

      const result = await costController.canMakeRequest(100, "test-openai");
      
      expect(result.allowed).toBe(true);
      expect(result.alerts).toBeDefined();
      expect(result.alerts!.length).toBeGreaterThan(0);
      expect(result.alerts![0].type).toBe("warning");
    });
  });

  describe("recordRequest", () => {
    it("should record request data correctly", async () => {
      await costController.recordRequest(1000, 0.03, "test-openai");
      
      const stats = costController.getSpendingStats();
      expect(stats.daily.cost).toBe(0.03);
      expect(stats.daily.tokens).toBe(1000);
      expect(stats.daily.requests).toBe(1);
    });

    it("should track costs by model", async () => {
      await costController.recordRequest(500, 0.015, "test-openai");
      await costController.recordRequest(500, 0.01, "test-anthropic");
      
      const stats = costController.getSpendingStats();
      expect(stats.daily.cost).toBe(0.025);
      expect(stats.daily.tokens).toBe(1000);
      expect(stats.daily.requests).toBe(2);
    });
  });

  describe("getSpendingStats", () => {
    it("should return current spending statistics", () => {
      const stats = costController.getSpendingStats();
      
      expect(stats.daily).toBeDefined();
      expect(stats.limits).toBeDefined();
      expect(stats.alerts).toBeDefined();
      expect(typeof stats.daily.cost).toBe("number");
      expect(typeof stats.daily.tokens).toBe("number");
      expect(typeof stats.daily.requests).toBe("number");
    });

    it("should include alerts when approaching limits", async () => {
      // Record spending close to the limit
      await costController.recordRequest(2000, 4.5, "test-openai"); // 90% of $5 limit
      
      const stats = costController.getSpendingStats();
      expect(stats.alerts.length).toBeGreaterThan(0);
      expect(stats.alerts[0].type).toBe("warning");
    });
  });

  describe("resetDailyTracking", () => {
    it("should reset daily tracking data", async () => {
      await costController.recordRequest(1000, 1.0, "test-openai");
      
      let stats = costController.getSpendingStats();
      expect(stats.daily.cost).toBe(1.0);
      
      costController.resetDailyTracking();
      
      stats = costController.getSpendingStats();
      expect(stats.daily.cost).toBe(0);
      expect(stats.daily.tokens).toBe(0);
      expect(stats.daily.requests).toBe(0);
    });
  });

  describe("updateLimits", () => {
    it("should update cost limits", () => {
      const newLimits = { maxDailySpend: 20.0 };
      costController.updateLimits(newLimits);
      
      const stats = costController.getSpendingStats();
      expect(stats.limits.maxDailySpend).toBe(20.0);
    });
  });
});