
import { Router } from 'express';
import { conversionEngine } from '../services/markdown_converter.service.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';

const router = Router();

router.post(
  '/convert',
  asyncHandler(async (req, res) => {
    const { url } = req.body ?? {};

    if (typeof url !== 'string' || !url.trim()) {
      throw new HttpError(400, 'The "url" field is required.');
    }

    const articleId = url.match(/\/article\/([0-9]+)/)?.[1];

    if (!articleId) {
      throw new HttpError(400, 'Invalid article URL.');
    }

    let response: Response;

    try {
      response = await fetch(
        `https://my.opentext.com/api/web/support/article/${articleId}`,
      );
    } catch {
      throw new HttpError(502, 'Failed to load article.');
    }

    if (!response.ok) {
      throw new HttpError(502, 'Failed to load article.');
    }

    let data: any;

    try {
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

    const article = {
      id: content.Id,
      title: result.title,
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

    const status = 'success';

    res.vary('Accept');

    const accept = req.get('Accept');

    // Return JSON only when explicitly requested.
    if (accept?.includes('application/json')) {
      return res.status(200).json({
        status,
        sourceUrl: url,
        contentType: 'text/markdown',
        article,
        markdown: result.markdown,
      });
    }

    // Reject explicitly unsupported response formats.
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

    // Markdown is the default response format.
    const frontMatter = [
      '---',
      `status: ${status}`,
      `id: ${JSON.stringify(article.id)}`,
      `title: ${JSON.stringify(article.title)}`,
      `type: ${JSON.stringify(article.type)}`,
      `views: ${article.views ?? 0}`,
      `createdAt: ${JSON.stringify(article.createdAt)}`,
      `updatedAt: ${JSON.stringify(article.updatedAt)}`,
      `sourceUrl: ${JSON.stringify(url)}`,
      'products:',
      ...article.products.flatMap((product: {
        id: string;
        name: string;
        versions: string[];
      }) => [
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

    return res
      .status(200)
      .type('text/markdown')
      .send(`${frontMatter}\n${result.markdown}`);
  }),
);

export default router;
