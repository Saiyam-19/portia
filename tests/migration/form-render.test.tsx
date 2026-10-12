import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import FormCard from '../../src/components/chat/form-card';
it('renders inherited-property field names as empty required values', () => {
  const html = renderToStaticMarkup(<FormCard formCard={{ toolCallId: 'safe-field', title: 'Vessel details', fields: [{name:'constructor', label:'Constructor', type:'text',required:true},{name:'toString',label:'Details',type:'text',required:true}], response:null }} onSubmit={() => {}} onCancel={() => {}} />);
  expect(html).toContain('Vessel details');
  expect(html).not.toContain('function Object');
  expect(html).toMatch(/type="submit"[^>]*disabled=""/);
});
