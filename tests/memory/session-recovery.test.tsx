
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({
 session:{isPending:false,data:{user:{id:"owner"}},error:null},
 auth:{isLoading:false,isAuthenticated:false},
}));
vi.mock("convex/react",()=>({useConvexAuth:()=>state.auth}));
vi.mock("next/navigation",()=>({useRouter:()=>({replace:vi.fn(),refresh:vi.fn()})}));
vi.mock("../../src/lib/migration/auth-client",()=>({migrationAuthClient:{useSession:()=>state.session,signOut:vi.fn()}}));
vi.mock("../../src/components/dashboard/query-boundary",()=>({default:({children}:{children:React.ReactNode})=>children}));
import SessionGate from "../../src/components/dashboard/session-gate";
it("shows recovery controls for a valid session with failed Convex token bootstrap",()=>{
 vi.stubGlobal("React",React);
 const html=renderToStaticMarkup(<SessionGate userId="owner"><div>private content</div></SessionGate>);
 expect(html).toContain("Retry connection");
 expect(html).not.toContain("Connecting secure session");
 expect(html).not.toContain("private content");
 vi.unstubAllGlobals();
});
