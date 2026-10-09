import { Capacitor } from '@capacitor/core';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: any;
}

const LOGS_KEY = 'flusso_debug_logs';
const MAX_LOGS = 1000;

let memoryLogs: LogEntry[] | null = null;
let flushTimeout: any = null;

function getMemoryLogs(): LogEntry[] {
  if (memoryLogs === null) {
    try {
      const stored = localStorage.getItem(LOGS_KEY);
      memoryLogs = stored ? JSON.parse(stored) : [];
    } catch {
      memoryLogs = [];
    }
  }
  return memoryLogs ?? [];
}

function scheduleFlush() {
  if (flushTimeout !== null) return;
  flushTimeout = setTimeout(() => {
    flushTimeout = null;
    if (memoryLogs) {
      try {
        localStorage.setItem(LOGS_KEY, JSON.stringify(memoryLogs));
      } catch (e) {
        console.error('Failed to save log to localStorage', e);
      }
    }
  }, 1000);
}

export const Logger = {
  log: (message: string, data?: any) => Logger.append('info', message, data),
  warn: (message: string, data?: any) => Logger.append('warn', message, data),
  error: (message: string, data?: any) => Logger.append('error', message, data),

  append: (level: 'info' | 'warn' | 'error', message: string, data?: any) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data: data instanceof Error ? { message: data.message, stack: data.stack } : data
    };

    // Console output for normal debugging
    if (level === 'error') console.error(`[LOGGER] ${message}`, data || '');
    else if (level === 'warn') console.warn(`[LOGGER] ${message}`, data || '');
    else console.log(`[LOGGER] ${message}`, data || '');

    // Buffered memory storage with debounced write
    try {
      const logs = getMemoryLogs();
      logs.push(entry);
      
      // Prune
      if (logs.length > MAX_LOGS) {
        logs.splice(0, logs.length - MAX_LOGS);
      }
      
      scheduleFlush();
    } catch (e) {
      console.error('Failed to buffer log', e);
    }
  },

  getLogs: (): LogEntry[] => {
    return [...getMemoryLogs()];
  },

  clearLogs: () => {
    memoryLogs = [];
    if (flushTimeout !== null) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }
    try {
      localStorage.removeItem(LOGS_KEY);
    } catch {}
  }
};

// Setup global listeners after Logger is defined
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event: any) => {
    // Filter out benign ResizeObserver loop notifications per W3C specification
    const msg = (typeof event === 'string' ? event : (event?.message || event?.error?.message || '')).toLowerCase();
    if (
      msg.includes('resizeobserver') ||
      msg.includes('resize observer')
    ) {
      if (event && typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      return;
    }

    Logger.error('Global Unhandled Error', {
      message: event?.message,
      filename: event?.filename,
      lineno: event?.lineno,
      colno: event?.colno,
      error: event?.error
    });
  });

  window.addEventListener('unhandledrejection', (event: any) => {
    const reasonMsg = (event?.reason?.message || String(event?.reason || '')).toLowerCase();
    if (
      reasonMsg.includes('resizeobserver') ||
      reasonMsg.includes('resize observer')
    ) {
      if (event && typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      return;
    }
    Logger.error('Global Unhandled Rejection', {
      reason: event?.reason
    });
  });

  Logger.log('Global error listeners established');
}
