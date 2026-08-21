import { relativeTime } from "../relativeTime";

describe("relativeTime", () => {
  const NOW = new Date("2026-08-21T12:00:00.000Z").getTime();

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function ago(ms: number): string {
    return new Date(NOW - ms).toISOString();
  }

  it("labels anything under a minute as 'now'", () => {
    expect(relativeTime(ago(0))).toBe("now");
    expect(relativeTime(ago(59_000))).toBe("now");
  });

  it("labels minutes", () => {
    expect(relativeTime(ago(60_000))).toBe("1m");
    expect(relativeTime(ago(59 * 60_000))).toBe("59m");
  });

  it("labels hours", () => {
    expect(relativeTime(ago(60 * 60_000))).toBe("1h");
    expect(relativeTime(ago(23 * 60 * 60_000))).toBe("23h");
  });

  it("labels days", () => {
    expect(relativeTime(ago(24 * 60 * 60_000))).toBe("1d");
    expect(relativeTime(ago(6 * 24 * 60 * 60_000))).toBe("6d");
  });

  it("labels weeks, capping at 4", () => {
    expect(relativeTime(ago(7 * 24 * 60 * 60_000))).toBe("1w");
    expect(relativeTime(ago(4 * 7 * 24 * 60 * 60_000))).toBe("4w");
  });

  it("falls back to a calendar date past ~5 weeks", () => {
    const iso = ago(6 * 7 * 24 * 60 * 60_000);
    expect(relativeTime(iso)).toBe(new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  });

  it("never goes negative for a clock-skewed future timestamp", () => {
    expect(relativeTime(new Date(NOW + 60_000).toISOString())).toBe("now");
  });
});
