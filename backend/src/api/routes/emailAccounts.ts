import { Router, Request, Response } from 'express';
import EmailAccount from '../../models/EmailAccount';
import { logger } from '../../utils/logger';

const router = Router();

// Get all email accounts
router.get('/', async (req: Request, res: Response) => {
  try {
    const accounts = await EmailAccount.findAll({ where: { userId: req.userId } });
    res.json({ success: true, data: accounts });
  } catch (error) {
    logger.error('Error fetching email accounts:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch accounts' });
  }
});

// Create email account
router.post('/', async (req: Request, res: Response) => {
  try {
    const account = await EmailAccount.create({
      ...req.body,
      userId: req.userId,
    });
    res.status(201).json({ success: true, data: account });
  } catch (error) {
    logger.error('Error creating account:', error);
    res.status(500).json({ success: false, message: 'Failed to create account' });
  }
});

export default router;
