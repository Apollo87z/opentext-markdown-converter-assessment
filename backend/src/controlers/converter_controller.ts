
import type { Request, Response } from 'express';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';

import { conversionEngine } from '../services/markdown_converter.service.js';
import { HttpError } from '../middleware/errorHandler.js';

const ARTICLE_API =
  'https://my.opentext.com/api/web/support/article';

const OPENTEXT_BASE_URL = 'https://my.opentext.com';
const CLOUDFRONT_DISTRIBUTION_ID =
  process.env.CLOUDFRONT_DISTRIBUTION_ID;

const cloudFront = new CloudFrontClient({ region: 'us-east-1' });

async function loadArticle(url: unknown) {
  if (typeof url !== 'string' || !url.trim() || url.length > 2048) {
    throw new HttpError(400, 'Please provide a valid article URL.');
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new HttpError(400, 'Invalid article URL.');
  }

  if (
    parsedUrl.origin !== OPENTEXT_BASE_URL ||
    !/^\/support\/article\/\d+\/?$/.test(parsedUrl.pathname)
  ) {
    throw new HttpError(400, 'Invalid OpenText article URL.');
  }

  const articleId = parsedUrl.pathname.match(/\d+/)![0];

  let data: any;

  try {
    const response = await fetch(`${ARTICLE_API}/${articleId}`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`Upstream responded with ${response.status}`);
    }

    data = await response.json();
  } catch {
    throw new HttpError(502, 'Failed to load article.');
  }

  const content = data?.response;

  if (
    typeof content !== 'object' ||
    content === null ||
    typeof content.Content !== 'string' ||
    !content.Content.trim() ||
    content.Content.length > 2_000_000
  ) {
    throw new HttpError(502, 'Invalid article response.');
  }

  const fetchedAt = new Date().toISOString();

  const result = conversionEngine(
    content.Content,
    url,
    content.Title || `Article ${articleId}`,
  );

  return { url, articleId, content, result, fetchedAt };
}

async function invalidateArticleCache() {
  if (!CLOUDFRONT_DISTRIBUTION_ID) {
    throw new HttpError(
      500,
      'CloudFront invalidation is not configured.',
    );
  }

  try {
    const response = await cloudFront.send(
      new CreateInvalidationCommand({
        DistributionId: CLOUDFRONT_DISTRIBUTION_ID,
        InvalidationBatch: {
          CallerReference: `article-refresh-${Date.now()}-${Math.random()}`,
          Paths: {
            Quantity: 1,
            // Invalidate the normal endpoint and its query-string variants.
            Items: ['/api/v1/articles*'],
          },
        },
      }),
    );

    return response.Invalidation?.Id;
  } catch {
    throw new HttpError(502, 'Failed to invalidate the CloudFront cache.');
  }
}

function safeAttachmentUrl(attachment: any): string | null {
  for (const candidate of [attachment.url, attachment.fileUrl]) {
    if (typeof candidate !== 'string') continue;

    try {
      const parsed = new URL(candidate, OPENTEXT_BASE_URL);

      if (parsed.origin === OPENTEXT_BASE_URL) {
        return parsed.toString();
      }
    } catch {
      // Ignore invalid attachment URLs.
    }
  }

  return null;
}

function buildAttachments(content: any) {
  return (Array.isArray(content.Attachments) ? content.Attachments : []).map(
    (attachment: any) => ({
      id: attachment.id,
      name: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size,
      isExternalAttachment: attachment.isExternalAttachment,
      url: safeAttachmentUrl(attachment),
    }),
  );
}

function buildArticleMeta(content: any, title: string) {
  return {
    id: content.Id,
    title,
    type: content.ArticleType,
    views: content.Views,

    createdAt: content.CreatedTime
      ? new Date(content.CreatedTime).toISOString()
      : null,

    updatedAt: content.LastContentUpdateTime
      ? new Date(content.LastContentUpdateTime).toISOString()
      : null,

    products: (Array.isArray(content.Products) ? content.Products : []).map(
      (product: any) => ({
        id: product.Id,
        name: product.DisplayLabel,
        versions: (product.versions ?? []).map(
          (version: any) => version.version,
        ),
      }),
    ),

    attachments: buildAttachments(content),

    relatedArticles: Array.isArray(content.RelatedArticles)
      ? content.RelatedArticles
      : [],
  };
}

