import User from "../models/user.model.js";
import jwt from "jsonwebtoken";
import { sendResponse, sendError } from "../utils/response.js";
import { logger } from "../utils/logger.js";
import { isValidEmail, isStrongPassword } from "../utils/validators.js";
import crypto from "crypto";
import redisService from "../services/redisService.js";

// Helper to generate tokens 
const generateTokens = (userOrPayload) => {
    const payload = (userOrPayload && userOrPayload._id) ? {
        id: userOrPayload._id,
        role: userOrPayload.role,
        branchId: userOrPayload.branchId,
        phone_number: userOrPayload.phone_number
    } : (userOrPayload || {});

    const accessToken = jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '1h' }
    );

    const refreshToken = jwt.sign(
        { id: payload.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
    );

    return { accessToken, refreshToken };
};

// Register
export const register = async (req, res, next) => {
    try {
        const { fullname, email, phone_number, password, confirm_password, role, branchId } = req.body || {};

        // Role Guard
        const publicRoles = ['customer']; 
        const assignedRole = publicRoles.includes(role?.toUpperCase()) ? role.toUpperCase() : 'customer';

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            logger.warn(`Registration attempt with existing email: ${email}`);
            return sendError(res, 409, "Email already registered");
        }

        const avatar = req.files?.avatar?.[0]?.path || null;

        // Create user
        const user = await User.create({
            fullname: fullname.trim(),
            email: email.toLowerCase(),
            phone_number: phone_number.trim(),
            password,
            confirm_password,
            role: assignedRole,
            branchId: assignedRole === 'customer' ? null : branchId, 
            avatar
        });

        // welcome SMS/email for customers only
        if (user.role === 'customer') {
            try {
                const { emailService } = await import('../utils/emailService.js');
                const { smsService } = await import('../utils/smsService.js');
                emailService.sendWelcomeEmail(user).catch(err => logger.error('Welcome email error', err.message));
                await smsService.sendWelcomeSMS(user.phone_number, user.fullname).catch(error => {
                    logger.error(`Background SMS delivery failed for ${user.phone_number}:`, error.message);
                });
            } catch (err) {
                logger.error('Failed to load communication services', err.message);
            }
        }

        const { accessToken, refreshToken } = generateTokens(user);

        // Persist hashed refresh token with expiry for rotation/revocation
        try {
            const hashed = crypto.createHash('sha256').update(refreshToken).digest('hex');
            const decoded = jwt.decode(refreshToken);
            const expiresAt = decoded && decoded.exp ? new Date(decoded.exp * 1000) : undefined;
            user.refreshTokens = user.refreshTokens || [];
            user.refreshTokens.push({ token: hashed, expiresAt });
            await user.save();
        } catch (err) {
            logger.error('Failed to persist refresh token for new user', err.message);
        }

        logger.info(`User registered successfully: ${user.email}`);

        return sendResponse(res, 201, true, "User registered successfully", {
            user: {
                _id: user._id,
                fullname: user.fullname,
                phone_number: user.phone_number,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                branchId: user.branchId
            },
            accessToken,
            refreshToken
        });
    } catch (error) {
        logger.error("Registration error:", error.message);
        next(error);
    }
};

// Login
export const login = async (req, res, next) => {
    try {
        const { email, password } = req.body || {};

        // Find user and explicitly select password field
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        if (!user || user.status !== 'active') {
            logger.warn(`Login attempt failed for email: ${email}`);
            return sendError(res, 401, "Invalid credentials");
        }

        // Compare password using model method
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            logger.warn(`Failed password attempt for: ${email}`);
            return sendError(res, 401, "Invalid credentials");
        }


        const { accessToken, refreshToken } = generateTokens(user);

        // Persist refresh token
        try {
            const hashed = crypto.createHash('sha256').update(refreshToken).digest('hex');
            const decoded = jwt.decode(refreshToken);
            const expiresAt = decoded && decoded.exp ? new Date(decoded.exp * 1000) : undefined;
            user.refreshTokens = user.refreshTokens || [];
            user.refreshTokens.push({ token: hashed, expiresAt });
            await user.save();
        } catch (err) {
            logger.error('Failed to persist refresh token on login', err.message);
        }

        // Update last login
        await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

        logger.info(`User logged in successfully: ${user.email}`);

        return sendResponse(res, 200, true, "Login successful", {
            user: {
                _id: user._id,
                fullname: user.fullname,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                branchId: user.branchId,
            },
            accessToken,
            refreshToken
        });
    } catch (error) {
        logger.error("Login error:", error.message);
        next(error);
    }
};

// Refresh Token
export const refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return sendError(res, 400, "Refresh token is required");
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(decoded.id);

        if (!user || user.status !== 'active') {
            return sendError(res, 401, 'Invalid refresh token');
        }

        // Validate that the provided refresh token exists in user's stored tokens
        const hashedProvided = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const stored = (user.refreshTokens || []).find(rt => rt.token === hashedProvided && rt.expiresAt && rt.expiresAt > new Date());
        if (!stored) {
            return sendError(res, 401, 'Refresh token revoked or expired');
        }

        // Rotate: remove the used token and issue a new one
        user.refreshTokens = (user.refreshTokens || []).filter(rt => rt.token !== hashedProvided);

        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
        try {
            const hashed = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
            const decodedNew = jwt.decode(newRefreshToken);
            const expiresAtNew = decodedNew && decodedNew.exp ? new Date(decodedNew.exp * 1000) : undefined;
            user.refreshTokens.push({ token: hashed, expiresAt: expiresAtNew });
            await user.save();
        } catch (err) {
            logger.error('Failed to persist rotated refresh token', err.message);
        }

        return sendResponse(res, 200, true, 'Token refreshed', {
            accessToken,
            refreshToken: newRefreshToken
        });
    } catch (error) {
        logger.error("Token refresh error:", error.message);
        return sendError(res, 401, "Invalid or expired refresh token");
    }
};

