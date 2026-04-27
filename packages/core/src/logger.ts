import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.ops.logLevel,
  transport: env.ops.nodeEnv === 'development'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,
});

export type Logger = typeof logger;
