import React, { useState } from 'react';
import { openInApp } from '../utils/browser';
import { X, Moon, Sun, Monitor, Image as ImageIcon, LayoutList, Maximize, Type, Plus, Trash2, Edit2, AlertCircle, Save, ArrowLeft, ChevronDown, ChevronUp, Github, Info, ExternalLink, RefreshCw, ShieldCheck, Download, CheckCircle2, FileCode, Copy, Check } from 'lucide-react';
import { useRss } from '../context/RssContext';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { SwipeAction, Theme, ImageDisplay, FontSize } from '../types';
import { AddFeedModal } from './AddFeedModal';
import { storage } from '../services/storage';
import packageJson from '../../package.json';

export const SettingsModal = React.memo(function SettingsModal({
  isOpen,
  onClose,
  initialTab
}: {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'settings' | 'subscriptions' | 'about';
}) {
  const { settings, updateSettings, feeds, removeFeed, updateFeed, progress, updateInfo, checkUpdates, refreshLogs } = useRss();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'subscriptions' | 'about'>('settings');
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isXmlViewOpen, setIsXmlViewOpen] = useState(false);
  const [xmlContent, setXmlContent] = useState<string | null>(null);
  const [isLoadingXml, setIsLoadingXml] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  
  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || 'settings');
      setSelectedFeedId(null);
      setIsConfirmingDelete(false);
      setIsXmlViewOpen(false);
      setXmlContent(null);
    }
  }, [isOpen, initialTab]);

  const handleViewXml = async (url: string) => {
    setIsLoadingXml(true);
    setIsXmlViewOpen(true);
    try {
      const content = await storage.fetchUrlContent(url);
      setXmlContent(content);
    } catch (e) {
      setXmlContent('Failed to fetch XML content.');
    } finally {
      setIsLoadingXml(false);
    }
  };

  const handleCopyXml = () => {
    if (xmlContent) {
      navigator.clipboard.writeText(xmlContent);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  React.useEffect(() => {
    setIsConfirmingDelete(false);
  }, [selectedFeedId]);

  const handleThemeChange = (theme: Theme) => updateSettings({ theme });
  const handleImageDisplayChange = (imageDisplay: ImageDisplay) => updateSettings({ imageDisplay });
  const handleFontSizeChange = (fontSize: FontSize) => updateSettings({ fontSize });
  const handleSwipeLeftChange = (e: React.ChangeEvent<HTMLSelectElement>) => updateSettings({ swipeLeftAction: e.target.value as SwipeAction });
  const handleSwipeRightChange = (e: React.ChangeEvent<HTMLSelectElement>) => updateSettings({ swipeRightAction: e.target.value as SwipeAction });

  const saveEdit = async (feedId: string) => {
    await updateFeed(feedId, { title: editTitle, feedUrl: editUrl });
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
            className="fixed bottom-0 left-0 right-0 rounded-t-[28px] z-50 px-6 pb-8 pt-0 max-h-[90vh] overflow-y-auto shadow-2xl transition-colors bg-black"
          >
            <div className="sticky top-0 pt-4 pb-4 z-20 border-b border-gray-800 mb-6 -mx-6 px-6 transition-colors bg-black">
              
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  {(activeTab !== 'settings' || selectedFeed) && (
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => selectedFeed ? setSelectedFeedId(null) : setActiveTab('settings')}
                      className="p-2 -ml-2 rounded-full hover:bg-gray-800 transition-colors"
                      aria-label="Go back"
                    >
                      <ArrowLeft className="w-5 h-5 text-gray-300" aria-hidden="true" />
                    </motion.button>
                  )}
                  <h2 className="text-2xl font-bold text-white">
                    {selectedFeed ? 'Feed Details' : 
                     activeTab === 'settings' ? 'Settings' : 
                     activeTab === 'subscriptions' ? 'Subscriptions' : 'About Flusso'}
                  </h2>
                </div>
                <button
                  onClick={() => selectedFeed ? setSelectedFeedId(null) : onClose()}
                  className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors"
                  aria-label="Close settings"
                >
                  <X className="w-5 h-5 text-gray-300" aria-hidden="true" />
                </button>
              </div>
            </div>

            {progress && (
              <div className="mb-6 p-4 rounded-2xl bg-indigo-900/20 border border-indigo-800">
                <div className="flex justify-between text-sm font-medium text-indigo-300 mb-2">
                  <span>{progress.status || 'Processing...'}</span>
                  <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-indigo-900/40 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-indigo-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {selectedFeed ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Title</label>
                  <input 
                    value={editTitle} 
                    onChange={(e) => setEditTitle(e.target.value)} 
                    className="w-full p-3 rounded-lg border border-gray-700 bg-gray-800 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">URL</label>
                  <input 
                    type="url"
                    inputMode="url"
                    value={editUrl} 
                    onChange={(e) => setEditUrl(e.target.value)} 
                    className="w-full p-3 rounded-lg border border-gray-700 bg-gray-800 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all relative z-[60]" 
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(selectedFeed.id)} className="flex-1 p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors">Save Changes</button>
                  <button 
                    onClick={() => handleViewXml(selectedFeed.feedUrl)}
                    className="p-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors flex items-center justify-center"
                    title="View Raw XML"
                  >
                    <FileCode className="w-5 h-5" />
                  </button>
                  {selectedFeed.link && (
                    <button 
                      onClick={async () => {
                        try {
                          await openInApp(selectedFeed.link!);
                        } catch (err) {
                          console.error('Failed to open link in browser:', err);
                          window.open(selectedFeed.link!, '_blank');
                        }
                      }}
                      className="p-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors flex items-center justify-center cursor-pointer"
                      title="Go to source"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </button>
                  )}
                </div>
                <button 
                  onClick={() => { 
                    if (isConfirmingDelete) {
                      removeFeed(selectedFeed.id); 
                      setSelectedFeedId(null); 
                    } else {
                      setIsConfirmingDelete(true);
                    }
                  }} 
                  className={cn(
                    "w-full p-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2",
                    isConfirmingDelete 
                      ? "bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-900/20" 
                      : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  )}
                >
                  {isConfirmingDelete ? (
                    <>
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                      Confirm Removal
                    </>
                  ) : 'Remove Feed'}
                </button>
                {isConfirmingDelete && (
                  <p className="text-[10px] text-center text-red-400 animate-pulse uppercase tracking-wider font-bold">
                    Tap again to permanently delete
                  </p>
                )}
              </div>
            ) : activeTab === 'settings' ? (
              <div className="space-y-8">
                <section>
                  <button
                    onClick={() => setActiveTab('subscriptions')}
                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-gray-800 text-white hover:bg-gray-700 transition-colors font-medium"
                  >
                    <div className="flex items-center gap-3">
                      <LayoutList className="w-5 h-5 text-gray-500" />
                      <span>Manage Subscriptions</span>
                    </div>
                    <span className="text-gray-500">→</span>
                  </button>
                </section>

                {/* Font Size Settings */}
                <section>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Font Size</h3>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => handleFontSizeChange('small')}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-colors ${settings.fontSize === 'small' ? 'border-indigo-600 bg-indigo-900/20 text-indigo-400' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                    >
                      <Type className="w-4 h-4 mb-1" />
                      <span className="text-xs font-medium">Small</span>
                    </button>
                    <button
                      onClick={() => handleFontSizeChange('medium')}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-colors ${settings.fontSize === 'medium' ? 'border-indigo-600 bg-indigo-900/20 text-indigo-400' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                    >
                      <Type className="w-5 h-5 mb-1" />
                      <span className="text-xs font-medium">Medium</span>
                    </button>
                    <button
                      onClick={() => handleFontSizeChange('large')}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-colors ${settings.fontSize === 'large' ? 'border-indigo-600 bg-indigo-900/20 text-indigo-400' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                    >
                      <Type className="w-6 h-6 mb-1" />
                      <span className="text-xs font-medium">Large</span>
                    </button>
                    <button
                      onClick={() => handleFontSizeChange('xlarge')}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-colors ${settings.fontSize === 'xlarge' ? 'border-indigo-600 bg-indigo-900/20 text-indigo-400' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                    >
                      <Type className="w-7 h-7 mb-1" />
                      <span className="text-xs font-medium">X-Large</span>
                    </button>
                  </div>
                </section>

                {/* Image Display Settings */}
                <section>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Article Images</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => handleImageDisplayChange('none')}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-colors ${settings.imageDisplay === 'none' ? 'border-indigo-600 bg-indigo-900/20 text-indigo-400' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                    >
                      <LayoutList className="w-6 h-6 mb-2" />
                      <span className="text-xs font-medium">None</span>
                    </button>
                    <button
                      onClick={() => handleImageDisplayChange('small')}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-colors ${settings.imageDisplay === 'small' ? 'border-indigo-600 bg-indigo-900/20 text-indigo-400' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                    >
                      <ImageIcon className="w-6 h-6 mb-2" />
                      <span className="text-xs font-medium">Small</span>
                    </button>
                    <button
                      onClick={() => handleImageDisplayChange('large')}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-colors ${settings.imageDisplay === 'large' ? 'border-indigo-600 bg-indigo-900/20 text-indigo-400' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}
                    >
                      <Maximize className="w-6 h-6 mb-2" />
                      <span className="text-xs font-medium">Large</span>
                    </button>
                  </div>
                </section>

                {/* Gestures Settings */}
                <section>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Gestures</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Swipe Left Action
                      </label>
                      <select
                        value={settings.swipeLeftAction}
                        onChange={handleSwipeLeftChange}
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-lg bg-gray-800 text-white"
                      >
                        <option value="toggleFavorite">Favorite/Queue</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Swipe Right Action
                      </label>
                      <select
                        value={settings.swipeRightAction}
                        onChange={handleSwipeRightChange}
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-lg bg-gray-800 text-white"
                      >
                        <option value="toggleFavorite">Favorite/Queue</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* Background Refresh Settings */}
                <section>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Background Refresh</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Refresh Interval
                      </label>
                      <select
                        value={settings.refreshInterval}
                        onChange={(e) => updateSettings({ refreshInterval: parseInt(e.target.value) })}
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-lg bg-gray-800 text-white"
                      >
                        <option value={0}>Never</option>
                        <option value={15}>Every 15 minutes</option>
                        <option value={30}>Every 30 minutes</option>
                        <option value={60}>Every hour</option>
                        <option value={180}>Every 3 hours</option>
                        <option value={360}>Every 6 hours</option>
                        <option value={720}>Every 12 hours</option>
                        <option value={1440}>Every 24 hours</option>
                      </select>
                      <p className="mt-1 text-[10px] text-gray-500">
                        * Minimum 15 minutes required by Android system.
                      </p>
                      {settings.lastBackgroundRefresh && (
                        <p className="mt-2 text-[10px] text-indigo-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Last background refresh: {new Date(settings.lastBackgroundRefresh).toLocaleString()}
                        </p>
                      )}
                    </div>

                    {/* Refresh Logs Section (Grouped with Background Refresh) */}
                    <div className="pt-4 border-t border-gray-800/50">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Refresh Issues
                      </h4>
                      {refreshLogs.length > 0 ? (
                        <>
                          <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {refreshLogs.map((log, idx) => (
                              <div key={`${log.feedId}-${idx}`} className="p-3 rounded-xl bg-red-900/10 border border-red-900/20">
                                <div className="flex justify-between items-start mb-1">
                                  <span className="text-xs font-bold text-red-300 truncate flex-1 mr-2">{log.feedTitle}</span>
                                  <span className="text-[10px] text-gray-500 whitespace-nowrap">
                                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-400 leading-tight">{log.error}</p>
                              </div>
                            ))}
                          </div>
                          <p className="mt-2 text-[10px] text-gray-500 italic">
                            Logs are cleared automatically on each new refresh.
                          </p>
                        </>
                      ) : (
                        <div className="p-3 rounded-xl bg-gray-900/30 border border-gray-800/50 text-center">
                          <p className="text-[10px] text-gray-500">No issues detected in the last update.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section className="pt-4 border-t border-gray-800">
                  <button
                    onClick={() => setActiveTab('about')}
                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-gray-800 text-white hover:bg-gray-700 transition-colors font-medium"
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
                  {[...feeds].sort((a, b) => a.title.localeCompare(b.title)).map(feed => (
                    <div 
                      key={feed.id} 
                      className="group flex items-center justify-between p-4 rounded-2xl bg-gray-800 hover:bg-gray-700 transition-colors cursor-pointer" 
                      onClick={() => { setSelectedFeedId(feed.id); setEditTitle(feed.title); setEditUrl(feed.feedUrl); }}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-white truncate block" title={feed.title}>{feed.title}</span>
                        <span className="text-xs text-gray-400">
                          {feed.error ? 'Error' : feed.lastFetched ? `Updated ${new Date(feed.lastFetched).toLocaleString()}` : 'Never updated'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {feed.link && (
                          <button 
                            onClick={async () => {
                              try {
                                await openInApp(feed.link!);
                              } catch (err) {
                                console.error('Failed to open link in browser:', err);
                                window.open(feed.link!, '_blank');
                              }
                            }}
                            className="p-2 bg-gray-900 rounded-lg text-gray-400 hover:text-white hover:bg-gray-600 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                            title="Go to source"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        )}
                        <span className={cn(
                          "w-2.5 h-2.5 rounded-full shadow-sm",
                          feed.lastRefreshStatus === 'error' ? 'bg-red-500 shadow-red-500/50' : 
                          feed.lastRefreshStatus === 'warning' ? 'bg-yellow-500 shadow-yellow-500/50' : 
                          'bg-green-500 shadow-green-500/50'
                        )} />
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-indigo-900/30 text-indigo-100 hover:bg-indigo-900/50 transition-colors font-medium"
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
                  <h3 className="text-2xl font-bold text-white">Flusso</h3>
                  <p className="text-gray-400 mt-1">Version {packageJson.version}</p>
                  
                  {updateInfo?.hasUpdate && (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="mt-4 px-4 py-2 bg-indigo-900/30 text-indigo-300 rounded-full text-sm font-medium flex items-center gap-2"
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
                        <button 
                          onClick={async () => {
                            try {
                              await openInApp(updateInfo.latestRelease?.url!);
                            } catch (err) {
                              console.error('Failed to open link in browser:', err);
                              window.open(updateInfo.latestRelease?.url!, '_blank');
                            }
                          }}
                          className="flex items-center justify-center gap-2 p-3 bg-white text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-50 transition-colors cursor-pointer"
                        >
                          <Download className="w-4 h-4" />
                          Download Update
                        </button>
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
                      className="w-full flex items-center justify-between p-4 rounded-2xl bg-gray-800 text-white hover:bg-gray-700 transition-colors font-medium disabled:opacity-50"
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

                  <div className="p-4 rounded-2xl bg-gray-800 border border-gray-700">
                    <h4 className="text-sm font-semibold text-white mb-2">App Information</h4>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      Flusso is a minimalist, mobile-first RSS reader designed for speed and focus. 
                      It features full article extraction, swipe gestures, and OPML support.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <button 
                      onClick={async () => {
                        try {
                          await openInApp('https://github.com/malamoffo/flusso');
                        } catch (err) {
                          console.error('Failed to open link in browser:', err);
                          window.open('https://github.com/malamoffo/flusso', '_blank');
                        }
                      }}
                      className="w-full flex items-center justify-between p-4 rounded-2xl bg-gray-900 text-white hover:bg-black transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Github className="w-5 h-5" />
                        <span className="font-medium">GitHub Repository</span>
                      </div>
                      <ExternalLink className="w-4 h-4 opacity-50" />
                    </button>
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
          
          {/* XML View Modal */}
          <AnimatePresence>
            {isXmlViewOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="w-full max-w-4xl h-[80vh] flex flex-col rounded-3xl bg-gray-900 border border-gray-800 shadow-2xl overflow-hidden"
                >
                  <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-500/10 rounded-xl">
                        <FileCode className="w-5 h-5 text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-white">Feed XML</h3>
                        <p className="text-[10px] text-gray-500 truncate max-w-[200px] sm:max-w-md">{selectedFeed?.feedUrl}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {xmlContent && (
                        <button
                          onClick={handleCopyXml}
                          className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors flex items-center gap-2 text-xs font-medium"
                        >
                          {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          {isCopied ? 'Copied!' : 'Copy'}
                        </button>
                      )}
                      <button
                        onClick={() => setIsXmlViewOpen(false)}
                        className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-auto p-6 font-mono text-xs leading-relaxed bg-black/30">
                    {isLoadingXml ? (
                      <div className="h-full flex flex-col items-center justify-center gap-4 text-gray-500">
                        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
                        <p className="animate-pulse">Fetching feed XML...</p>
                      </div>
                    ) : xmlContent ? (
                      <pre className="text-gray-300 whitespace-pre-wrap break-all selection:bg-indigo-500/30">
                        {xmlContent}
                      </pre>
                    ) : (
                      <div className="h-full flex items-center justify-center text-gray-500">
                        No content available.
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
});
