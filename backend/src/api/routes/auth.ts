import { Router, Request, Response } from 'express';
import User from '../../models/User';
import { generateToken } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const router = Router();

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, country } = req.body;

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      country,
    });

    const token = generateToken(user.id);
    logger.info(`User registered: ${email}`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      token,
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const validPassword = await user.validPassword(password);
    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = generateToken(user.id);
    logger.info(`User logged in: ${email}`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      token,
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

export default router;
