import { Router, Request, Response } from 'express';
import University from '../../models/University';
import { logger } from '../../utils/logger';

const router = Router();

// Get all universities
router.get('/', async (req: Request, res: Response) => {
  try {
    const universities = await University.findAll();
    res.json({ success: true, data: universities });
  } catch (error) {
    logger.error('Error fetching universities:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch universities' });
  }
});

export default router;
