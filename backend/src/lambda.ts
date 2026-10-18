import express from 'express';
import serverlessExpress from '@codegenie/serverless-express';
import app from './app';
import { originGuard } from './middleware/originGuard';

const guarded = express();
guarded.disable('x-powered-by');
guarded.use(originGuard);
guarded.use(app);

export const handler = serverlessExpress({ app: guarded });
