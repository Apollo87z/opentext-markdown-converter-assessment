import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const safeEqual = (a: string, b: string) => {
    const A = Buffer.from(a), B = Buffer.from(b);
    return A.length === B.length && crypto.timingSafeEqual(A, B);
};

export const originGuard = (req: Request, res: Response, next: NextFunction) => {
    const want = process.env.ORIGIN_SECRET;
    const got = req.header('x-origin-verify') ?? '';
    if (!want || !safeEqual(got, want)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
};
