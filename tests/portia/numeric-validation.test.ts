import {it,expect} from 'vitest';
import {decimal,quoteCommandSchema} from '../../src/lib/portia/quotes';
import {comparisonSchema} from '../../src/lib/portia/session';
it.each(['10%','NaN','Infinity','one','', '1e999999999999'])('returns validation failure for malformed numeric %j',value=>{
 expect(decimal.safeParse(value).success).toBe(false);
 expect(quoteCommandSchema.safeParse({action:'create',pricing:'supplied',terms:{taxPercent:value}}).success).toBe(false);
 expect(quoteCommandSchema.safeParse({action:'create',pricing:'supplied',lines:[{name:'Fee',billing:{kind:'quantity',quantity:'3',quantityLabel:'units',perQuantity:value}}]}).success).toBe(false);
 expect(comparisonSchema.safeParse({quoteIds:['a','b'],exchangeRates:[{from:'USD',to:'EUR',rate:value}]}).success).toBe(false);
});
it('keeps valid zero money and percentages while rejecting zero denominators and FX',()=>{
 expect(decimal.safeParse('0').success).toBe(true);
 expect(quoteCommandSchema.safeParse({action:'create',pricing:'supplied',terms:{taxPercent:'0'},lines:[{name:'Fee',billing:{kind:'flat',price:'0',basis:'user-stated-flat'}}]}).success).toBe(true);
 expect(quoteCommandSchema.safeParse({action:'create',pricing:'supplied',lines:[{name:'Fee',billing:{kind:'quantity',quantity:'3',quantityLabel:'units',perQuantity:'0'}}]}).success).toBe(false);
 expect(comparisonSchema.safeParse({quoteIds:['a','b'],exchangeRates:[{from:'USD',to:'EUR',rate:'0'}]}).success).toBe(false);
});
