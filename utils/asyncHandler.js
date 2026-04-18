// asyncHandler for routes 
export const asyncHandler = (fn) => {
    return async (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch((error) => {
            error.requestId = req.id;
            error.userId = req.user?.id;
            error.endpoint = `${req.method} ${req.path}`;
            next(error);
        });
    };
};

// Wrapper for mongoose transactions in route handlers
export const withTransaction = (fn) => {
    return asyncHandler(async (req, res, next) => {
        const mongoose = await import('mongoose').then(module => module.default)
        const session = await mongoose.startSession();
        req.session = session;

        try {
            session.startTransaction();
            await fn(req, res, next);
            await session.commitTransaction();
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            await session.endSession();
        }
    });
};