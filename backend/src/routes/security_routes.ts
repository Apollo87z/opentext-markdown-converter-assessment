
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { generateApiKey } from '../controlers/security_controller';

const router = Router();

router.post('/generate-key', asyncHandler(generateApiKey));

export default router;