type ArticleMeta = ReturnType<typeof buildArticleMeta>;

function buildFrontMatter(
  article: ArticleMeta,
  sourceUrl: string,
  fetchedAt: string,
) {
  return [
    '---',
    'status: success',
    `id: ${JSON.stringify(article.id)}`,
    `title: ${JSON.stringify(article.title)}`,
    `type: ${JSON.stringify(article.type)}`,
    `views: ${article.views ?? 0}`,
    `createdAt: ${JSON.stringify(article.createdAt)}`,
    `updatedAt: ${JSON.stringify(article.updatedAt)}`,
    `fetchedAt: ${JSON.stringify(fetchedAt)}`,
    `sourceUrl: ${JSON.stringify(sourceUrl)}`,
    'products:',
    ...article.products.flatMap(
      (product: ArticleMeta['products'][number]) => [
        `  - id: ${JSON.stringify(product.id)}`,
        `    name: ${JSON.stringify(product.name)}`,
        '    versions:',
        ...product.versions.map(
          (version: string) => `      - ${JSON.stringify(version)}`,
        ),
      ],
    ),
    'attachments:',
    ...article.attachments.flatMap(
      (attachment: ArticleMeta['attachments'][number]) => [
        `  - id: ${JSON.stringify(attachment.id)}`,
        `    name: ${JSON.stringify(attachment.name)}`,
        `    contentType: ${JSON.stringify(attachment.contentType)}`,
        `    size: ${attachment.size ?? 'null'}`,
        `    isExternalAttachment: ${attachment.isExternalAttachment ?? false}`,
        `    url: ${JSON.stringify(attachment.url)}`,
      ],
    ),
    '---',
    '',
  ].join('\n');
}

function buildAttachmentsMarkdown(content: any) {
  const attachments = buildAttachments(content);

  if (attachments.length === 0) {
    return '';
  }

  return [
    '',
    '## Attachments',
    '',
    ...attachments.map((attachment: (typeof attachments)[number]) => {
      const name = String(attachment.name ?? 'Unnamed attachment')
        .replace(/\\/g, '\\\\')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\r?\n/g, ' ')
        .trim();

      if (!attachment.url) {
        return `- ${name}`;
      }

      const url = attachment.url.replace(/\s/g, '%20');

      const size =
        attachment.size != null
          ? ` (${(Number(attachment.size) / 1024).toFixed(1)} KB)`
          : '';

      return `- [${name}](<${url}>)${size}`;
    }),
    '',
  ].join('\n');
}

export async function getArticle(req: Request, res: Response) {
  const forceRefresh = req.query.forceRefresh === 'true';

  if (
    req.query.forceRefresh !== undefined &&
    req.query.forceRefresh !== 'true' &&
    req.query.forceRefresh !== 'false'
  ) {
    throw new HttpError(400, 'forceRefresh must be true or false.');
  }

  const { url, content, result, fetchedAt } = await loadArticle(
    req.query.url,
  );

  const article = buildArticleMeta(content, result.title);

  const markdown = [
    buildFrontMatter(article, url, fetchedAt),
    result.markdown,
    buildAttachmentsMarkdown(content),
  ].join('\n');

  let invalidationId: string | undefined;

  if (forceRefresh) {
    // Invalidate the shared normal-response cache after fetching successfully.
    invalidationId = await invalidateArticleCache();

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('X-Article-Fetched-At', fetchedAt);
  } else {
    res.setHeader(
      'Cache-Control',
      'public, max-age=0, s-maxage=31536000',
    );
    res.setHeader('X-Article-Fetched-At', fetchedAt);
  }

  res.vary('Accept');

  const accept = req.get('Accept')?.toLowerCase();

  if (accept?.includes('application/json')) {
    return res.status(200).json({
      status: 'success',
      sourceUrl: url,
      contentType: 'text/markdown',
      article,
      markdown,
      fetchedAt,
      forceRefresh,
      ...(invalidationId ? { invalidationId } : {}),
    });
  }

  if (
    accept &&
    !accept.includes('text/markdown') &&
    !accept.includes('*/*') &&
    !accept.includes('text/*')
  ) {
    throw new HttpError(
      406,
      'Supported formats: text/markdown, application/json.',
    );
  }

  return res
    .status(200)
    .type('text/markdown')
    .send(markdown);
}
