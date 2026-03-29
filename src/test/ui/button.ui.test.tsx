import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '@/components/ui/button';

describe('button ui smoke test', () => {
  it('renders button text in markup', () => {
    const html = renderToStaticMarkup(<Button>Start Session</Button>);

    expect(html).toContain('Start Session');
    expect(html).toContain('button');
  });
});
