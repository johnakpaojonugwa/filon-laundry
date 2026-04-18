import multer from 'multer';
import dotenv from 'dotenv';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { v2 as cloudinary } from 'cloudinary';
import { logger } from './logger.js';

dotenv.config();

// cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_API_SECRET,
    timeout: 60000
})

// cloudinary storage config
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        const folder = file.fieldname === 'avatar'
            ? 'laundry-avatar'
            : (file.fieldname === 'images' || file.fieldname === 'backCover')
                ? 'laundry'
                : 'default';

        const isVideo = file.mimetype.startsWith('video/');
        const allowedFormats = isVideo
            ? ['mp4', 'mov', 'avi']
            : ['jpg', 'jpeg', 'png', 'gif', 'webp'];

        return {
            folder: folder,
            allowed_formats: allowedFormats,
            resource_type: isVideo ? 'video' : 'image'
        };
    }
});

// multer config
const upload = multer({
    storage,
    limits: { fileSize: 1024 * 1024 * 5 },
    fileFilter(req, file, cb) {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/mov', 'video/avi']

        if (!allowedTypes.includes(file.mimetype)) {
            const error = new Error('invalid file type')
            error.code = 'LIMITED_FILE_TYPE';
            return cb(error)
        }
        cb(null, true);
    },

}).fields([
    { name: 'avatar' },
    { name: 'backCover' },
    { name: 'images', maxCount: 10 },
])

// Middleware to handle file upload
const uploadMiddleware = (req, res, next) => {
    upload(req, res, (err) => {
        if (err) {
            logger.error("Upload Error Details:", err);

            if (err instanceof multer.MulterError) {
                return res.status(400).json({ 
                    success: false,
                    message: "File upload error", 
                    error: err.message 
                });
            }
            
            return res.status(400).json({ 
                success: false,
                message: "File upload error", 
                error: err.message || 'Unknown error' 
            });
        }

        next();
    });
};
export default uploadMiddleware;