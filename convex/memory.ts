import {checkedFacts,memorySummary} from "../src/lib/memory/format";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { memoryActor, memoryState, memoryClaim, memoryOperation, workspaceResult, workspaceReplay as workspaceReplayValidator } from "./memoryValidators";
import { ensureMemory, findMemory, memoryRun, memoryError, memoryEnabled, enqueueMemory, hashMemory, memoryRowOperations, projectMemory, memoryBarrier } from "./lib/memoryLifecycle";
import { requireMigrationDevEnabled } from "./lib/migrationGate";
const enabled = () => { requireMigrationDevEnabled(); if (!memoryEnabled()) memoryError("MEMORY_DISABLED"); };

export const open = internalMutation({
  args: {...memoryActor, conversationId: v.optional(v.id("migrationConversations"))}, returns: memoryState,
  handler: async(ctx,args) => {
    enabled();
    const ns = await ensureMemory(ctx,args.ownerId);
    let conversationId = args.conversationId;
    if (args.runId) {
      const run = await memoryRun(ctx,args.ownerId,args.runId,args.runFence);
      conversationId = run.conversationId;
      if (run.memoryEpoch === undefined) await ctx.db.patch(run._id,{memoryEpoch:ns.epoch});
    }
    if (conversationId) {
      const conversation = await ctx.db.get(conversationId);
      if (!conversation || conversation.ownerId !== args.ownerId) return memoryError("NOT_FOUND");
    }
    const blocked = ns.blockedThrough > ns.appliedSequence;
    const snap = ns.snapshotId && !blocked ? await ctx.db.get(ns.snapshotId) : null;
    const note = conversationId ? await ctx.db.query("memoryScratchpads").withIndex("by_conversation",q=>q.eq("conversationId",conversationId)).unique() : null;
    return {epoch:ns.epoch,revision:ns.revision,pending:ns.nextSequence>ns.appliedSequence,blocked,image:snap?.image??null,
      scratchpad:!blocked && note?.epoch===ns.epoch ? note.markdown : "",scratchpadRevision:note?.revision??0};
  },
});
export const enqueue = internalMutation({
  args: {...memoryActor,requestId:v.string(),expectedEpoch:v.number(),operation:memoryOperation},
  returns:v.object({epoch:v.number(),sequence:v.number()}),
  handler:async(ctx,args)=>{
    enabled();
    const run=args.runId?await memoryRun(ctx,args.ownerId,args.runId,args.runFence):undefined;
    if(args.operation.kind==="remember" && (!run || args.operation.source!==run.conversationId)) return memoryError("RUN_REQUIRED");
    if(args.operation.kind==="delete_source") return memoryError("INVALID_OPERATION");
    return enqueueMemory(ctx,args.ownerId,args.requestId,args.expectedEpoch,args.operation,run);
  },
});
export const workspaceReplay = internalMutation({
  args: { ...memoryActor, toolCallId: v.string(), commandHash: v.string() }, returns: workspaceReplayValidator,
  handler: async (ctx, args) => {
    enabled();
    if (!args.runId) return memoryError("RUN_REQUIRED");
    const run = await memoryRun(ctx, args.ownerId, args.runId, args.runFence);
    const ns = await ensureMemory(ctx, args.ownerId);
    const receipt = await ctx.db.query("workspaceReceipts").withIndex("by_run_and_tool_call", q => q.eq("runId", run._id).eq("toolCallId", args.toolCallId)).unique();
    if (!receipt) return null;
    if (receipt.commandHash !== args.commandHash) return memoryError("MEMORY_REPLAY_CONFLICT");
    if (receipt.epoch !== ns.epoch || receipt.status === "invalidated") return memoryError("MEMORY_CHANGED");
    if (receipt.status === "pending") return { status: "pending" as const, epoch: receipt.epoch };
    if (!receipt.result) return memoryError("MEMORY_CHANGED");
    return { status: "done" as const, epoch: receipt.epoch, result: receipt.result };
  },
});
export const workspaceAccept = internalMutation({
  args: { ...memoryActor, toolCallId: v.string(), commandHash: v.string(), expectedEpoch: v.number(),
    baseRevision: v.number(), baseScratchpadRevision: v.number(), operations: v.array(memoryOperation), markdown: v.optional(v.string()), result: workspaceResult },
  returns: v.object({ epoch: v.number(), sequence: v.union(v.number(), v.null()), status: v.union(v.literal("pending"), v.literal("done")) }),
  handler: async (ctx, args) => {
    enabled();
    if (!args.runId) return memoryError("RUN_REQUIRED");
    const run = await memoryRun(ctx, args.ownerId, args.runId, args.runFence);
    const ns = await ensureMemory(ctx, args.ownerId);
    if (!args.toolCallId.length || args.toolCallId.length > 200 || !/^[a-f0-9]{64}$/.test(args.commandHash)) return memoryError("INVALID_REQUEST");
    const payloadHash = await hashMemory({ operations: args.operations, markdown: args.markdown ?? null, result: args.result });
    const prior = await ctx.db.query("workspaceReceipts").withIndex("by_run_and_tool_call", q => q.eq("runId", run._id).eq("toolCallId", args.toolCallId)).unique();
    if (prior) {
      if (prior.commandHash !== args.commandHash || prior.payloadHash !== payloadHash) return memoryError("MEMORY_REPLAY_CONFLICT");
      if (prior.epoch !== ns.epoch || prior.status === "invalidated") return memoryError("MEMORY_CHANGED");
      return { epoch: prior.epoch, sequence: prior.sequence ?? null, status: prior.status };
    }
    if (ns.epoch !== args.expectedEpoch) return memoryError("MEMORY_CHANGED");
    if (ns.revision !== args.baseRevision || ns.nextSequence !== ns.appliedSequence || ns.blockedThrough > ns.appliedSequence) return memoryError("MEMORY_BUSY");
    const note = await ctx.db.query("memoryScratchpads").withIndex("by_conversation", q => q.eq("conversationId", run.conversationId)).unique();
    if ((note?.revision ?? 0) !== args.baseScratchpadRevision) return memoryError("MEMORY_BUSY");
    if (args.operations.length > 16 || !Number.isInteger(args.result.exitCode) || args.result.exitCode < 0 || args.result.exitCode > 255 || new TextEncoder().encode(args.result.stdout + args.result.stderr).length > 16 * 1024) return memoryError("MEMORY_LIMIT");
    if (args.markdown !== undefined && (new TextEncoder().encode(args.markdown).length > 6000 || args.markdown.includes("\0"))) return memoryError("NOTES_TOO_LARGE");
    if (args.result.exitCode !== 0 && (args.operations.length || args.markdown !== undefined)) return memoryError("INVALID_OPERATION");
    const keys = new Set<string>();
    for (const operation of args.operations) {
      if (operation.kind === "delete_source" || (operation.kind === "remember" && operation.source !== run.conversationId)) return memoryError("INVALID_OPERATION");
      if (operation.kind === "clear" && args.operations.length !== 1) return memoryError("INVALID_OPERATION");
      if ("key" in operation) {
        if (keys.has(operation.key)) return memoryError("INVALID_OPERATION");
        keys.add(operation.key);
      }
    }
    const barrier = args.operations.some(operation => operation.kind === "forget" || operation.kind === "clear");
    if (barrier && args.markdown !== undefined) return memoryError("MEMORY_DELETE_WITH_NOTES");
    const operations = [...args.operations.filter(operation => operation.kind === "forget"), ...args.operations.filter(operation => operation.kind !== "forget")];
    const factIndex = await projectMemory(ns.factIndex, operations);
    const receipts = await ctx.db.query("workspaceReceipts").withIndex("by_run", q => q.eq("runId", run._id)).take(64);
    if (receipts.length >= 64) return memoryError("MEMORY_LIMIT");
    const pending = Boolean(operations.length || args.markdown !== undefined);
    const epoch = ns.epoch + Number(barrier), sequence = pending ? ns.nextSequence + 1 : null;
    const result = barrier ? { stdout: "", stderr: "", exitCode: args.result.exitCode } : args.result;
    const status = pending ? "pending" as const : "done" as const;
    const receiptId = await ctx.db.insert("workspaceReceipts", { ownerId: args.ownerId, runId: run._id, conversationId: run.conversationId,
      toolCallId: args.toolCallId, commandHash: args.commandHash, payloadHash, epoch, sequence: sequence ?? undefined, status, result });
    if (!receipts.length) await ctx.scheduler.runAfter(24 * 60 * 60 * 1000, internal.memory.cleanupWorkspaceRun, { runId: run._id });
    if (sequence !== null) {
      await ctx.db.insert("memoryOperations", { namespaceId: ns._id, requestId: "workspace:" + receiptId, hash: payloadHash, sequence, epoch, status: "pending",
        workspace: { operations, markdown: args.markdown, conversationId: run.conversationId, runId: run._id, receiptId } });
      await ctx.db.patch(ns._id, { nextSequence: sequence, factIndex, ...(barrier ? { epoch, blockedThrough: sequence, lease: undefined } : {}) });
      if (barrier) await memoryBarrier(ctx, ns, epoch, run);
    }
    return { epoch, sequence, status };
  },
});
export const claim = internalMutation({
  args:{ownerId:v.string()},returns:memoryClaim,
  handler:async(ctx,args)=>{
    enabled();const ns=await ensureMemory(ctx,args.ownerId);
    if(ns.lease && ns.lease.expiresAt>Date.now()) return null;
    const candidates=await ctx.db.query("memoryOperations").withIndex("by_namespace_and_status_and_sequence",q=>q.eq("namespaceId",ns._id).eq("status","pending")).take(16);
    const ops: typeof candidates = [];
    let count = 0;
    for (const row of candidates) {
      const cost = Math.max(1, memoryRowOperations(row).length);
      if (count + cost > 16) break;
      ops.push(row); count += cost;
    }
    if(!ops.length)return null;
    const lease={token:crypto.randomUUID(),fence:ns.fence+1,expiresAt:Date.now()+30_000,through:ops.at(-1)!.sequence};
    await ctx.db.patch(ns._id,{lease,fence:lease.fence});
    const snap=ns.snapshotId?await ctx.db.get(ns.snapshotId):null;
    return {token:lease.token,fence:lease.fence,epoch:ns.epoch,baseRevision:ns.revision,through:lease.through,image:snap?.image??null,operations:ops.flatMap(memoryRowOperations)};
  },
});
export const publish = internalMutation({
  args:{ownerId:v.string(),token:v.string(),fence:v.number(),epoch:v.number(),baseRevision:v.number(),through:v.number(),image:v.string()},
  returns:v.number(),
  handler:async(ctx,args)=>{
    enabled();const ns=await ensureMemory(ctx,args.ownerId);
    if(!ns.lease||ns.lease.token!==args.token||ns.lease.fence!==args.fence||ns.lease.expiresAt<=Date.now()||ns.epoch!==args.epoch||ns.revision!==args.baseRevision||ns.lease.through!==args.through) return memoryError("STALE_WRITER");
    if(args.image.length>700_000||!args.image.length||!/^[A-Za-z0-9+/]+=*$/.test(args.image))return memoryError("INVALID_SNAPSHOT");
    const rows=await ctx.db.query("memoryOperations").withIndex("by_namespace_and_status_and_sequence",q=>q.eq("namespaceId",ns._id).eq("status","pending").lte("sequence",args.through)).take(16);
    if(rows[0]?.sequence!==ns.appliedSequence+1||rows.at(-1)?.sequence!==args.through)return memoryError("INVALID_BATCH");
    let archive;
    try{archive=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(args.image),c=>c.charCodeAt(0))));}catch{return memoryError("INVALID_SNAPSHOT");}
    if(archive.format!==2||typeof archive.sqlite!=="string"||typeof archive.summary!=="string")return memoryError("INVALID_SNAPSHOT");
    const manifest=checkedFacts(archive.facts);
    if(archive.summary!==memorySummary(manifest))return memoryError("INVALID_SNAPSHOT");
    let sqlite:string;try{sqlite=atob(archive.sqlite);}catch{return memoryError("INVALID_SNAPSHOT");}
    if(sqlite.length>256*1024||sqlite.length<4096||!sqlite.startsWith("SQLite format 3\0"))return memoryError("INVALID_SNAPSHOT");
    if (rows.reduce((count, row) => count + Math.max(1, memoryRowOperations(row).length), 0) > 16) return memoryError("INVALID_BATCH");
    const projection=await projectMemory(ns.appliedIndex,rows.flatMap(memoryRowOperations));
    const normalized=(values:typeof projection)=>values.map(f=>({key:f.key,hash:f.hash,sources:[...f.sources].sort()})).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
    const actual=await Promise.all(manifest.map(async f=>({key:f.key,hash:await hashMemory(f.value),sources:f.sources})));
    if(JSON.stringify(normalized(projection))!==JSON.stringify(normalized(actual)))return memoryError("SNAPSHOT_MISMATCH");
    const snapshotId=await ctx.db.insert("memorySnapshots",{namespaceId:ns._id,image:args.image});
    if(ns.snapshotId)await ctx.db.delete(ns.snapshotId);
    for(const row of rows) {
      const workspace = row.workspace;
      if (workspace && row.epoch === ns.epoch) {
        const conversation = await ctx.db.get(workspace.conversationId);
        if (workspace.markdown !== undefined && conversation?.ownerId === args.ownerId) {
          const note = await ctx.db.query("memoryScratchpads").withIndex("by_conversation",q=>q.eq("conversationId",workspace.conversationId)).unique();
          const data = { ownerId: args.ownerId, conversationId: workspace.conversationId, epoch: ns.epoch, revision: (note?.revision ?? 0) + 1,
            markdown: workspace.markdown, requestId: "workspace:" + workspace.receiptId, hash: await hashMemory(workspace.markdown), updatedAt: Date.now() };
          if (note) await ctx.db.replace(note._id, data); else await ctx.db.insert("memoryScratchpads", data);
        }
        const receipt = await ctx.db.get(workspace.receiptId);
        if (receipt?.status === "pending" && receipt.epoch === ns.epoch) await ctx.db.patch(receipt._id, { status: "done" });
      }
      await ctx.db.patch(row._id,{status:"done",operation:undefined,workspace:undefined});
    }
    await ctx.db.patch(ns._id,{snapshotId,revision:ns.revision+1,appliedSequence:args.through,lease:undefined,appliedIndex:projection});
    await ctx.scheduler.runAfter(0,internal.memory.pruneReceipts,{namespaceId:ns._id});
    return ns.revision+1;
  },
});
export const writeNotes = internalMutation({
  args:{...memoryActor,expectedEpoch:v.number(),requestId:v.string(),markdown:v.string()},
  returns:v.object({revision:v.number()}),
  handler:async(ctx,args)=>{
    enabled();
    if(!args.runId)return memoryError("RUN_REQUIRED");
    const run=await memoryRun(ctx,args.ownerId,args.runId,args.runFence);
    const ns=await ensureMemory(ctx,args.ownerId);
    if(ns.epoch!==args.expectedEpoch||ns.blockedThrough>ns.appliedSequence)return memoryError("MEMORY_CHANGED");
    if(ns.nextSequence>ns.appliedSequence)return memoryError("MEMORY_BUSY");
    if(new TextEncoder().encode(args.markdown).length>6000||args.markdown.includes("\0"))return memoryError("NOTES_TOO_LARGE");
    const row=await ctx.db.query("memoryScratchpads").withIndex("by_conversation",q=>q.eq("conversationId",run.conversationId)).unique();
    const hash=await hashMemory(args.markdown);
    const receipt=await ctx.db.query("memoryNoteReceipts").withIndex("by_owner_and_request",q=>q.eq("ownerId",args.ownerId).eq("requestId",args.requestId)).unique();
    if(receipt){if(receipt.hash!==hash)return memoryError("MEMORY_REPLAY_CONFLICT");return {revision:receipt.revision};}
    if(row?.requestId===args.requestId) {if(row.hash!==hash)return memoryError("MEMORY_REPLAY_CONFLICT");return {revision:row.revision};}
    const revision=(row?.revision??0)+1;
    const data={ownerId:args.ownerId,conversationId:run.conversationId,epoch:ns.epoch,revision,markdown:args.markdown,requestId:args.requestId,hash,updatedAt:Date.now()};
    if(row)await ctx.db.replace(row._id,data);else await ctx.db.insert("memoryScratchpads",data);
    await ctx.db.insert("memoryNoteReceipts",{ownerId:args.ownerId,conversationId:run.conversationId,requestId:args.requestId,hash,revision});
    const receipts=await ctx.db.query("memoryNoteReceipts").withIndex("by_owner",q=>q.eq("ownerId",args.ownerId)).order("desc").take(228);
    for(const old of receipts.slice(128))await ctx.db.delete(old._id);
    return {revision};
  },
});
export const cleanupNotes = internalMutation({
  args:{ownerId:v.string(),epoch:v.number()},returns:v.null(),
  handler:async(ctx,args)=>{
    const rows=await ctx.db.query("memoryScratchpads").withIndex("by_owner_and_epoch",q=>q.eq("ownerId",args.ownerId).lt("epoch",args.epoch)).take(50);
    for(const row of rows)await ctx.db.delete(row._id);
    if(rows.length===50)await ctx.scheduler.runAfter(0,internal.memory.cleanupNotes,args);
    return null;
  },
});
export const redactWorkspaceReceipts = internalMutation({
  args: { ownerId: v.string(), epoch: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    let more = false;
    for (const status of ["pending", "done"] as const) {
      const rows = await ctx.db.query("workspaceReceipts").withIndex("by_owner_and_status_and_epoch", q => q.eq("ownerId", args.ownerId).eq("status", status).lt("epoch", args.epoch)).take(50);
      for (const row of rows) await ctx.db.patch(row._id, { status: "invalidated", result: undefined });
      more ||= rows.length === 50;
    }
    if (more) await ctx.scheduler.runAfter(0, internal.memory.redactWorkspaceReceipts, args);
    return null;
  },
});
export const cleanupWorkspaceRun = internalMutation({
  args: { runId: v.id("migrationRuns") }, returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run?.status === "active" && run.leaseExpiresAt > Date.now()) {
      await ctx.scheduler.runAfter(Math.max(60_000, run.leaseExpiresAt - Date.now()), internal.memory.cleanupWorkspaceRun, args);
      return null;
    }
    const rows = await ctx.db.query("workspaceReceipts").withIndex("by_run", q => q.eq("runId", args.runId)).take(64);
    for (const row of rows) await ctx.db.delete(row._id);
    return null;
  },
});
export const cleanupWorkspaceConversation = internalMutation({
  args: { conversationId: v.id("migrationConversations") }, returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("workspaceReceipts").withIndex("by_conversation", q => q.eq("conversationId", args.conversationId)).take(64);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 64) await ctx.scheduler.runAfter(0, internal.memory.cleanupWorkspaceConversation, args);
    return null;
  },
});
export const pruneReceipts = internalMutation({
  args:{namespaceId:v.id("memoryNamespaces")},returns:v.null(),
  handler:async(ctx,args)=>{
    const rows=await ctx.db.query("memoryOperations").withIndex("by_namespace_and_status_and_sequence",q=>q.eq("namespaceId",args.namespaceId).eq("status","done")).order("desc").take(228);
    for(const row of rows.slice(128))await ctx.db.delete(row._id);
    if(rows.length===228)await ctx.scheduler.runAfter(0,internal.memory.pruneReceipts,args);
    return null;
  },
});
export const inspect = internalQuery({
  args:{ownerId:v.string()},returns:v.object({snapshots:v.number(),payloads:v.number(),notes:v.number(),noteReceipts:v.number(),epoch:v.number(),blocked:v.boolean()}),
  handler:async(ctx,args)=>{
    const ns=await findMemory(ctx,args.ownerId);
    if(!ns)return {snapshots:0,payloads:0,notes:0,noteReceipts:0,epoch:0,blocked:false};
    const snapshots=await ctx.db.query("memorySnapshots").withIndex("by_namespace",q=>q.eq("namespaceId",ns._id)).take(2);
    const ops=await ctx.db.query("memoryOperations").withIndex("by_namespace_and_status_and_sequence",q=>q.eq("namespaceId",ns._id).eq("status","pending")).take(100);
    const notes=await ctx.db.query("memoryScratchpads").withIndex("by_owner_and_epoch",q=>q.eq("ownerId",args.ownerId)).take(100);
    const receipts=await ctx.db.query("memoryNoteReceipts").withIndex("by_owner",q=>q.eq("ownerId",args.ownerId)).take(129);
    return {snapshots:snapshots.length,payloads:ops.length,notes:notes.length,noteReceipts:receipts.length,epoch:ns.epoch,blocked:ns.blockedThrough>ns.appliedSequence};
  },
});
