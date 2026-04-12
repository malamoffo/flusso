import React, { useState, useEffect } from 'react';
import { X, Search, Headphones, Plus, Loader2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRss } from '../context/RssContext';
import { CachedImage } from './CachedImage';
import { PodcastDetailsModal } from './PodcastDetailsModal';
import { storage } from '../services/storage';
import { Feed } from '../types';

interface PodcastSearchResult {
  collectionId: number;
  artistName: string;
  collectionName: string;
  feedUrl: string;
  artworkUrl600: string;
  genres: string[];
  trackCount?: number;
  collectionExplicitness?: string;
  releaseDate?: string;
  primaryGenreName?: string;
}

const CATEGORIES = [
  'All',
  'Arts',
  'Business',
  'Comedy',
  'Education',
  'Fiction',
  'Government',
  'History',
  'Health & Fitness',
  'Kids & Family',
  'Leisure',
  'Music',
  'News',
  'Religion & Spirituality',
  'Science',
  'Society & Culture',
  'Sports',
  'Technology',
  'True Crime',
  'TV & Film'
];

const DATE_FILTERS = [
  { label: 'Any time', value: 'all' },
  { label: 'Last 7 days', value: 'week' },
  { label: 'Last 30 days', value: 'month' },
  { label: 'Last 90 days', value: 'quarter' },
  { label: 'Last year', value: 'year' }
];

