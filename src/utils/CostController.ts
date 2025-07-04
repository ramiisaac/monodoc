import { logger } from "./logger";
import { GeneratorConfig, AIModelConfig } from "../types";

export interface CostLimits {
  maxDailySpend: number; // USD
  maxMonthlySpend: number; // USD
  maxTokensPerRequest: number;
  maxRequestsPerHour: number;
  maxRequestsPerDay: number;
  warningThresholds: {
    daily: number; // percentage (e.g., 80 for 80%)
    monthly: number; // percentage
  };
}

export interface CostTracker {
  date: string; // YYYY-MM-DD
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  requestsByHour: Record<string, number>; // hour -> count
  costByModel: Record<string, number>; // model -> cost
}

export interface SpendingAlert {
  type: "warning" | "limit_reached" | "error";
  message: string;
  currentSpend: number;
  limit: number;
  percentage: number;
}

/**
 * Manages cost control and tracking for AI API usage.
 * Prevents accidental overspending on AI services.
 */
export class CostController {
  private config: GeneratorConfig;
  private limits: CostLimits;
  private tracker: CostTracker;
  private readonly COST_DATA_FILE = ".monodoc-cost-tracker.json";

  constructor(config: GeneratorConfig, limits?: Partial<CostLimits>) {
    this.config = config;
    this.limits = this.mergeWithDefaults(limits);
    this.tracker = this.loadOrCreateTracker();
  }

  /**
   * Merges user-provided limits with sensible defaults.
   */
  private mergeWithDefaults(userLimits?: Partial<CostLimits>): CostLimits {
    const defaults: CostLimits = {
      maxDailySpend: 10.0, // $10 per day
      maxMonthlySpend: 100.0, // $100 per month
      maxTokensPerRequest: 4000, // Reasonable size per request
      maxRequestsPerHour: 100, // Rate limiting
      maxRequestsPerDay: 1000, // Daily request limit
      warningThresholds: {
        daily: 80, // Warn at 80% of daily limit
        monthly: 75, // Warn at 75% of monthly limit
      },
    };

    return {
      ...defaults,
      ...userLimits,
      warningThresholds: {
        ...defaults.warningThresholds,
        ...userLimits?.warningThresholds,
      },
    };
  }

  /**
   * Loads existing cost tracker or creates a new one.
   */
  private loadOrCreateTracker(): CostTracker {
    try {
      const fs = require("fs");
      const path = require("path");
      
      const trackerPath = path.join(process.cwd(), this.COST_DATA_FILE);
      if (fs.existsSync(trackerPath)) {
        const data = JSON.parse(fs.readFileSync(trackerPath, "utf8"));
        const today = new Date().toISOString().split("T")[0];
        
        // Reset daily tracker if it's a new day
        if (data.date !== today) {
          return this.createNewDayTracker(today);
        }
        
        return data;
      }
    } catch (error) {
      logger.warn(`Failed to load cost tracker: ${error}`);
    }

    return this.createNewDayTracker(new Date().toISOString().split("T")[0]);
  }

  /**
   * Creates a fresh tracker for a new day.
   */
  private createNewDayTracker(date: string): CostTracker {
    return {
      date,
      totalCost: 0,
      totalTokens: 0,
      totalRequests: 0,
      requestsByHour: {},
      costByModel: {},
    };
  }

  /**
   * Saves the current tracker state to file.
   */
  private saveTracker(): void {
    try {
      const fs = require("fs");
      const path = require("path");
      
      const trackerPath = path.join(process.cwd(), this.COST_DATA_FILE);
      fs.writeFileSync(trackerPath, JSON.stringify(this.tracker, null, 2));
    } catch (error) {
      logger.warn(`Failed to save cost tracker: ${error}`);
    }
  }

