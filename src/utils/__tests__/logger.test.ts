import logger from "@/utils/logger";
import { config } from "@/utils/config";

describe("logger", () => {
  let origDebug: boolean;

  beforeAll(() => {
    origDebug = config.scraper.debug;
  });

  afterAll(() => {
    config.scraper.debug = origDebug;
  });

  test("debug is no-op when disabled", () => {
    config.scraper.debug = false;
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    logger.debug("should not log");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("debug calls console.debug when enabled", () => {
    config.scraper.debug = true;
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    logger.debug("should log");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
