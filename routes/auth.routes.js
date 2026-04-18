import express from 'express';
import rateLimit from 'express-rate-limit';
import { login, register, refreshToken, logout, forgotPassword, resetPassword, changePassword } from '../controllers/auth.controller.js';
import uploadMiddleware from '../utils/upload.js';
import { validateRegister, validateLogin, handleValidationErrors } from '../middlewares/validationMiddleware.js';
import { auth } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

// Stricter rate limiting for sensitive token refresh endpoint
const refreshTokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3, 
    message: 'Too many token refresh attempts. Please try again later.',
    skipSuccessfulRequests: false // Count all requests, not just failures
});

router.post('/sign-up', validateRegister, handleValidationErrors, uploadMiddleware, asyncHandler(register));
router.post('/login', validateLogin, handleValidationErrors, asyncHandler(login));
router.post('/refresh-token', refreshTokenLimiter, asyncHandler(refreshToken));
router.post('/logout', auth, asyncHandler(logout));
router.post('/forgot-password', asyncHandler(forgotPassword));
router.patch('/reset-password/:token', asyncHandler(resetPassword));
router.patch('/change-password', auth, asyncHandler(changePassword));
export default router;  