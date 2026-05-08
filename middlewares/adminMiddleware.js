export const adminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== 'super_admin') {
        return res.status(403).json({
            success: false,
            message: 'Forbidden: Super admin only'
        });
    }
    next();
};
