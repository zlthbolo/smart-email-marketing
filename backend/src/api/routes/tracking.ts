import { Router, Request, Response } from 'express';
import Recipient from '../../models/Recipient';
import { logger } from '../../utils/logger';

const router = Router();

// Track pixel (email open)
router.get('/pixel/:trackingToken', async (req: Request, res: Response) => {
  try {
    const recipient = await Recipient.findOne({ where: { trackingToken: req.params.trackingToken } });
    if (recipient && !recipient.openedAt) {
      await recipient.update({ openedAt: new Date(), status: 'opened' });
      logger.info(`Email opened: ${recipient.email}`);
    }

    // Return 1x1 transparent pixel
    const pixel = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
      0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
      0x01, 0x00, 0x3b,
    ]);

    res.type('image/gif').send(pixel);
  } catch (error) {
    logger.error('Tracking error:', error);
    res.status(500).send('Error');
  }
});

// Track link click
router.get('/link/:trackingToken/:linkId', async (req: Request, res: Response) => {
  try {
    const recipient = await Recipient.findOne({ where: { trackingToken: req.params.trackingToken } });
    if (recipient && !recipient.clickedAt) {
      await recipient.update({ clickedAt: new Date(), status: 'clicked' });
      logger.info(`Link clicked: ${recipient.email}`);
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Link tracking error:', error);
    res.status(500).json({ success: false });
  }
});

export default router;
