import { logger, setLogLevel } from "../logger";

describe("logger", () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    // Set log level to debug to ensure all log messages are shown
    setLogLevel("debug");
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    // Reset log level to default
    setLogLevel("info");
  });

  it("should log info messages", () => {
    logger.info("Test info message");
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("should log error messages", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    logger.error("Test error message");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("should log debug messages", () => {
    logger.debug("Test debug message");
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("should log warn messages", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("Test warn message");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("should log success messages", () => {
    logger.success("Test success message");
    expect(consoleSpy).toHaveBeenCalled();
  });
});