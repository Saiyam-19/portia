import { expect, it } from 'vitest';
import { QuoteSession } from '../../src/lib/portia/session';
import { money, calculateSupplied, type Quote } from '../../src/lib/portia/quotes';
it('forget invalidates already-recalled facts and notes in the same response',()=>{
 const s=new QuoteSession('memory-fence');
 const old=[{toolCallId:'r',toolName:'recall_memory',output:{facts:[{key:'rate',value:'DELETED-FACT'}]}},{toolCallId:'n',toolName:'read_scratchpad',output:{markdown:'DELETED-NOTE'}}];
 s.observeTools(old);s.observeTools([...old,{toolCallId:'f',toolName:'forget_memory',output:{saved:true}}]);s.observeTools([...old,{toolCallId:'f',toolName:'forget_memory',output:{saved:true}}]);
 s.recordAnswer('quote',{body:'A valid unrelated quotation',questions:[]});expect(s.finalText('')).not.toMatch(/DELETED-FACT|DELETED-NOTE/);
});
it('groups only integer digits, retaining fractional precision',()=>{expect(money('USD','12.1234')).toBe('USD 12.1234');expect(money('USD','1234.123456789')).toBe('USD 1,234.123456789');});
it('aggregation retains the calculator decimal precision',()=>{
 const q:Quote={id:'q',revision:0,name:'Precision',pricing:'supplied',call:{},services:[],terms:{taxPercent:'0'},lines:[{name:'A',currency:'USD',amount:'99999999999999999.1234567890123456789'},{name:'B',currency:'USD',amount:'99999999999999999.1234567890123456789'}]};
 expect(calculateSupplied(q).totals?.[0].amount).toBe('199999999999999998.2469135780246913578');
});
it('does not rank a tax-excluded subtotal against a tax-included total',async()=>{
 const s=new QuoteSession('tax');await s.initialize([]);
 await s.update({pricing:'supplied',name:'Unknown tax',lines:[{name:'Berth',currency:'USD',amount:'100'}]});
 await s.update({pricing:'supplied',name:'With tax',lines:[{name:'Berth',currency:'USD',amount:'95'}],terms:{taxPercent:'10'}});
 const result=await s.compare({quoteIds:[...s.quotes.keys()],currency:'USD'});
 expect(result.status).toBe('unresolved');expect(result.questions.join(' ')).toContain('different services');expect(result).not.toHaveProperty('converted');expect(result.body).not.toContain('lower total');
});
it('official historical uncertainty blocks a priced result',async()=>{
 const s=new QuoteSession('old-official');
 const q:Quote={id:'old',revision:0,name:'Old',pricing:'official',call:{port:'Mumbai',service:'coastal'},services:['berth'],lines:[],terms:{unresolvedTerms:['Unrepresented historical governing concession']}};
 const result=await s.calculate(q);expect(result.questions).toContain('Unrepresented historical governing concession');expect(result.totals).toBeUndefined();
});
it('preserves more than sixteen historical unresolved terms across reload',async()=>{
 const {quoteDigest}=await import('../../src/lib/portia/session');
 const quote:Quote={id:'old-many',revision:0,name:'Historical conditions',pricing:'supplied',call:{},services:[],lines:[{name:'Berth',currency:'USD',amount:'10'}],terms:{unresolvedTerms:Array.from({length:20},(_,i)=>'Unresolved governing condition '+i)}};
 const unsigned={version:2,kind:'portia-quote',conversationId:'many',beforeRevision:-1,quote};
 const record={...unsigned,hash:quoteDigest(unsigned)};
 const messages:import('ai').ModelMessage[]=[{role:'tool',content:[{type:'tool-result',toolCallId:'many',toolName:'manage_quote',output:{type:'json',value:JSON.parse(JSON.stringify({record}))}}]}];
 const s=new QuoteSession('many');await s.initialize(messages);expect(s.quotes.get('old-many')?.terms.unresolvedTerms).toHaveLength(20);
 const updated=await s.update({quoteId:'old-many',name:'Still unresolved'});
 const next=new QuoteSession('many');await next.initialize([...messages,{role:'tool',content:[{type:'tool-result',toolCallId:'next',toolName:'manage_quote',output:{type:'json',value:JSON.parse(JSON.stringify(updated))}}]}]);
 expect(next.quotes.get('old-many')?.terms.unresolvedTerms).toHaveLength(20);
});
