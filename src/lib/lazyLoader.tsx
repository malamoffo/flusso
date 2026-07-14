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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md pointer-events-auto">
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-sm w-full text-center shadow-2xl">
            <h2 className="text-xl font-bold mb-3 text-white">Caricamento fallito</h2>
            <p className="mb-5 text-gray-400 text-sm">Verifica la connessione e riprova.</p>
            <button 
              onClick={() => this.setState({ hasError: false })}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-2.5 rounded-xl transition-colors"
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

const canPrefetch = () => {
  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const conn = (navigator as any).connection;
    if (conn.saveData) return false;
    if (['slow-2g', '2g', '3g'].includes(conn.effectiveType)) return false;
  }
  return true;
};

const prefetchCache = new Set<string>();

// For components that are always rendered but use isOpen/isActive prop
export function createLazyModalWithState<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  name: string,
  FallbackComponent: React.ComponentType<any>
) {
  const LazyComponent = lazy(factory);

  const prefetch = () => {
    if (!canPrefetch() || prefetchCache.has(name)) return;
    prefetchCache.add(name);
    
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        factory().catch(() => { prefetchCache.delete(name); });
      });
    } else {
      setTimeout(() => {
        factory().catch(() => { prefetchCache.delete(name); });
      }, 1500);
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
  const LazyComponent = lazy(factory);

  const prefetch = () => {
    if (!canPrefetch() || prefetchCache.has(name)) return;
    prefetchCache.add(name);
    
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        factory().catch(() => { prefetchCache.delete(name); });
      });
    } else {
      setTimeout(() => {
        factory().catch(() => { prefetchCache.delete(name); });
      }, 1500);
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md pointer-events-auto">
      <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
    </div>
  );
}

export function ViewFallback() {
  return (
    <div className="absolute inset-0 z-[10] flex items-center justify-center bg-gray-950 pointer-events-none">
      <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
    </div>
  );
}
