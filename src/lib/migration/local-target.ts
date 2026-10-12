/** Local verification is explicit and can never match a cloud deployment. */
export function loopbackOrigin(value: string | undefined): boolean {
  try { const u=new URL(value??"");return u.protocol==="http:"&&u.hostname==="127.0.0.1"&&u.origin===value&&Number(u.port)>=1024&&Number(u.port)<65536; } catch {return false;}
}
export function localBackendTarget(env:Record<string,string|undefined>,apiUrl?:string,siteUrl?:string) {
  if(env.PORTIA_LOCAL_BACKEND!=="true"||env.PORTIA_CONVEX_DEPLOYMENT!=="local-memory-integration")return false;
  if(!loopbackOrigin(apiUrl)||!loopbackOrigin(siteUrl)||!loopbackOrigin(env.SITE_URL))return false;
  return Number(new URL(siteUrl!).port)===Number(new URL(apiUrl!).port)+1;
}
