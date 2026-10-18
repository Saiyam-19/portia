import { jsonSchema, zodSchema } from "ai";
import type { z } from "zod";

type Json = { [key: string]: unknown; type?: string; properties?: Record<string, Json>; required?: string[]; items?: Json; anyOf?: Json[] };
/** OpenAI strict function syntax: missing domain values are null on the wire,
 * then omitted before ordinary Zod validation. Null never fabricates a default.
 * This adapter changes schema syntax only, not business meaning or arithmetic. */
export function nullableToolSchema<T>(schema: z.ZodType<T>) {
  const original = Promise.resolve(zodSchema(schema).jsonSchema);
  const strict = (node: Json): Json => {
    const result = { ...node };
    if (node.properties) {
      result.properties = Object.fromEntries(Object.entries(node.properties).map(([name, child]) => {
        const value = strict(child);
        return [name, node.required?.includes(name) ? value : { anyOf: [value, { type: "null" }], description: `${String(child.description ?? "")} Null means unknown or unchanged; never invent a value.` }];
      }));
      result.required = Object.keys(node.properties); result.additionalProperties = false;
    }
    if (node.items) result.items = strict(node.items);
    if (node.anyOf) result.anyOf = node.anyOf.map(strict);
    return result;
  };
  const omitMissing = (value: unknown, node: Json): unknown => {
    if (Array.isArray(value) && node.items) return value.map(item => omitMissing(item, node.items!));
    if (value && typeof value === "object" && node.properties) return Object.fromEntries(Object.entries(value).flatMap(([name, item]) => {
      if (item === null && !node.required?.includes(name)) return [];
      return [[name, node.properties![name] ? omitMissing(item, node.properties![name]) : item]];
    }));
    return value;
  };
  return jsonSchema<T>(async () => strict(await original as Json) as Awaited<typeof original>, { validate: async value => {
    const result = schema.safeParse(omitMissing(value, await original as Json));
    return result.success ? { success: true, value: result.data } : { success: false, error: result.error };
  } });
}
