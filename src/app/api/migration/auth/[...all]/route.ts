import { migrationAuthHandler } from "@/lib/migration/auth-server";
function canonical(request: Request) {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace("/api/migration/auth", "/api/auth");
  return new Request(url, request);
}
export const GET = (request: Request) => migrationAuthHandler.GET(canonical(request));
export const POST = (request: Request) => migrationAuthHandler.POST(canonical(request));
