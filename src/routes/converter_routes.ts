import { Router } from 'express';
import { conversionEngine } from '../services/markdown_converter.service';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';

const router = Router();

router.post('/convert', asyncHandler(async (req, res) => {
    const { url } = req.body ?? {};
    if (!url) throw new HttpError(400, 'The "url" field is required.');

    const articleId = url.match(/\/article\/([0-9]+)/)?.[1];
    if (!articleId) throw new HttpError(400, 'Invalid article URL.');

    const response = await fetch(`https://my.opentext.com/api/web/support/article/${articleId}`);
    if (!response.ok) throw new HttpError(502, 'Upstream error.');

    const content = (await response.json())?.response;
    if (!content?.Content) throw new HttpError(502, 'No content found.');

    const result = conversionEngine(
        content.Content,
        url,
        content.Title ?? `Article ${articleId}`,
    );

    return res.json({
        sourceUrl: url,
        contentType: 'text/markdown',
        title: result.title,
        markdown: result.markdown,
    });
}));

export default router;
