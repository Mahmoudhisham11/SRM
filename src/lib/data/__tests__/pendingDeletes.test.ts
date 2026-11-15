import { describe, expect, it, vi } from "vitest";

// Minimal browser globals for the page-hide listeners (tests run in Node).
const target = new EventTarget();
vi.stubGlobal("window", target);
vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));

const { flushPendingDeletes, scheduleDelete, undoDelete } = await import("../pendingDeletes");

describe("pending deletes", () => {
  it("commits immediately when the page is closed", () => {
    const commit = vi.fn();
    scheduleDelete("a", commit);
    expect(commit).not.toHaveBeenCalled();
    target.dispatchEvent(new Event("pagehide"));
    expect(commit).toHaveBeenCalledTimes(1);
    flushPendingDeletes();
    expect(commit).toHaveBeenCalledTimes(1); // not twice
  });
  it("undo cancels; a later flush doesn't delete it", () => {
    const commit = vi.fn();
    scheduleDelete("b", commit);
    undoDelete("b");
    flushPendingDeletes();
    expect(commit).not.toHaveBeenCalled();
  });
  it("still commits after the undo window", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    scheduleDelete("c", commit);
    vi.advanceTimersByTime(6000);
    expect(commit).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
