import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, ShieldCheck, RefreshCw, Loader2 } from 'lucide-react';
import { getHostname } from '../lib/utils';

interface InAppWebViewProps {
  url: string | null;
  onClose: () => void;
}

export function InAppWebView({ url, onClose }: InAppWebViewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    if (url) {
      setIsLoading(true);
    }
  }, [url]);

  if (!url) return null;

  const handleRefresh = () => {
    setIsLoading(true);
    setIframeKey(prev => prev + 1);
  };

  const handleOpenExternal = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const domain = getHostname(url);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end overflow-hidden focus:outline-none pointer-events-none">
      {/* Dark backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black pointer-events-auto"
        onClick={onClose}
      />

      {/* Internal Web Panel */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 220 }}
        className="relative w-full h-[94vh] bg-[#0d1527] border-t border-white/10 rounded-t-[2.5rem] shadow-[0_-12px_45px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden pointer-events-auto"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#121c33]/80 backdrop-blur-md shrink-0">
          {/* Domain security details */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 border border-green-500/20 text-green-400 rounded-full text-[11px] font-semibold tracking-wide">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>In-App Sicuro</span>
            </div>
            <span className="text-sm font-medium text-gray-300 truncate tracking-wide max-w-[180px] sm:max-w-xs">
              {domain}
            </span>
          </div>

          {/* Action Operations */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleRefresh}
              className="p-2 hover:bg-white/5 active:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
              title="Aggiorna"
              aria-label="Ricarica pagina"
            >
              <RefreshCw className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={handleOpenExternal}
              className="p-2 hover:bg-white/5 active:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
              title="Apri nel browser completo"
              aria-label="Apri nel browser"
            >
              <ExternalLink className="w-4.5 h-4.5" />
            </button>
            <div className="w-px h-5 bg-white/10 mx-1.5" />
            <button
              onClick={onClose}
              className="p-2 bg-white/5 hover:bg-white/10 active:scale-95 rounded-full text-gray-200 hover:text-white transition-all shadow-md"
              title="Chiudi"
              aria-label="Chiudi webview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Loading progress overlay */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-[57px_0_0_0] z-50 bg-[#0d1527] flex flex-col items-center justify-center gap-3"
            >
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-xs text-gray-400 animate-pulse">Caricamento sicuro in corso...</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* WebView/Iframe Container */}
        <div className="flex-1 w-full h-full bg-white relative">
          <iframe
            key={iframeKey}
            src={url}
            className="w-full h-full border-none"
            title="Sito web incorporato"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            referrerPolicy="no-referrer"
            onLoad={() => setIsLoading(false)}
          />
        </div>
      </motion.div>
    </div>
  );
}
