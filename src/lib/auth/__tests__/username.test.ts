import { describe, expect, it } from "vitest";
import { nameProblem, usernameEmail, usernameKey } from "../username";

describe("name → account", () => {
  it("small spelling differences sign in to the same account", async () => {
    expect(usernameKey("  أحمد   علي ")).toBe(usernameKey("احمد علي"));
    expect(await usernameEmail("Sara")).toBe(await usernameEmail(" sara "));
    expect(await usernameEmail("فاطمة")).toBe(await usernameEmail("فاطمه"));
  });
  it("different names are different accounts", async () => {
    expect(await usernameEmail("Ahmed")).not.toBe(await usernameEmail("Ahmad"));
  });
  it("gives a valid, short address", async () => {
    const e = await usernameEmail("محمود هشام عبد الرحمن");
    expect(e).toMatch(/^u[0-9a-f]{40}@users\.srm-voice-log\.app$/);
  });
  it("name length", () => {
    expect(nameProblem(" a ")).toBe("short");
    expect(nameProblem("x".repeat(41))).toBe("long");
    expect(nameProblem("Mo")).toBeNull();
  });
});
