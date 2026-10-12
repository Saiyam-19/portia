import { z } from "zod";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { authComponent } from "./auth";
import { requireMigrationDevEnabled,isAllowedEmail } from "./lib/migrationGate";
const id=z.string().min(1).max(100);
const actor={runId:id.optional(),runFence:z.number().int().positive().optional()};
const operation=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("remember"),key:z.string(),value:z.string().max(1024),source:id}).strict(),
  z.object({kind:z.literal("forget"),key:z.string()}).strict(),z.object({kind:z.literal("clear")}).strict(),
]);
const schema=z.discriminatedUnion("op",[
  z.object({op:z.literal("open"),args:z.object({...actor,conversationId:id.optional()}).strict()}).strict(),
  z.object({op:z.literal("enqueue"),args:z.object({...actor,requestId:z.string().max(240),expectedEpoch:z.number().int().nonnegative(),operation}).strict()}).strict(),
  z.object({op:z.literal("claim"),args:z.object({}).strict()}).strict(),
  z.object({op:z.literal("publish"),args:z.object({token:id,fence:z.number().int().positive(),epoch:z.number().int().nonnegative(),baseRevision:z.number().int().nonnegative(),through:z.number().int().positive(),image:z.string().max(700000)}).strict()}).strict(),
  z.object({op:z.literal("writeNotes"),args:z.object({...actor,requestId:z.string().max(240),expectedEpoch:z.number().int().nonnegative(),markdown:z.string().max(6000)}).strict()}).strict(),
]);
function json(body:unknown,status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});}
export const memoryBridge=httpAction(async(ctx,request)=>{
  try {
    requireMigrationDevEnabled();
    if(process.env.PORTIA_MEMORY_ENABLED!=="true")return json({code:"MEMORY_DISABLED"},404);
    const expected=process.env.PORTIA_SERVER_SECRET??"",supplied=request.headers.get("x-portia-server-secret")??"";
    if(expected.length<32||supplied.length!==expected.length)return json({code:"UNAUTHENTICATED"},401);
    let mismatch=0;for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^supplied.charCodeAt(i);
    if(mismatch)return json({code:"UNAUTHENTICATED"},401);
    const user=await authComponent.getAuthUser(ctx);
    if(!isAllowedEmail(user.email))return json({code:"UNAUTHENTICATED"},401);
    if(Number(request.headers.get("content-length")??0)>760000)return json({code:"REQUEST_TOO_LARGE"},413);
    const raw=await request.text();
    if(new TextEncoder().encode(raw).length>760000)return json({code:"REQUEST_TOO_LARGE"},413);
    const parsed=schema.safeParse(JSON.parse(raw));
    if(!parsed.success)return json({code:"INVALID_REQUEST"},400);
    const body=parsed.data;
    if(body.op==="open")return json(await ctx.runMutation(internal.memory.open,{ownerId:user._id,...body.args,runId:body.args.runId as Id<"migrationRuns">|undefined,conversationId:body.args.conversationId as Id<"migrationConversations">|undefined}));
    if(body.op==="enqueue")return json(await ctx.runMutation(internal.memory.enqueue,{ownerId:user._id,...body.args,runId:body.args.runId as Id<"migrationRuns">|undefined}));
    if(body.op==="claim")return json(await ctx.runMutation(internal.memory.claim,{ownerId:user._id}));
    if(body.op==="publish")return json(await ctx.runMutation(internal.memory.publish,{ownerId:user._id,...body.args}));
    return json(await ctx.runMutation(internal.memory.writeNotes,{ownerId:user._id,...body.args,runId:body.args.runId as Id<"migrationRuns">|undefined}));
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    const code=/Unauthenticated/i.test(message)?"UNAUTHENTICATED":(["NOT_FOUND","STALE_WRITER","MEMORY_CHANGED","MEMORY_BUSY","MEMORY_LIMIT","STALE_RUN","RUN_REQUIRED","MEMORY_REPLAY_CONFLICT"].find(c=>message.includes(c))??"MEMORY_UNAVAILABLE");
    return json({code},code==="UNAUTHENTICATED"?401:409);
  }
});
