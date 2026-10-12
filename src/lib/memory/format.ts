import type { MemoryFact } from "./contracts";
export function checkedFacts(input:unknown):MemoryFact[] {
  if(!Array.isArray(input)||input.length>64)throw new Error("INVALID_MEMORY");
  const keys=new Set<string>();
  return input.map(raw=>{
    if(!raw||typeof raw!=="object"||typeof raw.key!=="string"||!/^[a-z][a-z0-9_]{0,79}$/.test(raw.key)||keys.has(raw.key)||
      typeof raw.value!=="string"||!raw.value.trim()||new TextEncoder().encode(raw.value).length>1024||raw.value.includes("\0")||
      !Array.isArray(raw.sources)||!raw.sources.length||raw.sources.length>8||raw.sources.some((s:unknown)=>typeof s!=="string"||!/^[a-zA-Z0-9_-]{1,100}$/.test(s))||new Set(raw.sources).size!==raw.sources.length)throw new Error("INVALID_MEMORY");
    keys.add(raw.key);
    return {key:raw.key,value:raw.value,sources:[...raw.sources]};
  });
}
export function memorySummary(facts:MemoryFact[]):string {
  const selected:{key:string;value:string}[]=[];
  for(const {key,value} of facts){
    if(new TextEncoder().encode(JSON.stringify([...selected,{key,value}])).length>7900)break;
    selected.push({key,value});
  }
  return "# Saved memory\n\n"+JSON.stringify(selected);
}
