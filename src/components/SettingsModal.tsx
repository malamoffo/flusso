import React, { useState } from 'react';
import { X, Moon, Sun, Monitor, Image as ImageIcon, LayoutList, Maximize, Type, Plus, Trash2, Edit2, AlertCircle, Save, ArrowLeft, ChevronDown, ChevronUp, Github, Info, ExternalLink, RefreshCw, ShieldCheck, Download, CheckCircle2, FileText, Headphones, Upload, MessageSquare } from 'lucide-react';
import { useRss } from '../context/RssContext';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { SwipeAction, Theme, ImageDisplay, FontSize } from '../types';
import { AddFeedModal } from './AddFeedModal';
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
  const { settings, updateSettings, feeds, subreddits, removeFeed, removeSubreddit, updateFeed, progress, updateInfo, checkUpdates, exportFeeds, importOpml, errorLogs, clearErrorLogs } = useRss();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'subscriptions' | 'about'>('settings');
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [showImportOptions, setShowImportOptions] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'replace' | 'append'>('append');
  
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };
  
  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || 'settings');
      setSelectedFeedId(null);
      setIsConfirmingDelete(false);
    }
  }, [isOpen, initialTab]);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importOpml(file, importMode === 'append');
    } catch (err) {
      console.error('Import failed:', err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowImportOptions(false);
    }
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
                  {selectedFeed.link && (
                    <a 
                      href={selectedFeed.link} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="p-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors flex items-center justify-center"
                      title="Go to source"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
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
                {/* Articles Section */}
                <div className="border border-gray-800 rounded-2xl overflow-hidden">
                  <button 
                    onClick={() => toggleSection('articles')}
                    className="w-full flex items-center justify-between p-4 bg-gray-900/50 hover:bg-gray-800 transition-colors"
                  >
                    <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Articles
                    </h3>
                    {expandedSections.has('articles') ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </button>
                  <AnimatePresence>
                    {expandedSections.has('articles') && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-2 space-y-1 bg-black">
                          {feeds.filter(f => f.type !== 'podcast').map(feed => {
                            const domain = feed.link ? new URL(feed.link).hostname : '';
                            return (
                              <div 
                                key={feed.id} 
                                className="group flex items-center justify-between p-3 rounded-xl hover:bg-gray-800 transition-all cursor-pointer" 
                                onClick={() => { setSelectedFeedId(feed.id); setEditTitle(feed.title); setEditUrl(feed.feedUrl); }}
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  {domain && (
                                    <img 
                                      src={`https://icons.duckduckgo.com/ip3/${domain}.ico`} 
                                      alt="" 
                                      className="w-4 h-4 rounded-sm flex-shrink-0"
                                      referrerPolicy="no-referrer"
                                      onError={(e) => {
                                        const img = e.target as HTMLImageElement;
                                        img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
                                      }}
                                    />
                                  )}
                                  <div className="min-w-0">
                                    <span className="text-sm font-medium text-white truncate block">{feed.title}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`w-1.5 h-1.5 rounded-full ${feed.error ? 'bg-red-500' : 'bg-green-500'}`} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Podcasts Section */}
                <div className="border border-gray-800 rounded-2xl overflow-hidden">
                  <button 
                    onClick={() => toggleSection('podcasts')}
                    className="w-full flex items-center justify-between p-4 bg-gray-900/50 hover:bg-gray-800 transition-colors"
                  >
                    <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                      <Headphones className="w-4 h-4" />
                      Podcasts
                    </h3>
                    {expandedSections.has('podcasts') ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </button>
                  <AnimatePresence>
                    {expandedSections.has('podcasts') && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-3 bg-black">
                          <div className="grid grid-cols-4 gap-2">
                            {feeds.filter(f => f.type === 'podcast').map(feed => (
                              <div 
                                key={feed.id} 
                                className="group relative aspect-square rounded-xl overflow-hidden bg-gray-800 border border-gray-700 hover:border-indigo-500 transition-all cursor-pointer" 
                                onClick={() => { setSelectedFeedId(feed.id); setEditTitle(feed.title); setEditUrl(feed.feedUrl); }}
                              >
                                {feed.imageUrl ? (
                                  <img 
                                    src={feed.imageUrl} 
                                    alt={feed.title} 
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Headphones className="w-5 h-5 text-gray-500" />
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-black/40 flex items-end p-1">
                                  <span className="text-[8px] font-bold text-white truncate w-full">{feed.title}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Subreddits Section */}
                <div className="border border-gray-800 rounded-2xl overflow-hidden">
                  <button 
                    onClick={() => toggleSection('subreddits')}
                    className="w-full flex items-center justify-between p-4 bg-gray-900/50 hover:bg-gray-800 transition-colors"
                  >
                    <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Subreddits
                    </h3>
                    {expandedSections.has('subreddits') ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </button>
                  <AnimatePresence>
                    {expandedSections.has('subreddits') && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-2 space-y-1 bg-black">
                          {subreddits.map(sub => (
                            <div 
                              key={sub.id} 
                              className="group flex items-center justify-between p-3 rounded-xl hover:bg-gray-800 transition-all" 
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {sub.iconUrl ? (
                                  <img 
                                    src={sub.iconUrl} 
                                    alt="" 
                                    className="w-6 h-6 rounded-full flex-shrink-0 object-cover bg-gray-900 shadow-[0_0_8px_rgba(168,85,247,0.4)]"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded-full flex-shrink-0 bg-purple-500/20 flex items-center justify-center shadow-[0_0_8px_rgba(168,85,247,0.4)]">
                                    <MessageSquare className="w-3 h-3 text-purple-400" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <span className="text-sm font-medium text-white truncate block">r/{sub.name}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => removeSubreddit(sub.id)}
                                className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Intelligent Import OPML Button */}
                <div className="space-y-3">
                  <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-[var(--theme-color)] text-white hover:bg-opacity-90 transition-colors font-medium shadow-lg shadow-[var(--theme-color)]/20"
                  >
                    <Plus className="w-5 h-5" />
                    Add Feed / Subreddit
                  </button>

                  <input
                    type="file"
                    accept=".opml,.xml"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
                  
                  {!showImportOptions ? (
                    <button
                      onClick={() => {
                        if (feeds.length > 0) {
                          setShowImportOptions(true);
                        } else {
                          setImportMode('append');
                          fileInputRef.current?.click();
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-indigo-900/20 text-indigo-100 hover:bg-indigo-900/30 border border-indigo-500/20 transition-colors font-medium"
                    >
                      <Upload className="w-5 h-5" />
                      Import OPML
                    </button>
                  ) : (
                    <div className="p-4 rounded-2xl bg-indigo-900/10 border border-indigo-500/20 space-y-3 animate-in fade-in slide-in-from-bottom-2">
                      <p className="text-sm text-center text-indigo-200 font-medium">You have existing subscriptions.</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            setImportMode('replace');
                            fileInputRef.current?.click();
                          }}
                          className="flex flex-col items-center justify-center p-3 rounded-xl bg-red-900/20 text-red-400 border border-red-500/20 hover:bg-red-900/30 transition-colors"
                        >
                          <Trash2 className="w-4 h-4 mb-1" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Replace All</span>
                        </button>
                        <button
                          onClick={() => {
                            setImportMode('append');
                            fileInputRef.current?.click();
                          }}
                          className="flex flex-col items-center justify-center p-3 rounded-xl bg-indigo-900/20 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-900/30 transition-colors"
                        >
                          <Plus className="w-4 h-4 mb-1" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Add to List</span>
                        </button>
                      </div>
                      <button 
                        onClick={() => setShowImportOptions(false)}
                        className="w-full py-2 text-xs text-gray-500 hover:text-gray-400 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Export OPML Button - Styled like the Import button */}
                  <button
                    onClick={async () => {
                      const opml = await exportFeeds();
                      const blob = new Blob([opml], { type: 'text/xml' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'flusso-subscriptions.opml';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-indigo-900/20 text-indigo-100 hover:bg-indigo-900/30 border border-indigo-500/20 transition-colors font-medium"
                  >
                    <Download className="w-5 h-5" />
                    Export Subscriptions (OPML)
                  </button>
                </div>
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

                  {errorLogs.length > 0 && (
                    <div className="p-4 rounded-2xl bg-red-900/10 border border-red-500/20">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          Error Logs
                        </h4>
                        <button 
                          onClick={clearErrorLogs}
                          className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-400"
                        >
                          Clear Logs
                        </button>
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {errorLogs.map((log, i) => (
                          <div key={i} className="text-[10px] font-mono text-red-300/70 border-b border-red-500/10 pb-1">
                            {log}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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
});
