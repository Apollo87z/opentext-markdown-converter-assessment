import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getArticle } from '../controlers/converter_controller.js';

const router = Router();

router.get('/articles', asyncHandler(getArticle));

export default router;