import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTRACT_VERSION } from "@/agent-ui/contract.generated";
import {
  isSameQuestion,
  loadTurns,
  saveTurns,
  readOrCreateThreadId,
  type Turn,
} from "@/agent-ui/transcript";
import {
  appendTurn,
  getServerSnapshot,
  getSnapshot,
  resetTranscript,
  settleOpenTurn,
  subscribe,
} from "@/agent-ui/transcriptStore";

const envelope = (name: string, props: Record<string, unknown> = {}) => ({
  version: CONTRACT_VERSION,
  name,
  props,
});

/** The store is module state; each test starts from a clean thread. */
beforeEach(() => {
  const unsubscribe = subscribe(() => {});
  resetTranscript();
  unsubscribe();
});

describe("isSameQuestion", () => {
  it("matches identical envelopes", () => {
    expect(isSameQuestion(envelope("crModeChoice", { a: 1 }), envelope("crModeChoice", { a: 1 }))).toBe(
      true,
    );
  });

  it("separates different components and different props", () => {
    expect(isSameQuestion(envelope("crModeChoice"), envelope("draftReview"))).toBe(false);
    expect(isSameQuestion(envelope("draftReview", { a: 1 }), envelope("draftReview", { a: 2 }))).toBe(
      false,
    );
  });

  it("treats a missing previous envelope as different", () => {
    expect(isSameQuestion(undefined, envelope("crModeChoice"))).toBe(false);
  });
});

describe("transcript store", () => {
  it("appends a turn per new question", () => {
    appendTurn(envelope("crModeChoice"));
    appendTurn(envelope("crIntakeForm"));
    expect(getSnapshot().turns.map((t) => t.envelope.name)).toEqual([
      "crModeChoice",
      "crIntakeForm",
    ]);
  });

  /**
   * The reconnect case. A pending interrupt is re-delivered every time the
   * client reconnects, and in a normal turn the same envelope also arrives twice
   * — once on the state channel, once as the interrupt. Without deduplication
   * the transcript grows a duplicate card each time.
   */
  it("ignores a repeat of the open question", () => {
    appendTurn(envelope("crModeChoice", { title: "Create Change Request" }));
    appendTurn(envelope("crModeChoice", { title: "Create Change Request" }));
    appendTurn(envelope("crModeChoice", { title: "Create Change Request" }));
    expect(getSnapshot().turns).toHaveLength(1);
  });

  /**
   * But an identical question asked again AFTER an answer is a new turn: the
   * graph is asking a second time, which is a real thing that happens when a
   * resume does not land.
   */
  it("appends a repeat that arrives after the turn was answered", () => {
    appendTurn(envelope("crModeChoice"));
    settleOpenTurn({ value: "single", label: "Single Change Request", at: 1 });
    appendTurn(envelope("crModeChoice"));
    expect(getSnapshot().turns).toHaveLength(2);
  });

  it("settles only the open turn, and only once", () => {
    appendTurn(envelope("crModeChoice"));
    settleOpenTurn({ value: "single", label: "Single Change Request", at: 1 });
    settleOpenTurn({ value: "bulk", label: "Bulk", at: 2 });

    const [turn] = getSnapshot().turns;
    expect(turn?.answer).toMatchObject({ value: "single", label: "Single Change Request" });
  });

  it("does nothing when there is no turn to settle", () => {
    settleOpenTurn({ value: "approve", label: "Approve", at: 1 });
    expect(getSnapshot().turns).toHaveLength(0);
  });

  it("keeps the snapshot referentially stable between reads", () => {
    // useSyncExternalStore compares by identity and loops forever otherwise.
    expect(getSnapshot()).toBe(getSnapshot());
    appendTurn(envelope("crModeChoice"));
    const after = getSnapshot();
    expect(after).toBe(getSnapshot());
  });

  it("renders nothing on the server", () => {
    expect(getServerSnapshot().turns).toHaveLength(0);
    expect(getServerSnapshot()).toBe(getServerSnapshot());
  });

  it("notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    appendTurn(envelope("crModeChoice"));
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("starts a new thread and empties the transcript on reset", () => {
    const unsubscribe = subscribe(() => {});
    appendTurn(envelope("crModeChoice"));
    const before = getSnapshot().threadId;

    resetTranscript();

    expect(getSnapshot().turns).toHaveLength(0);
    expect(getSnapshot().threadId).not.toBe(before);
    unsubscribe();
  });
});

describe("persistence", () => {
  it("round-trips turns through sessionStorage", () => {
    const turns: Turn[] = [{ id: "0", envelope: envelope("crModeChoice") }];
    saveTurns("t-1", turns);
    expect(loadTurns("t-1")).toEqual(turns);
  });

  it("reuses the thread id across reloads", () => {
    const first = readOrCreateThreadId();
    expect(readOrCreateThreadId()).toBe(first);
  });

  /**
   * Stored data is data, not trusted input: it was written by an older build of
   * this app into storage the user can edit. Anything that is not a turn is
   * dropped rather than handed to a card as props.
   */
  it("drops entries that are not turns", () => {
    window.sessionStorage.setItem(
      "crco:transcript:t-2",
      JSON.stringify([
        { id: "0", envelope: envelope("crModeChoice") },
        { id: "1" },
        { envelope: envelope("draftReview") },
        "not an object",
        null,
        { id: "2", envelope: { name: "crModeChoice" } },
      ]),
    );
    expect(loadTurns("t-2")).toHaveLength(1);
  });

  it("survives unparseable storage", () => {
    window.sessionStorage.setItem("crco:transcript:t-3", "{ not json");
    expect(loadTurns("t-3")).toEqual([]);
  });

  it("caps what it persists", () => {
    const many: Turn[] = Array.from({ length: 80 }, (_, i) => ({
      id: String(i),
      envelope: envelope("crModeChoice", { i }),
    }));
    saveTurns("t-4", many);
    expect(loadTurns("t-4")).toHaveLength(50);
    // The tail is kept — the most recent turns are the ones worth having.
    expect(loadTurns("t-4")[49]?.envelope.props).toEqual({ i: 79 });
  });

  /**
   * Storage throws rather than returning null in more real situations than
   * people expect: private browsing, embedded webviews, enterprise policies,
   * quota exhaustion. None of them should take the conversation down.
   */
  it("does not throw when storage is unavailable", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("QuotaExceededError");
      });
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("SecurityError");
    });

    expect(() => saveTurns("t-5", [])).not.toThrow();
    expect(loadTurns("t-5")).toEqual([]);

    setItem.mockRestore();
    getItem.mockRestore();
  });
});
