// Standardized response handler
export const sendResponse = (res, status, success, message, data = null) => {
    const response = {
        success, 
        message,
        ...(data && { data })
    };
    return res.status(status).json(response);
};

// Error response handler
export const sendError = (res, status, message, errors = null) => {
    const response = {
        success: false,
        message,
        ...(errors && { errors })
    };
    return res.status(status).json(response);
};