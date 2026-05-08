import { expect, test } from "@playwright/test";

import {
  PASSWORD_PATTERN_ATTRIBUTE,
  validatePasswordPolicy,
} from "../../src/lib/auth/password-policy";

test.describe("password policy", () => {
  test("accepts the minimum supported password shape", () => {
    expect(validatePasswordPolicy("boxops2026")).toEqual({ ok: true });
  });

  test("requires at least 8 characters", () => {
    expect(validatePasswordPolicy("box12").ok).toBe(false);
    expect(validatePasswordPolicy("box12")).toMatchObject({
      error: "password-too-short",
    });
  });

  test("requires at least one letter", () => {
    expect(validatePasswordPolicy("12345678")).toMatchObject({
      error: "password-missing-letter",
    });
  });

  test("requires at least one number", () => {
    expect(validatePasswordPolicy("boxopsabcd")).toMatchObject({
      error: "password-missing-number",
    });
  });

  test("exports an HTML pattern aligned with the same rule", () => {
    const htmlPattern = new RegExp(`^${PASSWORD_PATTERN_ATTRIBUTE}$`);

    expect(htmlPattern.test("boxops2026")).toBe(true);
    expect(htmlPattern.test("boxopsabc")).toBe(false);
    expect(htmlPattern.test("12345678")).toBe(false);
    expect(htmlPattern.test("b0x")).toBe(false);
  });
});
