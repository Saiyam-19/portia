import { jsonSchema, zodSchema } from "ai";
import type { z } from "zod";

type Json = { [key: string]: unknown; type?: string; properties?: Record<string, Json>; required?: string[]; items?: Json; anyOf?: Json[]; oneOf?: Json[]; const?: unknown; enum?: unknown[] };
/** OpenAI strict function syntax: missing domain values are null on the wire,
 * then omitted before ordinary Zod validation. Null never fabricates a default.
 * This adapter changes schema syntax only, not business meaning or arithmetic. */
export function nullableToolSchema<T>(schema: z.ZodType<T>) {
  const original = Promise.resolve(zodSchema(schema).jsonSchema);
  const strict = (node: Json): Json => {
    const result = { ...node };
    // The provider subset uses enums and anyOf. Zod emits oneOf for tagged
    // unions; it is equivalent to anyOf only when a required singleton tag
    // proves the branches disjoint. Never weaken an overlapping exclusive union.
    if (node.const !== undefined) { result.enum = [node.const]; delete result.const; }
    if (node.properties) {
      result.properties = Object.fromEntries(Object.entries(node.properties).map(([name, child]) => {
        const value = strict(child);
        return [name, node.required?.includes(name) ? value : { anyOf: [value, { type: "null" }], description: `${String(child.description ?? "")} Null means unknown or unchanged; never invent a value.` }];
      }));
      result.required = Object.keys(node.properties); result.additionalProperties = false;
    }
    if (node.items) result.items = strict(node.items);
    if (node.anyOf) result.anyOf = node.anyOf.map(strict);
    if (node.oneOf) {
      const branches = node.oneOf;
      const discriminator = Object.keys(branches[0]?.properties ?? {}).find(name => {
        const values = branches.map(branch => {
          const tag = branch.properties?.[name];
          if (!branch.required?.includes(name) || !tag) return undefined;
          return tag.const !== undefined ? JSON.stringify(tag.const) : tag.enum?.length === 1 ? JSON.stringify(tag.enum[0]) : undefined;
        });
        return values.every(value => value !== undefined) && new Set(values).size === branches.length;
      });
      if (!discriminator || node.anyOf) throw new Error("Strict tool schema requires disjoint, explicitly tagged union alternatives.");
      result.anyOf = branches.map(strict); delete result.oneOf;
    }
    return result;
  };
  const omitMissing = (value: unknown, node: Json): unknown => {
    if (Array.isArray(value) && node.items) return value.map(item => omitMissing(item, node.items!));
    const variants = node.anyOf ?? node.oneOf;
    if (value && typeof value === "object" && variants) {
      const record = value as Record<string, unknown>;
      const branch = variants.find(candidate => candidate.properties && Object.entries(candidate.properties).every(([name, property]) => {
        if (property.const !== undefined) return record[name] === property.const;
        return property.enum ? property.enum.includes(record[name]) : true;
      }));
      if (branch) return omitMissing(value, branch);
    }
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
