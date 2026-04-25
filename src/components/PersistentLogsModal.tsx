import React, { useState, useEffect, useRef } from 'react';
import { X, Trash2, Download, Copy, Check, Search, Terminal, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { Logger } from '../lib/logger';
import { format } from 'date-fns';

export function PersistentLogsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadLogs = () => {
    setLogs(Logger.getLogs());
  };

  useEffect(() => {
    if (isOpen) {
      loadLogs();
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const filteredLogs = logs.filter(log => {
    const matchesFilter = filter === 'all' || log.level === filter;
    const matchesSearch = log.message.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleCopy = () => {
    const text = filteredLogs.map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message} ${log.data ? JSON.stringify(log.data) : ''}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const text = logs.map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message} ${log.data ? JSON.stringify(log.data) : ''}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flusso-persistent-logs-${format(new Date(), 'yyyy-MM-dd-HH-mm')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'warn': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      default: return 'text-gray-300';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="fixed inset-4 md:inset-20 bg-gray-950 border border-gray-800 rounded-[32px] z-[101] flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-800 flex items-center justify-between bg-gray-950/80 backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-xl">
                  <Terminal className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white leading-none">Persistent Logs</h2>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Survives crashes and restarts</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={loadLogs}
                  className="p-2 bg-gray-900 rounded-full hover:bg-gray-800 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-5 h-5 text-gray-400" />
                </button>
                <button 
                  onClick={onClose}
                  className="p-2 bg-gray-900 rounded-full hover:bg-gray-800 transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Toolbar */}
            <div className="p-4 border-b border-gray-800 flex flex-col gap-4 bg-gray-900/30 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input 
                  type="text" 
                  placeholder="Search logs..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                />
              </div>
              
              <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
                <div className="flex gap-1">
                  {(['all', 'info', 'warn', 'error'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilter(t)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border",
                        filter === t 
                          ? "bg-red-600 text-white border-red-500 shadow-lg shadow-red-500/20" 
                          : "bg-gray-900 text-gray-500 border-gray-800 hover:text-gray-300"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="flex gap-1 shrink-0">
                  <button 
                    onClick={handleCopy}
                    className="p-2 bg-gray-900 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors border border-gray-800"
                    title="Copy logs"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={handleDownload}
                    className="p-2 bg-gray-900 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors border border-gray-800"
                    title="Download logs"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => { if(confirm('Clear all logs?')) { Logger.clearLogs(); loadLogs(); } }}
                    className="p-2 bg-red-950/20 rounded-lg hover:bg-red-950/40 text-red-500/70 hover:text-red-500 transition-colors border border-red-900/20"
                    title="Clear logs"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Logs List */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed selection:bg-red-500/30 custom-scrollbar"
            >
              {filteredLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-20 filter grayscale">
                  <Terminal className="w-12 h-12 mb-2" />
                  <p className="text-sm font-sans uppercase tracking-widest font-bold">No logs found</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredLogs.map((log, index) => (
                    <div key={index} className="flex gap-3 group border-b border-gray-900/50 pb-1 flex-col sm:flex-row sm:items-start">
                      <span className="text-gray-600 shrink-0 select-none text-[9px] sm:text-[11px]">
                        {log.timestamp.split('T')[1].split('.')[0]}
                      </span>
                      <span className={cn(
                        "font-bold shrink-0 w-12 text-center select-none opacity-80 text-[9px] sm:text-[11px]",
                        getLogColor(log.level)
                      )}>
                        [{log.level.toUpperCase()}]
                      </span>
                      <div className="flex-1 min-w-0">
                        <pre className={cn(
                          "whitespace-pre-wrap break-all",
                          getLogColor(log.level)
                        )}>
                          {log.message}
                        </pre>
                        {log.data && (
                          <pre className="mt-1 p-2 bg-black/40 rounded border border-white/5 text-[9px] overflow-x-auto text-gray-400">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-4 bg-gray-950 border-t border-gray-800 text-center text-[10px] text-gray-600 font-sans uppercase tracking-widest">
              Showing {filteredLogs.length} of {logs.length} entries
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
