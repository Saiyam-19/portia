import { z } from "zod";
import { MigrationTokenManager } from "@/lib/migration/bridge";
import { trustedMigrationOrigin } from "@/lib/migration/origin";
import { MemorySession,memoryFeatureEnabled } from "@/lib/memory/session";
import { migrationPreviewEnabled, migrationServerConfig } from "@/lib/migration/config";
import { readBoundedJsonBody } from "@/lib/bounded-json-body";
export const runtime="nodejs";
export const maxDuration=60;
const requestSchema=z.object({kind:z.enum(["forget","clear"]),key:z.string().regex(/^[a-z][a-z0-9_]{0,79}$/).optional(),epoch:z.number().int().nonnegative(),requestId:z.string().uuid()}).strict();
async function handle(request:Request,write:boolean) {
  if(!migrationPreviewEnabled()||!memoryFeatureEnabled())return new Response("Not found",{status:404});
  const configuredOrigin=migrationServerConfig().siteUrl;
  const origin=write?trustedMigrationOrigin(request):configuredOrigin;
  if(!origin)return Response.json({error:"Cross-origin request denied."},{status:403});
  const manager=new MigrationTokenManager(request.headers.get("cookie")??"",origin,new AbortController());
  try {
    await manager.initialize();
    const conversationId=new URL(request.url).searchParams.get("conversationId")??undefined;
    if(conversationId&&conversationId.length>100)throw new Error("INVALID_REQUEST");
    const session=new MemorySession(manager,conversationId);
    if(write) {
      const body=await readBoundedJsonBody(request,4096);
      if(!body.ok)return Response.json({error:body.reason==='too_large'?"Request too large.":"Invalid request."},{status:body.reason==='too_large'?413:400});
      const parsed=requestSchema.safeParse(body.value);
      if(!parsed.success||parsed.data.kind==="forget"&&!parsed.data.key)return Response.json({error:"Invalid request."},{status:400});
      const data=parsed.data;
      await session.mutate("user:"+data.requestId,data.kind==="clear"?{kind:"clear"}:{kind:"forget",key:data.key!},data.epoch);
    }
    return Response.json(await session.view(),{headers:{"Cache-Control":"no-store","Vary":"Cookie"}});
  } catch(error) {
    const code=error instanceof Error?error.message:"";
    const status=/Unauthenticated|Authentication|UNAUTHENTICATED/.test(code)?401:/NOT_FOUND/.test(code)?404:409;
    return Response.json({error:status===401?"Sign in to view memory.":status===404?"Conversation not found.":"Memory changed or is temporarily unavailable. Refresh and try again."},{status,headers:{"Cache-Control":"no-store"}});
  } finally {manager.stop();}
}
export const GET=(request:Request)=>handle(request,false);
export const POST=(request:Request)=>handle(request,true);
