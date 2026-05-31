import { Router, Request, Response } from 'express';
import Proxy from '../../models/Proxy';
import { logger } from '../../utils/logger';

const router = Router();

// Get all proxies
router.get('/', async (req: Request, res: Response) => {
  try {
    const proxies = await Proxy.findAll({ where: { userId: req.userId } });
    res.json({ success: true, data: proxies });
  } catch (error) {
    logger.error('Error fetching proxies:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch proxies' });
  }
});

// Create proxy
router.post('/', async (req: Request, res: Response) => {
  try {
    const proxy = await Proxy.create({
      ...req.body,
      userId: req.userId,
    });
    res.status(201).json({ success: true, data: proxy });
  } catch (error) {
    logger.error('Error creating proxy:', error);
    res.status(500).json({ success: false, message: 'Failed to create proxy' });
  }
});

export default router;
