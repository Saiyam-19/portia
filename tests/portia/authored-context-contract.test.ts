import { expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { QuoteSession } from "../../src/lib/portia/session";

const command = {
  action: "create" as const, pricing: "supplied" as const, name: "Aurora",
  call: { vesselName: "Aurora", nt: "1200", reference: "Ref-A17" },
  lines: [{ name: "attendance", currency: "USD", billing: { kind: "flat" as const, price: "100", basis: "user-stated-flat" as const } }],
};

it("uses earlier scoped human particulars after a terse follow-up", async () => {
  const session = new QuoteSession("earlier-facts");
  await session.initialize([
    { role: "user", content: "Aurora has NT 1200. Aurora supplier reference is Ref-A17." },
    { role: "assistant", content: "What attendance price was supplied?" },
    { role: "user", content: "USD 100. Prepare it." },
  ]);
  const result = await session.executeCommand(command);
  expect(result.status).not.toBe("error");
  const quote = [...session.quotes.values()][0];
  expect(quote).toMatchObject({ name: "Aurora", call: { nt: "1200", reference: "Ref-A17" } });
});

it.each([
  ["withdrawn", "Aurora has NT 1200. Aurora supplier reference is Ref-A17.", "NT is unknown now. Prepare Aurora."],
  ["other vessel", "Borealis has NT 1200. Aurora supplier reference is Ref-A17.", "Prepare Aurora for USD 100."],
])("does not revive %s net tonnage", async (_label, prior, current) => {
  const session = new QuoteSession("context-fence");
  await session.initialize([{ role: "user", content: prior }, { role: "user", content: current }]);
  expect((await session.executeCommand(command)).status).toBe("error");
  expect(session.quotes.size).toBe(0);
});

it("does not treat assistant text as earlier human particulars", async () => {
  const session = new QuoteSession("assistant-facts");
  const messages: ModelMessage[] = [
    { role: "user", content: "Prepare Aurora; reference Ref-A17." },
    { role: "assistant", content: "Aurora has NT 1200." },
    { role: "user", content: "USD 100 for attendance." },
  ];
  await session.initialize(messages);
  expect((await session.executeCommand(command)).status).toBe("error");
});
