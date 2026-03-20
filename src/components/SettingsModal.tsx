import React, { useState } from 'react';
import { X, Moon, Sun, Monitor, Image as ImageIcon, LayoutList, Maximize, Type, Plus, Trash2, Edit2, AlertCircle, Save, ArrowLeft, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { useRss } from '../context/RssContext';
import { motion, AnimatePresence } from 'framer-motion';
import { SwipeAction, Theme, ImageDisplay, FontSize, Font } from '../types';
import { AddFeedModal } from './AddFeedModal';

export function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { settings, updateSettings, feeds, removeFeed, updateFeed, progress, logs, clearLogs } = useRss();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'subscriptions' | 'logs'>('settings');
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);

  const handleThemeChange = (theme: Theme) => updateSettings({ theme });
  const handleImageDisplayChange = (imageDisplay: ImageDisplay) => updateSettings({ imageDisplay });
  const handleFontSizeChange = (fontSize: FontSize) => updateSettings({ fontSize });
  const handleFontChange = (font: Font) => updateSettings({ font });
  const handleRefreshIntervalChange = (e: React.ChangeEvent<HTMLSelectElement>) => updateSettings({ refreshInterval: parseInt(e.target.value, 10) });
  const handleSwipeLeftChange = (e: React.ChangeEvent<HTMLSelectElement>) => updateSettings({ swipeLeftAction: e.target.value as SwipeAction });
  const handleSwipeRightChange = (e: React.ChangeEvent<HTMLSelectElement>) => updateSettings({ swipeRightAction: e.target.value as SwipeAction });

  const saveEdit = async (feedId: string) => {
    await updateFeed(feedId, { title: editTitle });
    setEditingFeedId(null);
    setSelectedFeedId(null);
  };

  const selectedFeed = feeds.find(f => f.id === selectedFeedId);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-[28px] z-50 p-6 pb-safe max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            {/* Drag Handle */}
            <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-6" />
            
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-white dark:bg-gray-900 pt-2 pb-4 z-10 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                {(activeTab !== 'settings' || selectedFeed) && (
                  <button onClick={() => selectedFeed ? setSelectedFeedId(null) : setActiveTab('settings')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  </button>
                )}
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {selectedFeed ? 'Feed Details' : activeTab === 'settings' ? 'Settings' : activeTab === 'subscriptions' ? 'Subscriptions' : 'Error Logs'}
                </h2>
              </div>
              <button onClick={() => selectedFeed ? setSelectedFeedId(null) : onClose()} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            {progress && (
              <div className="mb-6 p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800">
                <div className="flex justify-between text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-2">
                  <span>{progress.status || 'Processing...'}</span>
                  <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-indigo-200 dark:bg-indigo-900/40 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-indigo-600 dark:bg-indigo-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {selectedFeed ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">URL</label>
                  <input value={selectedFeed.feedUrl} readOnly className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700" />
                </div>
                <button onClick={() => saveEdit(selectedFeed.id)} className="w-full p-3 bg-indigo-600 text-white rounded-xl">Save</button>
                <button onClick={() => { removeFeed(selectedFeed.id); setSelectedFeedId(null); }} className="w-full p-3 bg-red-600 text-white rounded-xl">Remove Feed</button>
              </div>
            ) : activeTab === 'settings' ? (
              <div className="space-y-8">
                <section>
                  <button
                    onClick={() => setActiveTab('subscriptions')}
                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-medium mb-3"
                  >
                    <div className="flex items-center gap-3">
                      <LayoutList className="w-5 h-5 text-gray-500" />
                      <span>Manage Subscriptions</span>
                    </div>
                    <span className="text-gray-500">→</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('logs')}
                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-medium"
                  >
                    <div className="flex items-center gap-3">
                      <Terminal className="w-5 h-5 text-gray-500" />
                      <span>View Error Logs</span>
                    </div>
                    <span className="text-gray-500">→</span>
                  </button>
                </section>

                {/* Theme Settings */}
                <section>
                  <h3 className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-3">Appearance</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => handleThemeChange('light')}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-colors ${settings.theme === 'light' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    >
                      <Sun className="w-6 h-6 mb-2" />
                      <span className="text-xs font-medium">Light</span>
                    </button>
                    <button
                      onClick={() => handleThemeChange('dark')}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-colors ${settings.theme === 'dark' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    >
                      <Moon className="w-6 h-6 mb-2" />
                      <span className="text-xs font-medium">Dark</span>
                    </button>
                    <button
                      onClick={() => handleThemeChange('system')}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-colors ${settings.theme === 'system' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    >
                      <Monitor className="w-6 h-6 mb-2" />
                      <span className="text-xs font-medium">System</span>
                    </button>
                  </div>
                </section>

                {/* Font Settings */}
                <section>
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Font</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {['sans', 'serif', 'mono'].map((f) => (
                      <button
                        key={f}
                        onClick={() => handleFontChange(f as Font)}
                        className={`p-3 rounded-xl border-2 transition-colors ${settings.font === f ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                      >
                        <span className="text-sm font-medium capitalize">{f}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Font Size Settings */}
                <section>
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Font Size</h3>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => handleFontSizeChange('small')}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-colors ${settings.fontSize === 'small' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    >
                      <Type className="w-4 h-4 mb-1" />
                      <span className="text-xs font-medium">Small</span>
                    </button>
                    <button
                      onClick={() => handleFontSizeChange('medium')}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-colors ${settings.fontSize === 'medium' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    >
                      <Type className="w-5 h-5 mb-1" />
                      <span className="text-xs font-medium">Medium</span>
                    </button>
                    <button
                      onClick={() => handleFontSizeChange('large')}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-colors ${settings.fontSize === 'large' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    >
                      <Type className="w-6 h-6 mb-1" />
                      <span className="text-xs font-medium">Large</span>
                    </button>
                    <button
                      onClick={() => handleFontSizeChange('xlarge')}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-colors ${settings.fontSize === 'xlarge' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    >
                      <Type className="w-7 h-7 mb-1" />
                      <span className="text-xs font-medium">X-Large</span>
                    </button>
                  </div>
                </section>

                {/* Image Display Settings */}
                <section>
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Article Images</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => handleImageDisplayChange('none')}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-colors ${settings.imageDisplay === 'none' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    >
                      <LayoutList className="w-6 h-6 mb-2" />
                      <span className="text-xs font-medium">None</span>
                    </button>
                    <button
                      onClick={() => handleImageDisplayChange('small')}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-colors ${settings.imageDisplay === 'small' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    >
                      <ImageIcon className="w-6 h-6 mb-2" />
                      <span className="text-xs font-medium">Small</span>
                    </button>
                    <button
                      onClick={() => handleImageDisplayChange('large')}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-colors ${settings.imageDisplay === 'large' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    >
                      <Maximize className="w-6 h-6 mb-2" />
                      <span className="text-xs font-medium">Large</span>
                    </button>
                  </div>
                </section>

                {/* Background Refresh Settings */}
                <section>
                  <h3 className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-3">Background Refresh</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Update Interval
                    </label>
                    <select
                      value={settings.refreshInterval}
                      onChange={handleRefreshIntervalChange}
                      className="block w-full pl-3 pr-10 py-3 text-base border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white"
                    >
                      <option value={0}>Manual Only</option>
                      <option value={15}>Every 15 minutes</option>
                      <option value={30}>Every 30 minutes</option>
                      <option value={60}>Every 1 hour</option>
                      <option value={360}>Every 6 hours</option>
                      <option value={720}>Every 12 hours</option>
                      <option value={1440}>Every 24 hours</option>
                    </select>
                  </div>
                </section>

                {/* Gestures Settings */}
                <section>
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Gestures</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Swipe Left Action
                      </label>
                      <select
                        value={settings.swipeLeftAction}
                        onChange={handleSwipeLeftChange}
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="toggleRead">Toggle Read/Unread</option>
                        <option value="toggleFavorite">Toggle Favorite</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Swipe Right Action
                      </label>
                      <select
                        value={settings.swipeRightAction}
                        onChange={handleSwipeRightChange}
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="toggleRead">Toggle Read/Unread</option>
                        <option value="toggleFavorite">Toggle Favorite</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                  </div>
                </section>
              </div>
            ) : activeTab === 'logs' ? (
              <section className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Recent Activity</h3>
                  <button onClick={clearLogs} className="text-xs text-red-600 font-medium">Clear Logs</button>
                </div>
                {logs.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">No logs available</div>
                ) : (
                  <div className="space-y-2">
                    {logs.map(log => (
                      <div key={log.id} className={`p-3 rounded-xl border ${log.level === 'error' ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30' : log.level === 'warn' ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-100 dark:border-yellow-900/30' : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700'}`}>
                        <div className="flex justify-between items-start mb-1">
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${log.level === 'error' ? 'bg-red-100 text-red-700' : log.level === 'warn' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-200 text-gray-700'}`}>
                            {log.level}
                          </span>
                          <span className="text-[10px] text-gray-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">{log.message}</p>
                        {log.url && <p className="text-[10px] text-indigo-600 dark:text-indigo-400 truncate mb-1">{log.url}</p>}
                        {log.details && (
                          <button 
                            onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                            className="flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-gray-700"
                          >
                            {expandedLogId === log.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {expandedLogId === log.id ? 'Hide Details' : 'Show Details'}
                          </button>
                        )}
                        <AnimatePresence>
                          {expandedLogId === log.id && log.details && (
                            <motion.pre 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="mt-2 p-2 bg-black/5 dark:bg-white/5 rounded text-[10px] font-mono whitespace-pre-wrap break-all overflow-hidden"
                            >
                              {log.details}
                            </motion.pre>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <section className="space-y-4">
                <div className="space-y-2">
                  {feeds.map(feed => (
                    <div 
                      key={feed.id} 
                      className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer" 
                      onClick={() => { setSelectedFeedId(feed.id); setEditTitle(feed.title); }}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-gray-900 dark:text-white truncate block" title={feed.title}>{feed.title}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {feed.error ? 'Error' : feed.lastFetched ? `Updated ${new Date(feed.lastFetched).toLocaleDateString()}` : 'Never updated'}
                        </span>
                      </div>
                      <span className={`w-2 h-2 rounded-full ${feed.error ? 'bg-red-500' : 'bg-green-500'}`} />
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors font-medium"
                >
                  <Plus className="w-5 h-5" />
                  Add New Feed or Import OPML
                </button>
              </section>
            )}
          </motion.div>
          <AddFeedModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
        </>
      )}
    </AnimatePresence>
  );
}
