// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger } from './logger';

describe('Logger utility', () => {
  beforeEach(() => {
    Logger.clearLogs();
  });

  it('buffers and retrieves log entries accurately', () => {
    Logger.log('Test log message', { detail: '123' });
    const logs = Logger.getLogs();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const lastLog = logs[logs.length - 1];
    expect(lastLog.message).toBe('Test log message');
    expect(lastLog.level).toBe('info');
    expect(lastLog.data).toEqual({ detail: '123' });
  });

  it('clears logs properly', () => {
    Logger.warn('Warning test');
    expect(Logger.getLogs().length).toBeGreaterThanOrEqual(1);
    Logger.clearLogs();
    expect(Logger.getLogs().length).toBe(0);
  });
});
