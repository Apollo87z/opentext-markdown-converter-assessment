import { randomBytes, createHash } from 'node:crypto';
import { Router } from 'express';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';

const router= Router();
router.post('/generate-key', (_req, res) => {
  return res.status(201).json({
    apiKey: 'mdc_live_sogbnSBQCQw8IULWgTPmbZARVgAHj7g_WUlwAxCSpIs',
  });
});
export default router;