import { Router, Request, Response } from 'express';
import Campaign from '../../models/Campaign';
import { logger } from '../../utils/logger';

const router = Router();

// Get all campaigns
router.get('/', async (req: Request, res: Response) => {
  try {
    const campaigns = await Campaign.findAll({ where: { userId: req.userId } });
    res.json({ success: true, data: campaigns });
  } catch (error) {
    logger.error('Error fetching campaigns:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch campaigns' });
  }
});

// Create campaign
router.post('/', async (req: Request, res: Response) => {
  try {
    const campaign = await Campaign.create({
      ...req.body,
      userId: req.userId,
    });
    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    logger.error('Error creating campaign:', error);
    res.status(500).json({ success: false, message: 'Failed to create campaign' });
  }
});

// Get campaign by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const campaign = await Campaign.findOne({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    res.json({ success: true, data: campaign });
  } catch (error) {
    logger.error('Error fetching campaign:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch campaign' });
  }
});

// Update campaign
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const campaign = await Campaign.findOne({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    await campaign.update(req.body);
    res.json({ success: true, data: campaign });
  } catch (error) {
    logger.error('Error updating campaign:', error);
    res.status(500).json({ success: false, message: 'Failed to update campaign' });
  }
});

export default router;
