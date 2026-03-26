export interface CapturedError {
  type: 'runtime' | 'unhandled_rejection' | 'console_error';
  message: string;
  stack?: string;
  timestamp: number;
}

export interface ErrorInterceptor {
  getAndClear(): CapturedError[];
  peek(): CapturedError[];
  destroy(): void;
}

const MAX_ERRORS = 50;

export function createErrorInterceptor(): ErrorInterceptor {
  if (typeof window === 'undefined') {
    return {
      getAndClear: () => [],
      peek: () => [],
      destroy: () => undefined,
    };
  }

  const buffer: CapturedError[] = [];

  function push(error: CapturedError): void {
    if (buffer.length >= MAX_ERRORS) {
      buffer.splice(0, 1);
    }
    buffer.push(error);
  }

  const errorHandler = (event: ErrorEvent): void => {
    push({
      type: 'runtime',
      message: event.message,
      stack: event.error?.stack ?? '',
      timestamp: Date.now(),
    });
  };

  const rejectionHandler = (event: PromiseRejectionEvent): void => {
    push({
      type: 'unhandled_rejection',
      message: String(event.reason),
      stack: event.reason instanceof Error ? (event.reason.stack ?? '') : '',
      timestamp: Date.now(),
    });
  };

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]): void => {
    originalConsoleError(...args);
    push({
      type: 'console_error',
      message: args.map(String).join(' '),
      timestamp: Date.now(),
    });
  };

  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', rejectionHandler);

  return {
    getAndClear(): CapturedError[] {
      const copy = [...buffer];
      buffer.splice(0, buffer.length);
      return copy;
    },

    peek(): CapturedError[] {
      return [...buffer];
    },

    destroy(): void {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
      console.error = originalConsoleError;
    },
  };
}
