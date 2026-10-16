import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import FormCard from '../../src/components/chat/form-card';
import Message from '../../src/components/chat/message';
afterEach(()=>vi.unstubAllGlobals());

it('structured text fields cap entries at the server limit',()=>{
  const html=renderToStaticMarkup(<FormCard formCard={{toolCallId:'audit',title:'Input',fields:[{name:'note',label:'Note',type:'textarea',required:false},{name:'name',label:'Name',type:'text',required:true}],response:null}} onSubmit={()=>{}} onCancel={()=>{}} />);
  // Two supplied fields plus the optional context note must share the 2000-character bound.
  expect((html.match(/maxLength="2000"/gi)||[]).length).toBe(3);
});

it('renders malicious markdown as inert text and strips script URLs',()=>{
  const html=renderToStaticMarkup(<Message role="assistant" streaming segments={[{kind:'text',content:'<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))\n\n[safe](https://example.com)'}]} />);
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('href="javascript:');
  expect(html).toContain('rel="noopener noreferrer"');
});

it('preserves submitted and cancelled notes as text without HTML execution',()=>{
  for(const cancelled of [false,true]){
    const html=renderToStaticMarkup(<FormCard formCard={{toolCallId:'audit',title:'Done',fields:[],response:{cancelled,content:'<img src=x onerror=alert(1)>'}}} onSubmit={()=>{}} onCancel={()=>{}} />);
    expect(html).toContain(cancelled?'Cancelled':'Submitted');expect(html).not.toContain('<img');expect(html).toContain('&lt;img');
  }
});
