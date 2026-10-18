import { Router } from 'express';
import { conversionEngine } from '../services/markdown_converter.service.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';

const router = Router();

const ARTICLE_API = 'https://my.opentext.com/api/web/support/article';

/**
 * Validates the URL, fetches the article, and converts it to markdown.
 * Shared by every route that needs article data.
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
  };
}

type ArticleMeta = ReturnType<typeof buildArticleMeta>;

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
    ...article.products.flatMap((product: ArticleMeta['products'][number]) => [
      `  - id: ${JSON.stringify(product.id)}`,
      `    name: ${JSON.stringify(product.name)}`,
      '    versions:',
      ...product.versions.map(
        (version: string) => `      - ${JSON.stringify(version)}`,
      ),
    ]),
    '---',
    '',
  ].join('\n');
}

router.get('/articles', asyncHandler(async (req, res) => {
  const { result } = await loadArticle(req.query.url);

  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=31536000');

  return res.status(200).type('text/markdown').send(result.markdown);
}));

router.post('/convert', asyncHandler(async (req, res) => {
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
      markdown: result.markdown,
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

  return res
    .status(200)
    .type('text/markdown')
    .send(`${frontMatter}\n${result.markdown}`);
}));

export default router;