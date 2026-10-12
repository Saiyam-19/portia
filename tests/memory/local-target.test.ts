import {expect,it} from "vitest";
import {localBackendTarget} from "../../src/lib/migration/local-target";
it("requires an explicit matching loopback deployment and rejects mixed cloud targets",()=>{
 const env={PORTIA_LOCAL_BACKEND:"true",PORTIA_CONVEX_DEPLOYMENT:"local-memory-integration",SITE_URL:"http://127.0.0.1:3022"};
 expect(localBackendTarget(env,"http://127.0.0.1:3220","http://127.0.0.1:3221")).toBe(true);
 for(const bad of [{...env,PORTIA_LOCAL_BACKEND:"false"},{...env,PORTIA_CONVEX_DEPLOYMENT:"brilliant-whale-380"},{...env,SITE_URL:"https://app.example.com"}])expect(localBackendTarget(bad,"http://127.0.0.1:3220","http://127.0.0.1:3221")).toBe(false);
 expect(localBackendTarget(env,"https://brilliant-whale-380.convex.cloud","http://127.0.0.1:3221")).toBe(false);
 expect(localBackendTarget(env,"http://127.0.0.1:3220","http://127.0.0.1:4221")).toBe(false);
});
