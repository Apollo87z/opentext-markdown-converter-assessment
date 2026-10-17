import { describe, expect, it } from 'vitest';
import { parseMarkdownMetadata } from './markdown';

describe('parseMarkdownMetadata', () => {
  it('parses front matter metadata and strips it from the body', () => {
    const markdown = `---
status: success
id: "abc-123"
sourceUrl: "https://example.com/article/123"
title: "Sample title"
---

# Hello

This is body content.`;

    const result = parseMarkdownMetadata(markdown);

    expect(result.metadata.status).toBe('success');
    expect(result.metadata.id).toBe('abc-123');
    expect(result.metadata.sourceUrl).toBe('https://example.com/article/123');
    expect(result.metadata.title).toBe('Sample title');
    expect(result.body).toMatch(/^# Hello/);
  });
});
