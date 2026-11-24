import { describe, expect, it } from "vitest";
import { buildTurnInput, INSTRUCTIONS, portDate } from "../../src/lib/agent/prompt";
import { ConversationWorkspace } from "../../src/lib/agent/workspace";
import { calculateTariffExpression } from "../../src/lib/maritime/calculator";
import { FakeStore } from "./fake-store";

async function workspace(store = new FakeStore()) {
  return { store, shell: await ConversationWorkspace.create({ store, conversationId: "c1", ownerId: "owner-1" }) };
}

describe("workspace shell", () => {
  it("treats /dev/null as a discard target", async () => {
    const { shell } = await workspace();
    expect(await shell.bash("cat /missing 2>/dev/null; echo done")).toEqual({ stdout: "done\n", stderr: "", exitCode: 0 });
    expect((await shell.bash("grep -c PORT /ports/mumbai/tariffs.md >/dev/null && echo quiet")).stdout).toBe("quiet\n");
    expect((await shell.bash("cat /dev/null | wc -c")).stdout.trim()).toBe("0");
  });

  it("keeps the output of a command whose write was refused", async () => {
    const { shell } = await workspace();
    const result = await shell.bash("ls /ports | head -1; echo x > /ports/new.md; echo after");
    expect(result.stdout).toBe("bpcl-cargo-jetty\nafter\n");
    expect(result.stderr).toMatch(/Write refused: EROFS: read-only path '\/ports\/new.md'/);
    expect(result.exitCode).toBe(1);
    expect((await shell.bash("ls /ports/new.md")).exitCode).not.toBe(0);
  });

  it("saves nothing from a command that also attempted a refused write", async () => {
    const { store, shell } = await workspace();
    const result = await shell.bash("echo '- fact' > /memories/profile.md; echo x > /ports/y.md");
    expect(result.exitCode).toBe(1);
    expect(store.memory.size).toBe(0);
    expect(store.commits).toHaveLength(0);
    expect((await shell.bash("cat /memories/profile.md")).exitCode).not.toBe(0);
  });
});

describe("prompt", () => {
  it("asks for vessel gross tonnage among the estimate particulars", () => {
    expect(INSTRUCTIONS).toMatch(/vessel name and gross tonnage \(GRT\)/);
  });

  it("dates turns in India time", () => {
    expect(portDate(new Date("2026-11-23T19:00:00Z"))).toBe("2026-11-24");
    expect(portDate(new Date("2026-11-23T18:00:00Z"))).toBe("2026-11-23");
    expect(buildTurnInput({ today: portDate(new Date("2026-11-23T19:00:00Z")), memory: null, message: "hi", formReply: null })).toContain("date: 2026-11-24");
  });
});

describe("calculator errors", () => {
  it("explains thousands separators and round() limits", () => {
    expect(() => calculateTariffExpression("1,234.50 * 2")).toThrow(/thousands separators/);
    expect(() => calculateTariffExpression("round(1/3, 9)")).toThrow(/0 to 8 decimal places/);
    expect(calculateTariffExpression("max(1, 2.50)")).toBe("2.50");
    expect(() => calculateTariffExpression("2 +")).toThrow(/Use numbers/);
  });
});
