import React, { Suspense, Component, lazy, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class LazyErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Chunk load error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md pointer-events-auto"
          role="alertdialog"
          aria-label="Caricamento fallito"
        >
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-sm w-full text-center shadow-2xl">
            <h2 className="text-xl font-bold mb-3 text-white">Caricamento fallito</h2>
            <p className="mb-5 text-gray-400 text-sm">Impossibile caricare il componente. Verifica la connessione e riprova.</p>
            <button 
              onClick={() => this.setState({ hasError: false })}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-2.5 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              Riprova
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const canPrefetch = (): boolean => {
  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const conn = (navigator as any).connection;
    if (conn) {
      if (conn.saveData) return false;
      if (['slow-2g', '2g', '3g'].includes(conn.effectiveType)) return false;
    }
  }
  return true;
};

export function safeLazyImport<T>(
  factory: () => Promise<{ default: T }>,
  retries = 2,
  interval = 500
): Promise<{ default: T }> {
  return factory().catch((error) => {
    if (retries > 0) {
      return new Promise((resolve) => setTimeout(resolve, interval)).then(() =>
        safeLazyImport(factory, retries - 1, Math.round(interval * 1.5))
      );
    }
    throw error;
  });
}

const prefetchCache = new Set<string>();

// For components that are always rendered but use isOpen/isActive prop
export function createLazyModalWithState<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  name: string,
  FallbackComponent: React.ComponentType<any>
) {
  const LazyComponent = lazy(() => safeLazyImport(factory));

  const prefetch = () => {
    if (!canPrefetch() || prefetchCache.has(name)) return;
    prefetchCache.add(name);
    
    const runPrefetch = () => {
      safeLazyImport(factory).catch(() => {
        prefetchCache.delete(name);
      });
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(runPrefetch);
    } else {
      setTimeout(runPrefetch, 1000);
    }
  };

  const WrappedComponent = (props: React.ComponentProps<T>) => {
    const [hasBeenOpened, setHasBeenOpened] = useState(false);
    
    useEffect(() => {
      if (props.isOpen || props.isActive) {
        setHasBeenOpened(true);
      }
    }, [props.isOpen, props.isActive]);

    if (!hasBeenOpened) return null;

    return (
      <LazyErrorBoundary>
        <Suspense fallback={<FallbackComponent />}>
          <LazyComponent {...props} />
        </Suspense>
      </LazyErrorBoundary>
    );
  };

  WrappedComponent.prefetch = prefetch;
  
  return WrappedComponent;
}

// For components that are conditionally rendered (e.g., {isOpen && <Modal />})
export function createLazyView<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  name: string,
  FallbackComponent: React.ComponentType<any>
) {
  const LazyComponent = lazy(() => safeLazyImport(factory));

  const prefetch = () => {
    if (!canPrefetch() || prefetchCache.has(name)) return;
    prefetchCache.add(name);
    
    const runPrefetch = () => {
      safeLazyImport(factory).catch(() => {
        prefetchCache.delete(name);
      });
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(runPrefetch);
    } else {
      setTimeout(runPrefetch, 1000);
    }
  };

  const WrappedComponent = (props: React.ComponentProps<T>) => {
    useEffect(() => {
      prefetchCache.add(name);
    }, []);

    return (
      <LazyErrorBoundary>
        <Suspense fallback={<FallbackComponent />}>
          <LazyComponent {...props} />
        </Suspense>
      </LazyErrorBoundary>
    );
  };

  WrappedComponent.prefetch = prefetch;
  
  return WrappedComponent;
}

export function ModalFallback() {
  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Caricamento vista in corso"
    >
      <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
    </div>
  );
}

export function ViewFallback() {
  return (
    <div 
      className="absolute inset-0 z-[10] flex items-center justify-center bg-gray-950/80 backdrop-blur-md pointer-events-none"
      aria-label="Caricamento vista in corso"
    >
      <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
    </div>
  );
}
