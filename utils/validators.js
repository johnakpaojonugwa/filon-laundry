// Email validation regex
export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Phone validation regex
export const phoneRegex = /^\+?[0-9]{7,15}$/;

// Validate email format
export const isValidEmail = (email) => emailRegex.test(email);

// Validate password strength (minimum 8 chars, at least one uppercase, one number, one special char)
export const isStrongPassword = (password) => {
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return strongPasswordRegex.test(password);
};

// Validate phone number
export const isValidPhone = (phone) => phoneRegex.test(phone);

// Comprehensive input sanitization
export const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    // Remove leading/trailing whitespace, limit to 200 chars, escape special chars
    return input
        .trim()
        .slice(0, 200)
        .replace(/[<>]/g, '') // Remove potential HTML/script tags
        .replace(/[^a-zA-Z0-9\s\-._@()]/g, ''); // Allow common safe chars
};

// Sanitize for safe regex search (prevent ReDoS)
export const sanitizeForRegex = (input) => {
    if (typeof input !== 'string') return '';
    return input.trim().slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Validate MongoDB ObjectId
export const isValidObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

// Sanitize object to allow only specific fields (prevent mass-assignment)
export const sanitizeObject = (obj, allowedFields) => {
    const sanitized = {};
    for (const field of allowedFields) {
        if (field in obj) {
            const value = obj[field];
            sanitized[field] = typeof value === 'string' ? sanitizeInput(value) : value;
        }
    }
    return sanitized;
};
