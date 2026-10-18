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

  it('preserves nested products and attachments without flattening versions or raw JSON', () => {
    const markdown = `---
status: success
id: "abc-123"
title: "Sample title"
type: "Article"
views: 42
createdAt: "2024-01-01T00:00:00.000Z"
updatedAt: "2024-01-02T00:00:00.000Z"
sourceUrl: "https://example.com/article/123"
products:
  - id: "prod-1"
    name: "Product One"
    versions:
      - "1.0"
      - "2.0"
  - id: "prod-2"
    name: "Product Two"
    versions:
      - "3.0"
attachments:
  - id: "file-1"
    name: "guide.pdf"
    contentType: "application/pdf"
    size: 2048
    isExternalAttachment: false
    url: "https://example.com/files/guide.pdf"
  - id: "file-2"
    name: "image.png"
    contentType: "image/png"
    size: 1024
    isExternalAttachment: true
    url: ""
---

# Hello`;

    const result = parseMarkdownMetadata(markdown);

    expect(result.metadata.products).toHaveLength(2);
    expect(result.metadata.products[0].name).toBe('Product One');
    expect(result.metadata.products[0].versions).toEqual(['1.0', '2.0']);
    expect(result.metadata.products[1].versions).toEqual(['3.0']);
    expect(result.metadata.attachments).toHaveLength(2);
    expect(result.metadata.attachments[0].name).toBe('guide.pdf');
    expect(result.metadata.attachments[1].isExternalAttachment).toBe(true);
    expect(result.metadata.attachments[1].url).toBe('');
  });
});
