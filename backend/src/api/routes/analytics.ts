import { Router, Request, Response } from 'express';
import Campaign from '../../models/Campaign';
import Recipient from '../../models/Recipient';
import { logger } from '../../utils/logger';

const router = Router();

// Get campaign analytics
router.get('/campaign/:campaignId', async (req: Request, res: Response) => {
  try {
    const campaign = await Campaign.findOne({
      where: { id: req.params.campaignId, userId: req.userId },
    });

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    const recipients = await Recipient.findAll({ where: { campaignId: req.params.campaignId } });

    const analytics = {
      totalRecipients: recipients.length,
      sent: recipients.filter((r) => r.status !== 'pending').length,
      opened: recipients.filter((r) => r.openedAt).length,
      clicked: recipients.filter((r) => r.clickedAt).length,
      bounced: recipients.filter((r) => r.status === 'bounced').length,
      openRate: 0,
      clickRate: 0,
    };

    analytics.openRate = analytics.totalRecipients > 0 ? (analytics.opened / analytics.totalRecipients) * 100 : 0;
    analytics.clickRate = analytics.totalRecipients > 0 ? (analytics.clicked / analytics.totalRecipients) * 100 : 0;

    res.json({ success: true, data: analytics });
  } catch (error) {
    logger.error('Error fetching analytics:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
  }
});

export default router;
