/**
 * Structured JSON logger for Lambda services.
 * Outputs to stdout/stderr which CloudWatch Logs captures automatically.
 * Cost-effective: no extra infra needed — Lambda → CloudWatch Logs is included.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  requestId?: string;
  userId?: string;
  action?: string;
  duration?: number;
  error?: string;
  stack?: string;
  meta?: Record<string, unknown>;
}

let _service = 'unknown';
let _requestId: string | undefined;

export function initLogger(service: string, requestId?: string): void {
  _service = service;
  _requestId = requestId;
}

function emit(level: LogLevel, message: string, extra?: Partial<LogEntry>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: _service,
    message,
    requestId: _requestId,
    ...extra,
  };
  const line = JSON.stringify(entry);
  if (level === 'ERROR') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('DEBUG', msg, { meta }),
  info: (msg: string, meta?: Record<string, unknown>) => emit('INFO', msg, { meta }),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('WARN', msg, { meta }),
  error: (msg: string, err?: unknown, meta?: Record<string, unknown>) => {
    const extra: Partial<LogEntry> = { meta };
    if (err instanceof Error) {
      extra.error = err.message;
      extra.stack = err.stack;
    } else if (err) {
      extra.error = String(err);
    }
    emit('ERROR', msg, extra);
  },
  /** Log an auth event (sign-in, sign-out, failed attempt) */
  auth: (action: string, userId?: string, meta?: Record<string, unknown>) =>
    emit('INFO', `auth:${action}`, { action, userId, meta }),
  /** Log an API request with timing */
  request: (method: string, path: string, statusCode: number, duration: number, userId?: string) =>
    emit('INFO', `${method} ${path} ${statusCode}`, { action: 'api_request', userId, duration, meta: { method, path, statusCode } }),
};
