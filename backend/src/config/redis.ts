import redis from 'redis';
import { logger } from '../utils/logger';

let redisClient: redis.RedisClient;

export async function createRedisClient() {
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    redisClient.on('error', (err) => logger.error('Redis error:', err));
    redisClient.on('connect', () => logger.info('Redis connected'));

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.error('Failed to create Redis client:', error);
    throw error;
  }
}

export function getRedisClient() {
  return redisClient;
}
