import { texts } from '../pass1/golden';
import type { FlatInterpretation } from '../../../src/lib/migration/flat-interpretation';
export {texts};
export type Row = FlatInterpretation['facts'][number];
export const rows=(subject:string,item:string,values:Record<string,string>)=>Object.entries(values).map(([field,value])=>({subject,item,field,value})) as Row[];
export const line=(subject:string,item:string,rate:string,currency='USD')=>rows(subject,item,{charge:item,currency,rate,basis:'amount'});
export function quoteFacts(id:'D19'|'D24'|'D02'|'original-19'):FlatInterpretation {
  if(id==='D19')return {facts:[...rows('Quote','',{request:'supplied-quote',taxPercent:'0'}),...line('Quote','berth hire','825'),...line('Quote','pilotage','390'),...line('Quote','water supply','65')]};
  if(id==='D24')return {facts:[
    ...rows('A','',{request:'supplied-quote',taxPercent:'0',otherAdjustments:'no'}),...line('A','item_1','1275.35'),...line('A','item_2','84.65'),
    ...rows('B','',{request:'supplied-quote',taxPercent:'0',otherAdjustments:'no'}),...line('B','item_1','114500','INR'),
    ...rows('Comparison','',{request:'comparison',currency:'INR',fxRate:'83.25',fxFrom:'USD',fxTo:'INR',moneyRounding:'quote',moneyDecimals:'2'}),
  ]};
  if(id==='D02')return {facts:[
    ...rows('Quote','',{request:'supplied-quote',berthStart:'18 October 2026 at 22:45',berthEnd:'20 October 2026 at 05:15',timeZone:'India time',taxPercent:'0'}),
    ...rows('Quote','',{request:'elapsed'}),...rows('Quote','berth',{charge:'berth',currency:'INR',rate:'4000',basis:'time-period',periodHours:'6',rounding:'started'}),
  ]};
  return {facts:['A','B','C'].flatMap((subject,i)=>[
    ...rows(subject,'',{request:'supplied-quote',gt:'10000',durationHours:i===2?'48':'24',...(i===1?{durationMinutes:'1'}:{}),taxPercent:'0',otherAdjustments:'no'}),
    ...rows(subject,'berth',{charge:'berth',currency:'INR',rate:'0.25',basis:'gt-period',periodHours:'1',rounding:'started'}),
  ])};
}
