
type LogType = 'log' | 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  type: LogType;
  message: string;
  timestamp: number;
  args: any[];
}

class ConsoleInterceptor {
  private logs: LogEntry[] = [];
  private listeners: Set<(log: LogEntry) => void> = new Set();
  private maxLogs = 1000;
  private originalConsole: Partial<Console> = {};

  constructor() {
    if (typeof window === 'undefined') return;

    const types: LogType[] = ['log', 'info', 'warn', 'error', 'debug'];
    
    types.forEach(type => {
      this.originalConsole[type] = console[type];
      
      console[type] = (...args: any[]) => {
        // Call original
        if (this.originalConsole[type]) {
          this.originalConsole[type]!(...args);
        }

        // Intercept
        const message = args.map(arg => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch (e) {
              return String(arg);
            }
          }
          return String(arg);
        }).join(' ');

        const lowerMsg = message.toLowerCase();
        // Skip ResizeObserver loop notifications as per W3C specification
        if (
          lowerMsg.includes('resizeobserver loop completed with undelivered notifications') ||
          lowerMsg.includes('resizeobserver loop limit exceeded')
        ) {
          return;
        }

        // Skip Capacitor integration messages that are unimplemented on Web to keep logs clean
        if (
          lowerMsg.includes('unimplemented') ||
          lowerMsg.includes('not implemented on') ||
          (lowerMsg.includes('plugin') && lowerMsg.includes('not available on this platform'))
        ) {
          return;
        }

        const entry: LogEntry = {
          type,
          message,
          timestamp: Date.now(),
          args
        };

        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) {
          this.logs.shift();
        }

        this.listeners.forEach(listener => listener(entry));
      };
    });
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
    this.listeners.forEach(listener => listener({ type: 'info', message: 'Logs cleared', timestamp: Date.now(), args: [] }));
  }

  subscribe(listener: (log: LogEntry) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const consoleInterceptor = new ConsoleInterceptor();
export type { LogEntry, LogType };
