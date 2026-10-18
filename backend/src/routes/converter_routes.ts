
import { Router } from 'express';
import { conversionEngine } from '../services/markdown_converter.service.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';

const router = Router();

const ARTICLE_API = 'https://my.opentext.com/api/web/support/article';
const OPENTEXT_BASE_URL = 'https://my.opentext.com';

/**
 * Fetches an OpenText article and converts its HTML content to Markdown.
 */
async function loadArticle(url: unknown) {
  if (typeof url !== 'string' || !url.trim()) {
    throw new HttpError(400, 'The "url" field is required.');
  }

  const articleId = url.match(/\/article\/([0-9]+)/)?.[1];

  if (!articleId) {
    throw new HttpError(400, 'Invalid article URL.');
  }

  let data: any;

  try {
    const response = await fetch(`${ARTICLE_API}/${articleId}`);

    if (!response.ok) {
      throw new Error(`Upstream responded with ${response.status}`);
    }

    data = await response.json();
  } catch {
    throw new HttpError(502, 'Failed to load article.');
  }

  const content = data?.response;

  if (!content?.Content) {
    throw new HttpError(502, 'Failed to load article.');
  }

  const result = conversionEngine(
    content.Content,
    url,
    content.Title ?? `Article ${articleId}`,
  );

  return { url, articleId, content, result };
}

/**
 * Converts upstream attachment URLs into absolute URLs.
 */
function buildAttachments(content: any) {
  return (content.Attachments ?? []).map((attachment: any) => ({
    id: attachment.id,
    name: attachment.name,
    contentType: attachment.contentType,
    size: attachment.size,
    isExternalAttachment: attachment.isExternalAttachment,
    url: attachment.url
      ? new URL(attachment.url, OPENTEXT_BASE_URL).toString()
      : attachment.fileUrl ?? null,
  }));
}

/**
 * Builds structured metadata for JSON responses.
 */
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

    products: (content.Products ?? []).map((product: any) => ({
      id: product.Id,
      name: product.DisplayLabel,
      versions: (product.versions ?? []).map(
        (version: any) => version.version,
      ),
    })),

    attachments: buildAttachments(content),

    relatedArticles: (content.RelatedArticles ?? []).map(
      (article: any) => article,
    ),
  };
}

type ArticleMeta = ReturnType<typeof buildArticleMeta>;

/**
 * Builds YAML front matter for the Markdown response.
 */
function buildFrontMatter(
  article: ArticleMeta,
  sourceUrl: string,
  status = 'success',
) {
  return [
    '---',
    `status: ${status}`,
    `id: ${JSON.stringify(article.id)}`,
    `title: ${JSON.stringify(article.title)}`,
    `type: ${JSON.stringify(article.type)}`,
    `views: ${article.views ?? 0}`,
    `createdAt: ${JSON.stringify(article.createdAt)}`,
    `updatedAt: ${JSON.stringify(article.updatedAt)}`,
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

/**
 * Adds clickable attachment links to the Markdown document.
 */
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

/**
 * GET /articles?url=<article URL>
 * Returns the converted Markdown document.
 */
router.get(
  '/articles',
  asyncHandler(async (req, res) => {
    const { result, content } = await loadArticle(req.query.url);

    const attachmentsMarkdown = buildAttachmentsMarkdown(content);

    res.setHeader(
      'Cache-Control',
      'public, max-age=0, s-maxage=31536000',
    );

    return res
      .status(200)
      .type('text/markdown')
      .send(`${result.markdown}\n${attachmentsMarkdown}`);
  }),
);

/**
 * POST /convert
 * Returns JSON when Accept is application/json;
 * otherwise returns Markdown with front matter and attachment links.
 */
router.post(
  '/convert',
  asyncHandler(async (req, res) => {
    const { url, content, result } = await loadArticle(req.body?.url);

    const article = buildArticleMeta(content, result.title);
    const status = 'success';

    res.vary('Accept');

    const accept = req.get('Accept');

    if (accept?.includes('application/json')) {
      return res.status(200).json({
        status,
        sourceUrl: url,
        contentType: 'text/markdown',
        article,
        markdown: [
          buildFrontMatter(article, url, status),
          result.markdown,
          buildAttachmentsMarkdown(content),
        ].join('\n'),
      });
    }

    if (
      accept &&
      !accept.includes('text/markdown') &&
      !accept.includes('*/*')
    ) {
      throw new HttpError(
        406,
        'Supported formats: text/markdown, application/json.',
      );
    }

    const frontMatter = buildFrontMatter(article, url, status);
    const attachmentsMarkdown = buildAttachmentsMarkdown(content);

    return res
      .status(200)
      .type('text/markdown')
      .send(
        `${frontMatter}\n${result.markdown}\n${attachmentsMarkdown}`,
      );
  }),
);

export default router;
