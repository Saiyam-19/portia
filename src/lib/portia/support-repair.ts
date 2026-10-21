import { z } from "zod";
import { memoryKeySchema, memoryValueSchema, scratchpadSchema, supportRetrySchema } from "../memory/input";
import { vesselGetInputSchema, vesselSearchInputSchema } from "../migration/vessels";

const reviewGroup=z.string().trim().min(1).max(80).optional();
const schemas:Record<string,z.ZodType>={
  remember_memory:z.object({key:memoryKeySchema,value:memoryValueSchema,reviewGroup,retryOf:supportRetrySchema}).strict(),
  forget_memory:z.object({key:memoryKeySchema,reviewGroup,retryOf:supportRetrySchema}).strict(),
  recall_memory:z.object({retryOf:supportRetrySchema}).strict(),
  write_scratchpad:z.object({markdown:scratchpadSchema,retryOf:supportRetrySchema}).strict(),
  read_scratchpad:z.object({retryOf:supportRetrySchema}).strict(),
  search_vessels:vesselSearchInputSchema,
  get_vessel:vesselGetInputSchema,
};

/** Invalid paths define what a retry may change. Every other supplied field is
 * a verified selector/term and must remain identical. */
export function supportToolInvalidFields(toolName:string,input:unknown):string[][]{
  const schema=schemas[toolName];
  if(!schema||!input||typeof input!=="object"||Array.isArray(input))return [];
  const result=schema.safeParse(input);
  if(result.success)return [];
  return result.error.issues.flatMap(issue=>issue.code==="unrecognized_keys"
    ? issue.keys.map(key=>[...issue.path.map(String),key])
    : issue.path.length?[issue.path.map(String)]:[]);
}
