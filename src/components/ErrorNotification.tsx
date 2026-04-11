import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface ErrorNotificationProps {
  error: string | null;
  onClear: () => void;
}

export const ErrorNotification = ({ error, onClear }: ErrorNotificationProps) => {
  return (
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-4 left-4 right-4 z-[100] flex justify-center pointer-events-none"
        >
          <div className="bg-red-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 max-w-md w-full pointer-events-auto border border-red-500/50 backdrop-blur-md">
            <div className="p-1.5 bg-white/20 rounded-full">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight">{error}</p>
            </div>
            <button
              onClick={onClear}
              className="p-1 hover:bg-white/20 rounded-full transition-colors"
              aria-label="Clear error"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
