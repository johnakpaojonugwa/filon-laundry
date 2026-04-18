export const adminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
            success: false,
            message: 'Forbidden: Super admin only'
        });
    }
    next();
};
