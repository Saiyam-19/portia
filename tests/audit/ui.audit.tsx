import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import Message from '../../src/components/chat/message';
afterEach(()=>vi.unstubAllGlobals());

it('renders malicious markdown as inert text and strips script URLs',()=>{
  const html=renderToStaticMarkup(<Message role="assistant" streaming segments={[{kind:'text',content:'<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))\n\n[safe](https://example.com)'}]} />);
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('href="javascript:');
  expect(html).toContain('rel="noopener noreferrer"');
});
