
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import healthRoutes from './routes/health_routes';
import convertRoutes from './routes/converter_routes';
import securityRoutes from './routes/security_routes';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';

import { config } from './config';



const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.corsOrigins, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'x-api-key'] }));
app.use(express.json({ limit: '1mb' }));


app.use('/api/v1', healthRoutes);
app.use('/api/v1', convertRoutes);
app.use('/api/v1', securityRoutes);


app.use(notFoundHandler);
app.use(errorHandler);

export default app;