export const PodcastSearchModal = React.memo(function PodcastSearchModal({ 
  isOpen, 
  onClose,
  onPodcastAdded
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onPodcastAdded?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<PodcastSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addFeedOrSubreddit, feeds } = useRss();
  const [addingId, setAddingId] = useState<number | null>(null);
  const [selectedFeedDetails, setSelectedFeedDetails] = useState<Feed | null>(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedDateFilter, setSelectedDateFilter] = useState('all');

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const searchPodcasts = async (searchTerm: string) => {
    setIsSearching(true);
    setError(null);
    try {
      const response = await fetch(`https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(searchTerm)}&limit=50`);
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      setResults(data.results || []);
    } catch (err) {
      setError('Failed to search podcasts. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  // Auto-search when debounced query or filters change
  useEffect(() => {
    const searchTerm = debouncedQuery.trim() || (selectedCategory !== 'All' ? selectedCategory : '');
    
    if (!searchTerm && !debouncedQuery.trim()) {
      // If absolutely no search term and no query, don't auto-search unless we want "top" results
      // For now, let's only auto-search if there's at least a category or query
      if (selectedCategory === 'All') {
        setResults([]);
        return;
      }
    }

    searchPodcasts(searchTerm || 'podcast');
  }, [debouncedQuery, selectedCategory]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setDebouncedQuery('');
      setResults([]);
      setError(null);
      setSelectedCategory('All');
      setSelectedDateFilter('all');
    }
  }, [isOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const searchTerm = query.trim() || (selectedCategory !== 'All' ? selectedCategory : 'podcast');
    searchPodcasts(searchTerm);
  };

  const handleAdd = async (feedUrl: string, collectionId: number) => {
    if (!feedUrl) {
      setError('This podcast does not have a valid RSS feed.');
      return;
    }
    setAddingId(collectionId);
    try {
      await addFeedOrSubreddit(feedUrl);
      if (onPodcastAdded) onPodcastAdded();
      // Don't close, let the user see it's added
    } catch (err: any) {
      setError(err.message || 'Failed to add podcast');
    } finally {
      setAddingId(null);
    }
  };

  const handlePodcastClick = async (podcast: PodcastSearchResult) => {
    if (!podcast.feedUrl) return;
    
    // If already subscribed, we can just find it in feeds
    const existingFeed = feeds.find(f => f.feedUrl === podcast.feedUrl);
    if (existingFeed) {
      setSelectedFeedDetails(existingFeed);
      return;
    }

    // Otherwise fetch it
    setIsFetchingDetails(podcast.collectionId);
    try {
      const data = await storage.fetchFeedData(podcast.feedUrl);
      if (data && data.feed) {
        // Use iTunes image and title as fallback/override if feed is missing them
        const feedDetails = {
          ...data.feed,
          title: data.feed.title || podcast.collectionName,
          imageUrl: data.feed.imageUrl || podcast.artworkUrl600,
        };
        setSelectedFeedDetails(feedDetails);
      } else {
        setError('Could not load podcast details.');
      }
    } catch (err) {
      setError('Failed to load podcast details.');
    } finally {
      setIsFetchingDetails(null);
    }
  };

  const filteredResults = results.filter(podcast => {
    // Category filter
    if (selectedCategory !== 'All') {
      const matchesCategory = podcast.genres?.some(g => g.toLowerCase().includes(selectedCategory.toLowerCase())) || 
                             podcast.primaryGenreName?.toLowerCase().includes(selectedCategory.toLowerCase());
      if (!matchesCategory) return false;
    }

    // Date filter
    if (selectedDateFilter !== 'all' && podcast.releaseDate) {
      const releaseDate = new Date(podcast.releaseDate).getTime();
      const now = Date.now();
      const diffDays = (now - releaseDate) / (1000 * 60 * 60 * 24);

      if (selectedDateFilter === 'week' && diffDays > 7) return false;
      if (selectedDateFilter === 'month' && diffDays > 30) return false;
      if (selectedDateFilter === 'quarter' && diffDays > 90) return false;
      if (selectedDateFilter === 'year' && diffDays > 365) return false;
    }

    return true;
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 rounded-t-3xl z-[70] p-6 pb-8 bg-black border-t border-gray-800 shadow-[0_-8px_30px_rgb(0,0,0,0.5)] max-h-[90vh] flex flex-col"
          >
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Headphones className="w-6 h-6 text-indigo-400" />
                Search Podcasts
              </h2>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="p-2 bg-gray-800 rounded-full"
              >
                <X className="w-5 h-5 text-gray-300" />
              </motion.button>
            </div>

            <form onSubmit={handleSearch} className="mb-4 shrink-0">
              <div className="relative mb-3">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by title, author, or topic..."
                  className="block w-full pl-10 pr-10 py-3 border border-gray-700 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 bg-gray-800 text-white placeholder-gray-500"
                  autoFocus
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    <X className="h-4 w-4 text-gray-400 hover:text-white transition-colors" />
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider shrink-0">Category:</span>
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                        selectedCategory === cat 
                          ? 'bg-indigo-600 text-white' 
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider shrink-0">Last Episode:</span>
                  {DATE_FILTERS.map(filter => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setSelectedDateFilter(filter.value)}
                      className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                        selectedDateFilter === filter.value 
                          ? 'bg-indigo-600 text-white' 
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
            </form>

            {error && (
              <div className="mb-4 p-3 bg-red-900/30 text-red-400 rounded-xl text-sm border border-red-800/50 shrink-0">
                {error}
              </div>
            )}

            <div className="flex-1 overflow-y-auto min-h-[300px] -mx-2 px-2">
              {isSearching ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin mb-2" />
                  <p>Searching...</p>
                </div>
              ) : filteredResults.length > 0 ? (
                <div className="space-y-3">
                  {filteredResults.map(podcast => {
                    const isSubscribed = feeds.some(f => f.feedUrl === podcast.feedUrl);
                    const isFetching = isFetchingDetails === podcast.collectionId;
                    
                    return (
                    <div key={podcast.collectionId} className="bg-gray-900/50 border border-gray-800 rounded-xl p-3 flex gap-4 items-start relative">
                      {isFetching && (
                        <div className="absolute inset-0 bg-gray-900/50 rounded-xl z-10 flex items-center justify-center backdrop-blur-sm">
                          <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                        </div>
                      )}
                      <div 
                        className="w-20 h-20 shrink-0 cursor-pointer"
                        onClick={() => handlePodcastClick(podcast)}
                      >
                        <CachedImage 
                          src={podcast.artworkUrl600} 
                          alt={podcast.collectionName}
                          className="w-full h-full rounded-lg object-cover bg-gray-800"
                        />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div 
                          className="cursor-pointer mb-2"
                          onClick={() => handlePodcastClick(podcast)}
                        >
                          <h3 className="text-white font-bold text-sm leading-tight mb-1 line-clamp-2 hover:text-indigo-400 transition-colors">
                            {podcast.collectionName}
                            {podcast.collectionExplicitness === 'explicit' && (
                              <span className="inline-flex items-center justify-center ml-2 w-4 h-4 bg-gray-700 text-[9px] font-bold text-gray-300 rounded-sm" title="Explicit">
                                E
                              </span>
                            )}
                          </h3>
                          <p className="text-gray-400 text-xs truncate">
                            {podcast.artistName}
                            {podcast.trackCount ? ` • ${podcast.trackCount} eps` : ''}
                          </p>
                          {podcast.releaseDate && (
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              Last episode: {new Date(podcast.releaseDate).toLocaleDateString('it-IT')}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mb-3 cursor-pointer" onClick={() => handlePodcastClick(podcast)}>
                          {podcast.genres?.slice(0, 2).map(genre => (
                            <span key={genre} className="text-[10px] px-2 py-0.5 bg-gray-800 text-gray-300 rounded-full">
                              {genre}
                            </span>
                          ))}
                        </div>
                        
                        {!isSubscribed && (
                          <button
                            onClick={() => handleAdd(podcast.feedUrl, podcast.collectionId)}
                            disabled={addingId === podcast.collectionId}
                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                          >
                            {addingId === podcast.collectionId ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Plus className="w-4 h-4" />
                                Add Podcast
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )})}
                </div>
              ) : query && !isSearching ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <p>No podcasts found with these filters.</p>
                </div>
              ) : !query ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-600">
                  <Search className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm">Type to search for podcasts...</p>
                </div>
              ) : null}
            </div>
          </motion.div>
          
          <PodcastDetailsModal
            isOpen={!!selectedFeedDetails}
            onClose={() => setSelectedFeedDetails(null)}
            podcast={selectedFeedDetails}
            isSubscribed={selectedFeedDetails ? feeds.some(f => f.feedUrl === selectedFeedDetails.feedUrl) : false}
            onAdd={async (feedUrl) => {
              await addFeedOrSubreddit(feedUrl);
              if (onPodcastAdded) onPodcastAdded();
            }}
          />
        </>
      )}
    </AnimatePresence>
  );
});
