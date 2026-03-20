import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeft, ExternalLink, Share2, FileText, AlignLeft, Sparkles, X } from 'lucide-react';
import { Article, FullArticleContent } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useRss } from '../context/RssContext';
import { FastAverageColor } from 'fast-average-color';
import DOMPurify from 'dompurify';
import { GoogleGenAI } from "@google/genai";
import { CapacitorHttp } from '@capacitor/core';
import { Readability } from '@mozilla/readability';

interface ArticleReaderProps {
  article: Article;
  onClose: () => void;
}

export function ArticleReader({ article, onClose }: ArticleReaderProps) {
  const [fullContent, setFullContent] = useState<FullArticleContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [themeColor, setThemeColor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'full' | 'snippet'>('full');
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const { settings } = useRss();
  const imgRef = useRef<HTMLImageElement>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  const getProseSize = () => {
    switch (settings.fontSize) {
      case 'small': return 'prose-sm';
      case 'medium': return 'prose-base';
      case 'large': return 'prose-lg';
      case 'xlarge': return 'prose-xl';
      default: return 'prose-base';
    }
  };

  const getTitleSize = () => {
    switch (settings.fontSize) {
      case 'small': return 'text-xl';
      case 'medium': return 'text-2xl';
      case 'large': return 'text-3xl';
      case 'xlarge': return 'text-4xl';
      default: return 'text-2xl';
    }
  };

  const generateSummary = async (retries = 2) => {
    if (!fullContent?.content) return;
    setIsSummarizing(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Riassumi questo articolo in 3-5 frasi in italiano: ${fullContent.content}`,
      });
      setSummary(response.text || 'Nessun riassunto disponibile.');
    } catch (error) {
      console.error("Failed to generate summary", error);
      if (retries > 0) {
        await generateSummary(retries - 1);
      } else {
        setSummary('Impossibile generare il riassunto.');
      }
    } finally {
      setIsSummarizing(false);
    }
  };

  useEffect(() => {
    const fetchFullContent = async () => {
      try {
        setIsLoading(true);
        const isNative = (window as any).Capacitor?.isNativePlatform();
        let html = '';

        if (isNative) {
          console.log(`[READER] Native direct fetch: ${article.link}`);
          const response = await CapacitorHttp.get({ url: article.link });
          if (response.status === 200) {
            html = response.data;
          } else {
            throw new Error(`Failed to fetch article: ${response.status}`);
          }
        } else {
          console.log(`[READER] Web direct fetch (CORS restricted): ${article.link}`);
          const response = await fetch(article.link);
          if (response.ok) {
            html = await response.text();
          } else {
            throw new Error(`Failed to fetch article: ${response.status}`);
          }
        }

        if (html) {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const reader = new Readability(doc);
          const articleData = reader.parse();

          if (articleData) {
            setFullContent({
              title: articleData.title,
              content: articleData.content,
              textContent: articleData.textContent,
              length: articleData.length,
              excerpt: articleData.excerpt,
              byline: articleData.byline,
              dir: articleData.dir,
              siteName: articleData.siteName,
              lang: articleData.lang,
            });
          } else {
            setViewMode('snippet');
          }
        }
      } catch (error) {
        console.error('[READER] Error fetching full content:', error);
        setViewMode('snippet');
      } finally {
        setIsLoading(false);
      }
    };

    fetchFullContent();
  }, [article.link]);

  useEffect(() => {
    if (article.imageUrl) {
      const fac = new FastAverageColor();
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = article.imageUrl;
      img.onload = () => {
        try {
          const color = fac.getColor(img);
          setThemeColor(color.hex);
        } catch (e) {
          console.error("Failed to get image color", e);
        }
      };
    }
  }, [article.imageUrl]);

  const sanitizedContent = fullContent?.content ? DOMPurify.sanitize(fullContent.content, {
    ADD_ATTR: ['style'],
    ADD_TAGS: ['video', 'audio', 'source'],
  }) : '';

  const mediaElements = fullContent?.content ? new DOMParser().parseFromString(fullContent.content, 'text/html').querySelectorAll('video, audio') : [];
  const hasMedia = mediaElements.length > 0;

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-50 bg-white dark:bg-gray-950 overflow-y-auto overflow-x-hidden flex flex-col transition-colors break-words"
      style={themeColor ? { 
        backgroundColor: themeColor,
      } : {}}
    >
      <div 
        className="absolute inset-0 z-0 pointer-events-none"
        style={themeColor ? { 
          background: `radial-gradient(circle at 50% -20%, ${themeColor}40, transparent 70%), linear-gradient(to bottom, ${themeColor}10, transparent)`
        } : {}}
      />
      {/* Top App Bar */}
      <div 
        className="sticky top-0 z-10 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between transition-colors"
        style={themeColor ? { backgroundColor: `${themeColor}20`, borderBottomColor: `${themeColor}40` } : {}}
      >
        <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
          <ArrowLeft className="w-6 h-6 text-gray-800 dark:text-gray-200" />
        </button>
        <div className="flex items-center gap-2">
          <a 
            href={article.link} 
            target="_blank" 
            rel="noopener noreferrer"
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ExternalLink className="w-5 h-5 text-gray-800 dark:text-gray-200" />
          </a>
          <button 
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: article.title, url: article.link });
              }
            }}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Share2 className="w-5 h-5 text-gray-800 dark:text-gray-200" />
          </button>
        </div>
      </div>

      {/* Article Content */}
      <div className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <h1 className={`${getTitleSize()} font-bold text-gray-900 dark:text-white mb-4 leading-tight`}>
          <a href={article.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {article.title}
          </a>
        </h1>
        
        {article.imageUrl && !fullContent && (
          <img 
            src={article.imageUrl} 
            alt="" 
            className="w-full h-auto rounded-xl mb-6 object-cover"
            referrerPolicy="no-referrer"
          />
        )}

        {hasMedia && (
          <div className="mb-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Media</h3>
            {Array.from(mediaElements).map((el, i) => (
              <div key={i} className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                {el.tagName.toLowerCase() === 'video' ? (
                  <video src={(el as HTMLVideoElement).src} controls className="w-full" />
                ) : (
                  <audio src={(el as HTMLAudioElement).src} controls className="w-full" />
                )}
              </div>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4 animate-pulse mt-8">
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full"></div>
            <div className="h-40 bg-gray-200 dark:bg-gray-800 rounded w-full mt-6"></div>
          </div>
        ) : (viewMode === 'full' && fullContent?.content) ? (
          <div 
            className={`prose ${getProseSize()} prose-indigo dark:prose-invert max-w-full overflow-hidden
              prose-img:rounded-xl prose-img:w-full prose-img:object-cover prose-img:max-w-full
              prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-headings:font-bold
              prose-pre:max-w-full prose-pre:overflow-x-auto`}
            dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          />
        ) : article.contentSnippet && article.contentSnippet.trim().length > 0 ? (
          <div className={`prose ${getProseSize()} prose-indigo dark:prose-invert max-w-full overflow-hidden`}>
            <p>{article.contentSnippet}</p>
          </div>
        ) : (
          <div className={`prose ${getProseSize()} prose-indigo dark:prose-invert max-w-full overflow-hidden`}>
            <p>No content available.</p>
          </div>
        )}
      </div>

      {/* FABs */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-4 z-50">
        <button
          onClick={generateSummary}
          disabled={isSummarizing}
          className="p-4 bg-purple-600 text-white rounded-full shadow-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
          title="Gemini Summary"
        >
          {isSummarizing ? <Sparkles className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
        </button>
        <button
          onClick={() => setViewMode(viewMode === 'full' ? 'snippet' : 'full')}
          className="p-4 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-colors"
        >
          {viewMode === 'full' ? <AlignLeft className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
        </button>
      </div>

      {/* Summary Modal */}
      <AnimatePresence>
        {summary && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setSummary(null)}
          >
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Summary</h3>
                <button onClick={() => setSummary(null)} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{summary}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

