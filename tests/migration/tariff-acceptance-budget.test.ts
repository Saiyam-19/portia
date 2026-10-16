import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";

const directories: string[] = [];
afterEach(() => { for(const path of directories.splice(0))rmSync(path,{recursive:true,force:true}); });
const directory = () => { const path=mkdtempSync(join(tmpdir(),"portia-tariff-budget-"));directories.push(path);return path; };
const load = () => createRequire(import.meta.url)("../../scripts/audit/tariff-provider.cjs") as { createFreeTariffFetch: (options: { directory: string; budgetDirectory?: string; maxDispatches?: number; upstream: typeof fetch }) => typeof fetch };
const request = (overrides = {}) => ({ method:"POST",body:JSON.stringify({model:"nvidia/nemotron-3-super-120b-a12b:free",provider:{allow_fallbacks:false,max_price:{prompt:0,completion:0,request:0}},...overrides}) });
const endpoint="https://openrouter.ai/api/v1/chat/completions";

it("allows eight concurrent dispatches total and denies the ninth across wrappers/restarts", async () => {
  const upstream=vi.fn(async()=>Response.json({ok:true}));const dir=directory();
  const first=load().createFreeTariffFetch({directory:dir,upstream});
  await Promise.all(Array.from({length:8},()=>first(endpoint,request())));
  const restarted=load().createFreeTariffFetch({directory:dir,upstream});
  await expect(restarted(endpoint,request())).rejects.toThrow("budget exhausted");
  expect(upstream).toHaveBeenCalledTimes(8);
});

it.each([
  {model:"paid/model"},
  {provider:{allow_fallbacks:true,max_price:{prompt:0,completion:0,request:0}}},
  {provider:{allow_fallbacks:false,max_price:{prompt:0,completion:1,request:0}}},
])("rejects model/price/fallback drift before dispatch", async overrides => {
  const upstream=vi.fn();const guarded=load().createFreeTariffFetch({directory:directory(),upstream});
  await expect(guarded(endpoint,request(overrides))).rejects.toThrow("price/model guard");expect(upstream).not.toHaveBeenCalled();
});

it("retains failed dispatch reservations and never retries upstream", async () => {
  const upstream=vi.fn(async()=>{throw new Error("Synthetic network failure");});const guarded=load().createFreeTariffFetch({directory:directory(),upstream});
  await expect(guarded(endpoint,request())).rejects.toThrow("Synthetic network failure");expect(upstream).toHaveBeenCalledTimes(1);
  await expect(guarded(endpoint,request())).rejects.toThrow("stopped after systemic");expect(upstream).toHaveBeenCalledTimes(1);
});

it("stops further dispatches after an HTTP provider failure", async () => {
  const upstream=vi.fn(async()=>Response.json({error:"Synthetic outage"},{status:503}));const guarded=load().createFreeTariffFetch({directory:directory(),upstream});
  expect((await guarded(endpoint,request())).status).toBe(503);
  await expect(guarded(endpoint,request())).rejects.toThrow("stopped after systemic");expect(upstream).toHaveBeenCalledTimes(1);
});

it("allows only two additional calls in a new evidence directory after the prior two", async()=>{
  const firstDir=directory(),nextDir=directory();const upstream=vi.fn(async()=>Response.json({ok:true}));
  const first=load().createFreeTariffFetch({directory:firstDir,upstream});await first(endpoint,request());await first(endpoint,request());
  const oldLog=readFileSync(join(firstDir,"provider-events.jsonl"),"utf8");
  const next=load().createFreeTariffFetch({directory:nextDir,budgetDirectory:firstDir,maxDispatches:4,upstream});
  await next(endpoint,request());await next(endpoint,request());await expect(next(endpoint,request())).rejects.toThrow("budget exhausted");
  expect(upstream).toHaveBeenCalledTimes(4);expect(readFileSync(join(firstDir,"provider-events.jsonl"),"utf8")).toBe(oldLog);
});
