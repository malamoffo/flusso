import React from 'react';
import { X, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function ErrorModal({ failedFeeds, onClose }: { failedFeeds: { feedUrl: string; error: string }[]; onClose: () => void }) {
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="w-full max-w-sm p-6 rounded-3xl bg-gray-900 border border-gray-800 shadow-2xl"
        >
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-6 h-6 text-red-500" />
            <h3 className="text-lg font-bold text-white">Refresh errors</h3>
          </div>
          <p className="text-gray-400 mb-4 text-sm">The following feeds failed to update:</p>
          <div className="max-h-60 overflow-y-auto mb-6 space-y-2">
            {failedFeeds.map((f, i) => (
              <div key={i} className="text-xs bg-gray-800 p-2 rounded-lg text-gray-300">
                <div className="font-semibold text-gray-100 truncate">{f.feedUrl}</div>
                <div className="text-red-400">{f.error}</div>
              </div>
            ))}
          </div>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl font-medium bg-red-600 text-white hover:bg-red-700"
          >
            Close
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
