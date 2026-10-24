/** A tool result may carry a card for the chat screen and a short summary for
 * later turns. Cards are rendered from tool results, never from model text. */
export type ToolCard = { kind: string } & Record<string, unknown>;

export function cardOf(output: unknown): ToolCard | undefined {
  const value = output && typeof output === "object" && (output as { type?: unknown }).type === "json"
    ? (output as { value?: unknown }).value : output;
  const card = value && typeof value === "object" ? (value as { card?: unknown }).card : undefined;
  return card && typeof card === "object" && typeof (card as { kind?: unknown }).kind === "string" ? card as ToolCard : undefined;
}
