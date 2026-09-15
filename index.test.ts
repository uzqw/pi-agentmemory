import { describe, expect, it } from "vitest";
import { getLastTextByRole, getText } from "./index.js";

const assistant = (text: string) => ({ role: "assistant", content: [{ type: "text", text }] });
const user = (text: string) => ({ role: "user", content: [{ type: "text", text }] });

describe("getLastTextByRole", () => {
  it("pairs a follow-up run's answer with the follow-up, not the stale prompt", () => {
    // pi includes steering/follow-up user messages in a run's messages, but
    // not the initiating prompt — this is the agent_end pairing core.
    const runMessages = [assistant("checking"), user("follow-up B"), assistant("answer B")];
    expect(getLastTextByRole(runMessages, "user")).toBe("follow-up B");
    expect(getLastTextByRole(runMessages, "assistant")).toBe("answer B");
  });

  it("returns empty when the role never appears (normal first run has no user message)", () => {
    expect(getLastTextByRole([assistant("answer A")], "user")).toBe("");
  });

  it("skips non-text blocks and empty text", () => {
    const messages = [
      { role: "assistant", content: [{ type: "thinking", thinking: "hmm" }] },
      { role: "assistant", content: [{ type: "text", text: "" }] },
      { role: "tool", content: [{ type: "text", text: "tool output" }] },
      assistant("final"),
    ];
    expect(getLastTextByRole(messages, "assistant")).toBe("final");
  });

  it("tolerates malformed entries", () => {
    expect(getLastTextByRole([null, 42, "str", user("ok")], "user")).toBe("ok");
  });
});

describe("getText", () => {
  it("handles plain string content", () => {
    expect(getText("plain")).toBe("plain");
  });

  it("joins multiple text blocks and trims", () => {
    expect(
      getText([{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }]),
    ).toBe("a\nb");
  });
});
