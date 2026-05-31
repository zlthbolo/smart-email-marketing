import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'express-cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { initializeDatabase } from './config/database';
import { createRedisClient } from './config/redis';
import { logger } from './utils/logger';
import authRoutes from './api/routes/auth';
import campaignRoutes from './api/routes/campaigns';
import emailAccountRoutes from './api/routes/emailAccounts';
import proxyRoutes from './api/routes/proxies';
import analyticsRoutes from './api/routes/analytics';
import trackingRoutes from './api/routes/tracking';
import universitiesRoutes from './api/routes/universities';
import { authenticateToken } from './middleware/auth';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Public Routes
app.use('/api/auth', authRoutes);
app.use('/api/tracking', trackingRoutes);

// Protected Routes
app.use('/api/campaigns', authenticateToken, campaignRoutes);
app.use('/api/email-accounts', authenticateToken, emailAccountRoutes);
app.use('/api/proxies', authenticateToken, proxyRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);
app.use('/api/universities', authenticateToken, universitiesRoutes);

// Initialize
async function startServer() {
  try {
    // Initialize Database
    await initializeDatabase();
    logger.info('✅ Database connected');

    // Initialize Redis
    await createRedisClient();
    logger.info('✅ Redis connected');

    // Start Server
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📍 Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
