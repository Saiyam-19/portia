import {z} from 'zod';
import {BOOLEAN_FIELDS,FIELD_NAMES,type ConversationField} from './conversation';
const identity={subject:z.string().min(1).max(100),item:z.string().max(64)};
export const FACT_ENUMS={
  request:['supplied-quote','official-quote','rule','elapsed','comparison','facts','other'],
  tax:['none','percentage','included','exempt','not_stated'],
  minimum:['none','amount','not_stated'],maximum:['none','amount','not_stated'],
  basis:['gt-period','time-period','movement','flat','amount','cargo-tonne','not_stated'],
  rounding:['started','exact','none','not_stated'],
  minimumScope:['block','call','none','not_stated'],maximumScope:['block','call','none','not_stated'],
  moneyRounding:['line','quote','none','not_stated'],otherAdjustments:['none','present','not_stated'],
  currency:['USD','INR','EUR','GBP','not_stated'],fxFrom:['USD','INR','EUR','GBP','not_stated'],fxTo:['USD','INR','EUR','GBP','not_stated'],
  dateOrder:['DMY','MDY','not_stated'],service:['coastal','foreign','not_stated'],cargoOperation:['loading','discharging','both','none','not_stated'],
  vesselCategory:['general-cargo','container','tanker','offshore-supply','naval','coast-guard','passenger','cruise','other','not_stated'],
  cargoTraffic:['exim','coastal','transshipment','not_stated'],handlingMode:['road','rail','ship-yard','not_stated'],cargoCategory:['mechanized-bulk','other','not_stated'],
} as const;
const binary=BOOLEAN_FIELDS.filter(f=>f!=='taxExemption'&&f!=='otherAdjustments');
const scalar=FIELD_NAMES.filter(f=>!['arithmeticExpression','taxExemption','minimumTreatment','maximumTreatment'].includes(f)&&!(f in FACT_ENUMS)&&!(binary as string[]).includes(f));
const scalarSchema=z.object({...identity,field:z.enum([...scalar,'minimumAmount','maximumAmount']),value:z.string().min(1).max(200)}).strict();
const rows=[scalarSchema,z.object({...identity,field:z.enum(binary),value:z.enum(['yes','no','not_stated'])}).strict(),...Object.entries(FACT_ENUMS).map(([field,values])=>z.object({...identity,field:z.literal(field),value:z.enum(values)}).strict())];
export const flatInterpretationSchema=z.object({facts:z.array(z.union(rows)).min(1).max(256)}).strict();
export type FlatInterpretation={facts:Array<{subject:string;item:string;field:string;value:string}>};
export type InternalFlatFact={subject:string;item:string;field:ConversationField|'request';value:string};

// Retained only at the internal compiler boundary for v2 saved facts/receipts.
// The model wrapper and public tool validate the strict v3 schema above first.
const legacyFields=FIELD_NAMES.filter(f=>!['arithmeticExpression','tax','minimumTreatment','maximumTreatment'].includes(f));
const legacySchema=z.object({facts:z.array(z.object({...identity,field:z.enum([...legacyFields,'request']),value:z.string().min(1).max(200)}).strict()).min(1).max(256)}).strict();
const noTax=(s:string)=>/\b(?:no|without)\b[^.!?\n]*\btax(?:es)?\b/i.test(s)&&!/\b(?:unless|except|if)\b/i.test(s);
export function readFlatFacts(raw:unknown,text:string):InternalFlatFact[]{
  const parsed=flatInterpretationSchema.safeParse(raw);
  const source:FlatInterpretation=parsed.success?parsed.data:legacySchema.parse(raw);
  const normalized=source.facts.flatMap(row=>{
    if(!parsed.success){
      if(row.field==='taxExemption')return [{...row,field:'tax',value:row.value==='yes'?(noTax(text)?'none':'exempt'):'not_stated'}];
      if(row.field==='taxPercent'&&row.value==='0'&&noTax(text))return [{...row,field:'tax',value:'none'}];
      if(['minimum','maximum'].includes(row.field)&&/^\d+(?:\.\d+)?$/.test(row.value)){
        const absent=row.value==='0'&&new RegExp(`\\bno\\b[^.!?\\n]*\\b${row.field==='minimum'?'minimum':'(?:maximum|cap)'}\\b`,'i').test(text);
        return absent?[{...row,value:'none'}]:[{...row,value:'amount'},{...row,field:row.field+'Amount'}];
      }
      if(row.field==='otherAdjustments'&&['yes','no'].includes(row.value))return [{...row,value:row.value==='no'?'none':'present'}];
      if(row.field==='moneyRounding'&&/after\s+adding\s+each\s+quotation/i.test(row.value))return [{...row,value:'quote'}];
    }
    return [row];
  });
  const checked=flatInterpretationSchema.parse({facts:normalized});
  return checked.facts.filter(row=>row.value!=='not_stated').map(row=>{
    let field=row.field,value=row.value;
    if(field==='minimum'||field==='maximum')field+='Treatment';
    else if(field==='minimumAmount'||field==='maximumAmount')field=field.replace('Amount','');
    else if(field==='otherAdjustments')value=value==='none'?'false':'true';
    else if((binary as string[]).includes(field))value=value==='yes'?'true':'false';
    return {...row,field:field as InternalFlatFact['field'],value};
  });
}
