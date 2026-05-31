import { Sequelize } from 'sequelize';
import { logger } from '../utils/logger';

const sequelize = new Sequelize({
  database: process.env.DB_NAME || 'smart_email_marketing',
  username: process.env.DB_USER || 'smart_email',
  password: process.env.DB_PASSWORD || 'secure_password_123',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 2,
    acquire: 30000,
    idle: 10000,
  },
});

export async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    logger.info('Database connection established successfully');
  } catch (error) {
    logger.error('Unable to connect to database:', error);
    throw error;
  }
}

export default sequelize;
