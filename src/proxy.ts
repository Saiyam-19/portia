import { NextResponse, type NextRequest } from "next/server";
// Authentication is checked against the live Convex session in protected layouts and APIs.
export function proxy(request: NextRequest) { return NextResponse.next({ request }); }
export const config = { matcher: ["/dashboard/:path*"] };
