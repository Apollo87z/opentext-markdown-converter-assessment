import express from 'express';
import healthRoutes from './routes/health_routes';
import convertRoutes from './routes/converter_routes';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';

const app = express();

app.use(express.json());

app.use('/api/v1', healthRoutes);
app.use('/api/v1',convertRoutes);

app.use(notFoundHandler);
app.use(errorHandler); 

export default app;