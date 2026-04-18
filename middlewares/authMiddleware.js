import jwt from 'jsonwebtoken';
import redisService from '../services/redisService.js';
import { logger } from '../utils/logger.js';

// Middleware to authenticate user using JWT
export const auth = async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access token required'
        });
    }

    try {
        // Check if token is blacklisted
        const isBlacklisted = await redisService.get(`blacklist:${token}`);
        if (isBlacklisted) {
            return res.status(401).json({
                success: false,
                message: 'Token has been revoked'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check if token has expired (additional check)
        if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
            return res.status(401).json({
                success: false,
                message: 'Token has expired'
            });
        }

        req.user = {
            id: decoded.id,
            role: decoded.role,
            branchId: decoded.branchId,
            email: decoded.email // Add more if needed
        };
        next();
    } catch (error) {
        logger.warn('Authentication failed', {
            token: token ? 'present' : 'missing',
            ip: req.ip,
            path: req.path,
            error: error.message
        });
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token has expired, please refresh or login again'
            });
        }
        return res.status(401).json({
            success: false,
            message: 'Invalid token',
            error: error.message
        });
    }
};

// Middleware to authorize user based on role
export const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            logger.warn('Authorization attempted without authentication', {
                ip: req.ip,
                path: req.path
            });
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        if (!allowedRoles.includes(req.user.role)) {
            logger.warn('Unauthorized access attempt', {
                userId: req.user.id,
                userRole: req.user.role,
                requiredRoles: allowedRoles,
                ip: req.ip,
                path: req.path
            });
            return res.status(403).json({
                success: false,
                message: `Access denied. Required roles: ${allowedRoles.join(", ")}`
            });
        }
        next();
    };
};;