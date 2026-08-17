import { describe, expect, it } from "vitest";
import {
  MAX_BREAK_SECONDS,
  MAX_STUDY_SECONDS,
  normalizeDuration,
  parseDurationText,
  sanitizeDigits,
  toDurationText,
} from "./durationInput";

describe("durationInput", () => {
  it("formats seconds as MM / SS with a padded seconds half", () => {
    expect(toDurationText(25 * 60)).toEqual({ minutes: "25", seconds: "00" });
    expect(toDurationText(30)).toEqual({ minutes: "0", seconds: "30" });
    expect(toDurationText(25 * 60 + 30)).toEqual({ minutes: "25", seconds: "30" });
  });

  it("treats empty and half-typed fields as not-yet-valid instead of NaN", () => {
    expect(parseDurationText({ minutes: "", seconds: "" })).toBeNull();
    expect(parseDurationText({ minutes: "0", seconds: "" })).toBeNull();
    expect(parseDurationText({ minutes: "0", seconds: "00" })).toBeNull();
    expect(parseDurationText({ minutes: "", seconds: "30" })).toBe(30);
    expect(parseDurationText({ minutes: "1", seconds: "" })).toBe(60);
    expect(parseDurationText({ minutes: "0", seconds: "30" })).toBe(30);
  });

  it("falls back to the last valid value when a field is left empty", () => {
    expect(normalizeDuration({ minutes: "", seconds: "" }, MAX_STUDY_SECONDS, 1_500)).toBe(1_500);
    expect(normalizeDuration({ minutes: "0", seconds: "00" }, MAX_BREAK_SECONDS, 300)).toBe(300);
  });

  it("never yields NaN or zero when the fallback is unusable", () => {
    expect(normalizeDuration({ minutes: "", seconds: "" }, MAX_STUDY_SECONDS, Number.NaN)).toBe(1);
    expect(normalizeDuration({ minutes: "", seconds: "" }, MAX_STUDY_SECONDS, 0)).toBe(1);
  });

  it("clamps to the maximum and carries overflowing seconds into minutes", () => {
    expect(normalizeDuration({ minutes: "999", seconds: "00" }, MAX_STUDY_SECONDS, 1_500)).toBe(
      MAX_STUDY_SECONDS,
    );
    expect(normalizeDuration({ minutes: "0", seconds: "90" }, MAX_BREAK_SECONDS, 300)).toBe(90);
    expect(toDurationText(90)).toEqual({ minutes: "1", seconds: "30" });
  });

  it("keeps only digits so state stays parseable", () => {
    expect(sanitizeDigits("1e-2")).toBe("12");
    expect(sanitizeDigits("")).toBe("");
    expect(sanitizeDigits("1234")).toBe("123");
    expect(sanitizeDigits("456", 2)).toBe("45");
  });
});