// Logout
export const logout = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const providedRefresh = req.body?.refreshToken;
        const accessToken = req.headers.authorization?.split(" ")[1];

        if (!userId) return sendError(res, 400, 'Invalid request');

        const user = await User.findById(userId);
        if (!user) return sendError(res, 400, 'Invalid user');

        // Blacklist the access token if provided
        if (accessToken) {
            const decoded = jwt.decode(accessToken);
            if (decoded && decoded.exp) {
                const ttl = decoded.exp - Math.floor(Date.now() / 1000);
                if (ttl > 0) {
                    await redisService.set(`blacklist:${accessToken}`, 'true', ttl);
                }
            }
        }

        if (providedRefresh) {
            const hashed = crypto.createHash('sha256').update(providedRefresh).digest('hex');
            user.refreshTokens = (user.refreshTokens || []).filter(rt => rt.token !== hashed);
        } else {
            // clear all sessions for the user
            user.refreshTokens = [];
        }

        await user.save();
        logger.info(`User logged out: ${userId}`);
        return sendResponse(res, 200, true, 'Logged out successfully');
    } catch (error) {
        next(error);
    }
};

// Forgot Password
export const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email || !isValidEmail(email)) {
            return sendError(res, 400, "Valid email is required");
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        const successMessage = "If an account exists with that email, a reset link has been sent.";

        if (!user) {
            return sendResponse(res, 200, true, successMessage);
        }

        const resetToken = crypto.randomBytes(32).toString("hex");
        user.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");
        user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

        await user.save({ validateBeforeSave: false });

        try {
            const { emailService } = await import('../utils/emailService.js');
            emailService.sendPasswordResetEmail(user, resetToken)
                .then(() => {
                    logger.info(`Password reset email successfully sent to: ${user.email}`);
                })
                .catch(async (error) => {
                    logger.error(`Background Email delivery failed for ${user.email}:`, error.message);
                    user.passwordResetToken = undefined;
                    user.passwordResetExpires = undefined;
                    await user.save({ validateBeforeSave: false });
                });
        } catch (err) {
            logger.error('Failed to load email service for password reset', err.message);
        }

        return sendResponse(res, 200, true, successMessage);

    } catch (error) {
        logger.error("Forgot password error:", error.message);
        next(error);
    }
};

// Reset Password
export const resetPassword = async (req, res, next) => {
    try {
        const { token } = req.params;
        const { password, confirm_password } = req.body;

        // Strong Validation 
        const errors = [];
        if (!password || !isStrongPassword(password)) {
            errors.push("Password must be at least 8 characters with uppercase, number, and special character");
        }

        if (password !== confirm_password) {
            errors.push("Passwords do not match");
        }

        if (errors.length > 0) {
            return sendError(res, 400, "Validation failed", errors);
        }

        // Validate token format
        if (!token || typeof token !== 'string' || token.length === 0) {
            return sendError(res, 400, "Token is invalid or has expired");
        }

        // Hash the incoming token to compare with what we have in the DB
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

        // Find user with valid token and check if it hasn't expired
        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() }
        });

        if (!user) {
            return sendError(res, 400, "Token is invalid or has expired");
        }

        // Update password and clear reset fields
        user.password = password; 
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;

        await user.save();

        logger.info(`Password reset successful for user: ${user.email}`);

        // log the user in immediately after password reset by generating tokens
        const { accessToken, refreshToken } = generateTokens(user);

        return sendResponse(res, 200, true, "Password reset successful", {
            user: {
                _id: user._id,
                fullname: user.fullname,
                phone_number: user.phone_number,
                email: user.email,
                role: user.role,
                branchId: user.branchId,
            },
            accessToken,
            refreshToken
        });
    } catch (error) {
        next(error);
    }
};

// Change Password (for logged-in users)
export const changePassword = async (req, res, next) => {
    try {
        const { current_password, new_password, confirm_password } = req.body;

        // Validation
        const errors = [];
        if (!current_password) {
            errors.push("Current password is required");
        }
        if (!new_password || !isStrongPassword(new_password)) {
            errors.push("New password must be at least 8 characters with uppercase, number, and special character");
        }
        if (new_password !== confirm_password) {
            errors.push("New passwords do not match");
        }
        if (current_password === new_password) {
            errors.push("New password must be different from current password");
        }

        if (errors.length > 0) {
            return sendError(res, 400, "Validation failed", errors);
        }

        // Find user
        const user = await User.findById(req.user.id).select('+password');
        if (!user) {
            return sendError(res, 404, "User not found");
        }

        // Verify current password
        const isMatch = await user.comparePassword(current_password);
        if (!isMatch) {
            logger.warn(`Failed password change attempt for user: ${user.email}`);
            return sendError(res, 401, "Current password is incorrect");
        }

        // Update password 
        user.password = new_password;
        await user.save();

        logger.info(`Password changed successfully for user: ${user.email}`);

        return sendResponse(res, 200, true, "Password changed successfully");
    } catch (error) {
        logger.error("Change password error:", error.message);
        next(error);
    }
};