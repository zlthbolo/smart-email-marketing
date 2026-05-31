import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      token?: string;
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid token' });
    }
    req.userId = user.id;
    req.token = token;
    next();
  });
};

export const generateToken = (userId: string): string => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'secret', {
    expiresIn: process.env.JWT_EXPIRE || '24h',
  });
};
