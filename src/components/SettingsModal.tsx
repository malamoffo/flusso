import React, { useState } from 'react';
import { X, Moon, Sun, Monitor, Image as ImageIcon, LayoutList, Maximize, Type, Plus, Trash2, Edit2, AlertCircle, Save, ArrowLeft, ChevronDown, ChevronUp, Github, Info, ExternalLink, RefreshCw, ShieldCheck, Download, CheckCircle2 } from 'lucide-react';
import { useRss } from '../context/RssContext';
import { motion, AnimatePresence } from 'framer-motion';
import { SwipeAction, Theme, ImageDisplay, FontSize } from '../types';
import { AddFeedModal } from './AddFeedModal';
import packageJson from '../../package.json';

export function SettingsModal({
  isOpen,
  onClose,
  initialTab
}: {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'settings' | 'subscriptions' | 'about';
}) {
  const { settings, updateSettings, feeds, removeFeed, updateFeed, progress, updateInfo, checkUpdates } = useRss();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'subscriptions' | 'about'>('settings');
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  
  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || 'settings');
      setSelectedFeedId(null);
    }
  }, [isOpen, initialTab]);

  const handleThemeChange = (theme: Theme) => updateSettings({ theme });
  const handleImageDisplayChange = (imageDisplay: ImageDisplay) => updateSettings({ imageDisplay });
  const handleFontSizeChange = (fontSize: FontSize) => updateSettings({ fontSize });
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
            className={`fixed bottom-0 left-0 right-0 rounded-t-[28px] z-50 px-6 pb-8 pt-0 max-h-[90vh] overflow-y-auto shadow-2xl transition-colors ${
              settings.theme === 'dark' && settings.pureBlack ? 'bg-black' : 'bg-white dark:bg-gray-900'
            }`}
          >
            <div className={`sticky top-0 pt-4 pb-4 z-20 border-b border-gray-100 dark:border-gray-800 mb-6 -mx-6 px-6 transition-colors ${
              settings.theme === 'dark' && settings.pureBlack ? 'bg-black' : 'bg-white dark:bg-gray-900'
            }`}>
              
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  {(activeTab !== 'settings' || selectedFeed) && (
                    <button
                      onClick={() => selectedFeed ? setSelectedFeedId(null) : setActiveTab('settings')}
                      className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      aria-label="Go back"
                    >
                      <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" aria-hidden="true" />
                    </button>
                  )}
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {selectedFeed ? 'Feed Details' : 
                     activeTab === 'settings' ? 'Settings' : 
                     activeTab === 'subscriptions' ? 'Subscriptions' : 'About Flusso'}
                  </h2>
                </div>
                <button
                  onClick={() => selectedFeed ? setSelectedFeedId(null) : onClose()}
                  className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Close settings"
                >
                  <X className="w-5 h-5 text-gray-600 dark:text-gray-300" aria-hidden="true" />
                </button>
              </div>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL</label>
                  <input value={selectedFeed.feedUrl} readOnly className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white opacity-70" />
                </div>
                <button onClick={() => saveEdit(selectedFeed.id)} className="w-full p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors">Save Changes</button>
                <button onClick={() => { removeFeed(selectedFeed.id); setSelectedFeedId(null); }} className="w-full p-3 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-xl font-medium transition-colors">Remove Feed</button>
              </div>
            ) : activeTab === 'settings' ? (
              <div className="space-y-8">
                <section>
                  <button
                    onClick={() => setActiveTab('subscriptions')}
                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-medium"
                  >
                    <div className="flex items-center gap-3">
                      <LayoutList className="w-5 h-5 text-gray-500" />
                      <span>Manage Subscriptions</span>
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

                  {(settings.theme === 'dark' || settings.theme === 'system') && (
                    <div className="mt-4 flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-gray-800">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center">
                          <Moon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">Pure Black</p>
                          <p className="text-xs text-gray-500">AMOLED optimized</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => updateSettings({ pureBlack: !settings.pureBlack })}
                        className={`w-12 h-6 rounded-full transition-colors relative ${settings.pureBlack ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                        role="switch"
                        aria-checked={settings.pureBlack}
                        aria-label="Toggle Pure Black theme"
                      >
                        <motion.div 
                          animate={{ x: settings.pureBlack ? 24 : 4 }}
                          className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-sm"
                        />
                      </button>
                    </div>
                  )}
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

                <section className="pt-4 border-t border-gray-100 dark:border-gray-800">
                  <button
                    onClick={() => setActiveTab('about')}
                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-medium"
                  >
                    <div className="flex items-center gap-3">
                      <Info className="w-5 h-5 text-gray-500" />
                      <span>About Flusso</span>
                    </div>
                    <span className="text-gray-500">→</span>
                  </button>
                </section>
              </div>
            ) : activeTab === 'subscriptions' ? (
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
                  <Plus className="w-5 h-5" aria-hidden="true" />
                  Add New Feed or Import OPML
                </button>
              </section>
            ) : (
              <section className="space-y-8">
                <div className="flex flex-col items-center text-center py-4">
                  <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-lg mb-4">
                    <RefreshCw className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Flusso</h3>
                  <p className="text-gray-500 dark:text-gray-400 mt-1">Version {packageJson.version}</p>
                  
                  {updateInfo?.hasUpdate && (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="mt-4 px-4 py-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium flex items-center gap-2"
                    >
                      <AlertCircle className="w-4 h-4" />
                      New version {updateInfo.latestRelease?.version} available!
                    </motion.div>
                  )}
                </div>

                <div className="space-y-4">
                  {updateInfo?.hasUpdate ? (
                    <div className="p-5 rounded-2xl bg-indigo-600 text-white shadow-xl shadow-indigo-500/20">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h4 className="font-bold text-lg">Update Available</h4>
                          <p className="text-indigo-100 text-sm">Version {updateInfo.latestRelease?.version} is ready for download.</p>
                        </div>
                        <div className="p-2 bg-white/20 rounded-xl">
                          <Download className="w-6 h-6" />
                        </div>
                      </div>
                      
                      {updateInfo.latestRelease?.notes && (
                        <div className="mb-6 p-3 bg-white/10 rounded-xl text-xs leading-relaxed max-h-32 overflow-y-auto">
                          <p className="font-semibold mb-1 opacity-70 uppercase tracking-wider">What's New:</p>
                          {updateInfo.latestRelease.notes}
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-3">
                        <a 
                          href={updateInfo.latestRelease?.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 p-3 bg-white text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-50 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          Download Update
                        </a>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        setIsCheckingUpdate(true);
                        await checkUpdates(true);
                        setIsCheckingUpdate(false);
                      }}
                      disabled={isCheckingUpdate}
                      className="w-full flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-medium disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        {isCheckingUpdate ? (
                          <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin" />
                        ) : updateInfo ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                          <ShieldCheck className="w-5 h-5 text-gray-500" />
                        )}
                        <span>{isCheckingUpdate ? 'Checking for updates...' : updateInfo ? 'App is up to date' : 'Check for updates'}</span>
                      </div>
                      {!isCheckingUpdate && <span className="text-xs text-gray-400">{updateInfo ? 'Checked just now' : 'Manual check'}</span>}
                    </button>
                  )}

                  <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">App Information</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                      Flusso is a minimalist, mobile-first RSS reader designed for speed and focus. 
                      It features full article extraction, swipe gestures, and OPML support.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <a 
                      href="https://github.com/malamoffo/flusso" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-between p-4 rounded-2xl bg-gray-900 text-white hover:bg-black transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Github className="w-5 h-5" />
                        <span className="font-medium">GitHub Repository</span>
                      </div>
                      <ExternalLink className="w-4 h-4 opacity-50" />
                    </a>
                  </div>
                </div>

                <div className="text-center pt-4">
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest">
                    Made with ❤️ by Daniele Giannetti
                  </p>
                </div>
              </section>
            )}
          </motion.div>
          <AddFeedModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
        </>
      )}
    </AnimatePresence>
  );
}
