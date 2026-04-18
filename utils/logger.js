import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '../logs');

// Create logs directory if it doesn't exist
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

const getTimestamp = () => new Date().toISOString();

const logToFile = (level, message, data = null) => {
    const fileName = path.join(logsDir, `${level.toLowerCase()}-${new Date().toISOString().split('T')[0]}.log`);
    const logEntry = `[${getTimestamp()}] [${level}] ${message} ${data ? JSON.stringify(data) : ''}`;

    try {
        fs.appendFileSync(fileName, logEntry + '\n');
    } catch (err) {
        console.error('CRITICAL: Failed to write to log file:', err);
    }
};

export const logger = {
    info: (message, data = null) => {
        console.log(`ℹ️ [INFO] ${message}`, data || '');
        logToFile('INFO', message, data);
    },
    warn: (message, data = null) => {
        console.warn(`⚠️ [WARN] ${message}`, data || '');
        logToFile('WARN', message, data);
    },
    error: (message, data = null) => {
        console.error(`❌ [ERROR] ${message}`, data || '');
        logToFile('ERROR', message, data);
    },
    debug: (message, data = null) => {
        if (process.env.NODE_ENV === 'development') {
            console.debug(`🐞 [DEBUG] ${message}`, data || '');
            logToFile('DEBUG', message, data);
        }
    }
}