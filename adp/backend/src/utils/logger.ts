import dotenv from 'dotenv';
import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Resolve .env from the project root regardless of whether PM2 starts from
// the project root, backend/, or backend/dist/.
const ROOT_ENV = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: ROOT_ENV, override: false });

const LOG_DIR = process.env.LOG_DIR || path.resolve(__dirname, '../../../logs');
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (err) {
  // Console logging remains available if the configured log directory is not writable.
  console.error(`[ADP logger] Cannot create log directory ${LOG_DIR}:`, err);
}

const redactSecrets = winston.format((info) => {
  // Avoid JSON stringify/parse on Error or circular values; redact string fields only.
  const sensitive = /password|token|secret|authorization|cookie/i;
  for (const key of Object.keys(info)) {
    if (sensitive.test(key)) info[key] = '[REDACTED]';
    else if (typeof info[key] === 'string') {
      info[key] = info[key]
        .replace(/(password|token|secret|authorization)\s*[:=]\s*[^\s,;]+/ig, '$1=[REDACTED]');
    }
  }
  return info;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  exitOnError: false,
  format: winston.format.combine(
    redactSecrets(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    ...(fs.existsSync(LOG_DIR) ? [
      new winston.transports.File({ filename: path.join(LOG_DIR, 'error.log'), level: 'error' }),
      new winston.transports.File({ filename: path.join(LOG_DIR, 'combined.log') }),
    ] : []),
  ],
});
