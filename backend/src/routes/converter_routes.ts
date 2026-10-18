import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getArticle, convertArticle } from '../controlers/converter_controller';

const router = Router();

router.get('/articles', asyncHandler(getArticle));
router.post('/convert', asyncHandler(convertArticle));

export default router;