  /**
   * Checks if a request is allowed based on current limits.
   * @param estimatedTokens Estimated tokens for the request
   * @param modelId Model ID being used
   * @returns True if allowed, false if blocked
   */
  async canMakeRequest(estimatedTokens: number, modelId: string): Promise<{ allowed: boolean; reason?: string; alerts?: SpendingAlert[] }> {
    const now = new Date();
    const currentHour = now.getHours().toString().padStart(2, "0");
    const today = now.toISOString().split("T")[0];

    // Reset tracker if new day
    if (this.tracker.date !== today) {
      this.tracker = this.createNewDayTracker(today);
    }

    const alerts: SpendingAlert[] = [];

    // Check token limit per request
    if (estimatedTokens > this.limits.maxTokensPerRequest) {
      return {
        allowed: false,
        reason: `Request exceeds token limit: ${estimatedTokens} > ${this.limits.maxTokensPerRequest}`,
      };
    }

    // Check hourly request limit
    const hourlyRequests = this.tracker.requestsByHour[currentHour] || 0;
    if (hourlyRequests >= this.limits.maxRequestsPerHour) {
      return {
        allowed: false,
        reason: `Hourly request limit reached: ${hourlyRequests}/${this.limits.maxRequestsPerHour}`,
      };
    }

    // Check daily request limit
    if (this.tracker.totalRequests >= this.limits.maxRequestsPerDay) {
      return {
        allowed: false,
        reason: `Daily request limit reached: ${this.tracker.totalRequests}/${this.limits.maxRequestsPerDay}`,
      };
    }

    // Estimate cost for this request
    const estimatedCost = this.estimateRequestCost(estimatedTokens, modelId);

    // Check daily spend limit
    const potentialDailyCost = this.tracker.totalCost + estimatedCost;
    if (potentialDailyCost > this.limits.maxDailySpend) {
      return {
        allowed: false,
        reason: `Daily spend limit would be exceeded: $${potentialDailyCost.toFixed(4)} > $${this.limits.maxDailySpend}`,
      };
    }

    // Check for warnings
    const dailyPercentage = (potentialDailyCost / this.limits.maxDailySpend) * 100;
    if (dailyPercentage >= this.limits.warningThresholds.daily) {
      alerts.push({
        type: "warning",
        message: `Approaching daily spend limit`,
        currentSpend: potentialDailyCost,
        limit: this.limits.maxDailySpend,
        percentage: dailyPercentage,
      });
    }

    // Check monthly limit (simplified - using 30x daily)
    const monthlyEstimate = potentialDailyCost * 30;
    if (monthlyEstimate > this.limits.maxMonthlySpend) {
      const monthlyPercentage = (monthlyEstimate / this.limits.maxMonthlySpend) * 100;
      if (monthlyPercentage >= this.limits.warningThresholds.monthly) {
        alerts.push({
          type: "warning",
          message: `Current usage rate would exceed monthly limit`,
          currentSpend: monthlyEstimate,
          limit: this.limits.maxMonthlySpend,
          percentage: monthlyPercentage,
        });
      }
    }

    return { allowed: true, alerts };
  }

  /**
   * Records a completed request and its actual cost.
   * @param actualTokens Actual tokens used
   * @param actualCost Actual cost incurred
   * @param modelId Model used
   */
  async recordRequest(actualTokens: number, actualCost: number, modelId: string): Promise<void> {
    const now = new Date();
    const currentHour = now.getHours().toString().padStart(2, "0");

    this.tracker.totalCost += actualCost;
    this.tracker.totalTokens += actualTokens;
    this.tracker.totalRequests += 1;
    this.tracker.requestsByHour[currentHour] = (this.tracker.requestsByHour[currentHour] || 0) + 1;
    this.tracker.costByModel[modelId] = (this.tracker.costByModel[modelId] || 0) + actualCost;

    this.saveTracker();

    logger.debug(`Recorded request: ${actualTokens} tokens, $${actualCost.toFixed(4)}, model: ${modelId}`);
  }

  /**
   * Estimates the cost of a request based on tokens and model.
   * @param tokens Number of tokens
   * @param modelId Model identifier
   * @returns Estimated cost in USD
   */
  private estimateRequestCost(tokens: number, modelId: string): number {
    const model = this.config.aiModels.find(m => m.id === modelId);
    if (!model) {
      logger.warn(`Unknown model for cost estimation: ${modelId}`);
      return 0.00003 * tokens; // Default to GPT-4 pricing
    }

    // Cost per 1K tokens (as of 2024)
    let costPer1KTokens = 0.03; // Default GPT-4 pricing

    switch (model.provider) {
      case "openai":
        if (model.model.includes("gpt-4")) {
          costPer1KTokens = 0.03; // $0.03 per 1K tokens
        } else if (model.model.includes("gpt-3.5")) {
          costPer1KTokens = 0.002; // $0.002 per 1K tokens
        }
        break;
      case "anthropic":
        costPer1KTokens = 0.015; // Claude pricing
        break;
      case "google":
        costPer1KTokens = 0.0025; // Gemini pricing
        break;
      case "ollama":
        costPer1KTokens = 0; // Local model, no cost
        break;
    }

    return (tokens / 1000) * costPer1KTokens;
  }

  /**
   * Gets current spending statistics.
   */
  getSpendingStats(): {
    daily: { cost: number; tokens: number; requests: number };
    limits: CostLimits;
    alerts: SpendingAlert[];
  } {
    const alerts: SpendingAlert[] = [];

    // Check current spending against limits
    const dailyPercentage = (this.tracker.totalCost / this.limits.maxDailySpend) * 100;
    if (dailyPercentage >= this.limits.warningThresholds.daily) {
      alerts.push({
        type: dailyPercentage >= 100 ? "limit_reached" : "warning",
        message: `Daily spending ${dailyPercentage >= 100 ? "limit reached" : "warning"}`,
        currentSpend: this.tracker.totalCost,
        limit: this.limits.maxDailySpend,
        percentage: dailyPercentage,
      });
    }

    return {
      daily: {
        cost: this.tracker.totalCost,
        tokens: this.tracker.totalTokens,
        requests: this.tracker.totalRequests,
      },
      limits: this.limits,
      alerts,
    };
  }

  /**
   * Resets daily tracking (useful for testing or manual reset).
   */
  resetDailyTracking(): void {
    this.tracker = this.createNewDayTracker(new Date().toISOString().split("T")[0]);
    this.saveTracker();
    logger.info("Daily cost tracking reset");
  }

  /**
   * Updates cost limits.
   */
  updateLimits(newLimits: Partial<CostLimits>): void {
    this.limits = { ...this.limits, ...newLimits };
    logger.info("Cost limits updated");
  }
}