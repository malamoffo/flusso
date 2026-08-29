import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { RedditPost, RedditComment } from '../types';
import { ArrowLeft, MessageSquare, ChevronUp, ChevronDown } from 'lucide-react';
import { useReddit } from '../context/RedditContext';
import DOMPurify from 'dompurify';
import { format } from 'date-fns';
import { getSafeUrl } from '../lib/utils';
import { CachedImage } from './CachedImage';

interface RedditPostReaderProps {
  post: RedditPost;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  sourceFilter?: string;
}

const CommentNode: React.FC<{ comment: RedditComment; depth?: number; parentAuthor?: string }> = ({ comment, depth = 0, parentAuthor }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="mb-2 text-sm bg-[#1e162a]/60 backdrop-blur-md p-3.5 rounded-2xl border border-purple-500/15 shadow-sm">
      <div 
        className="flex items-center gap-2 mb-2 cursor-pointer hover:bg-white/5 p-1 rounded-lg transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className="font-medium text-purple-400 text-xs">
          u/{comment.author}
          {depth >= 3 && parentAuthor && (
            <span className="text-gray-500 font-normal text-[10px]">
              {' '}→ <span className="text-purple-300">u/{parentAuthor}</span>
            </span>
          )}
        </span>
        <span className="text-gray-500 text-[10px]">• {format(comment.createdUtc, 'HH:mm dd/MM/yy')}</span>
        <span className="text-gray-500 text-[10px]">• ↑ {comment.score}</span>
        <span className="text-gray-600 text-[10px] ml-auto">{isCollapsed ? '[+]' : '[-]'}</span>
      </div>
      {!isCollapsed && (
        <>
          <div 
            className="text-gray-300 reddit-comment-body pl-2 break-words text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.bodyHtml, { FORBID_ATTR: ['id', 'name'] }) }}
          />
          {comment.mediaUrls && comment.mediaUrls.length > 0 && (
            <div className="mt-2 pl-2 space-y-2">
              {comment.mediaUrls.map((url, idx) => (
                <div key={idx} className="relative max-w-full overflow-hidden rounded-xl border border-white/10">
                  <CachedImage 
                    src={getSafeUrl(url)} 
                    alt="Comment attachment" 
                    className="w-full h-auto object-contain max-h-[300px]"
                  />
                </div>
              ))}
            </div>
          )}
          {comment.replies && comment.replies.length > 0 && (
            <div className={`mt-4 ${depth < 3 ? 'pl-4 border-l-2 border-purple-500/20' : 'pl-2 border-l border-dashed border-purple-500/10'} space-y-4`}>
              {comment.replies.map((reply, rIdx) => (
                <CommentNode key={`reply-${reply.id || 'r'}-${rIdx}`} comment={reply} depth={depth + 1} parentAuthor={comment.author} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const RedditPostReader = ({ post, onClose, onNext, onPrev, hasNext, hasPrev, sourceFilter = 'reddit' }: RedditPostReaderProps) => {
  const controls = useDragControls();
  const [comments, setComments] = useState<RedditComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getCachedComments } = useReddit();

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [post.id]);

  useEffect(() => {
    const loadComments = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Try getting from cache first
        let rawComments = getCachedComments(post.permalink);
        
        // If not in cache, fetch it
        if (!rawComments) {
          const { storage } = await import('../services/storage');
          rawComments = await storage.fetchRedditComments(post.permalink);
        }

        if (!rawComments || rawComments.length === 0) {
           setError(null);
           setComments([]);
           return;
        }
        const extractMediaUrls = (data: any): string[] => {
          const urls: string[] = [];
          
          // 1. Check media_metadata (standard for Reddit's internal image/gif uploads in comments)
          if (data.media_metadata) {
            Object.values(data.media_metadata).forEach((item: any) => {
              if (item.status === 'valid') {
                const url = item.s?.u || item.s?.gif;
                if (url) urls.push(url.replace(/&amp;/g, '&'));
              }
            });
          }
          
          // 2. Check for image/gif/video links in the body text
          const bodyText = data.body || '';
          
          // Pattern for direct image links
          const directImageRegex = /https?:\/\/\S+?\.(?:png|jpg|jpeg|gif|webp)(?:\?\S+)?/gi;
          let match;
          while ((match = directImageRegex.exec(bodyText)) !== null) {
            const url = match[0];
            if (!urls.includes(url)) {
              urls.push(url);
            }
          }

          // Pattern for Giphy/Imgur links that don't end in the extension but are likely images
          const commonImageHosts = [
            /https?:\/\/giphy\.com\/gifs\/\S+?-(\w+)(?:\/\S+)?/gi,
            /https?:\/\/v\.redd\.it\/\w+/gi,
            /https?:\/\/i\.imgur\.com\/\w+/gi,
          ];

          commonImageHosts.forEach(regex => {
            let m;
            while ((m = regex.exec(bodyText)) !== null) {
              let url = m[0];
              // Transform Giphy links to direct gif if possible
              if (url.includes('giphy.com/gifs/')) {
                const id = m[1];
                if (id) {
                  url = `https://media.giphy.com/media/${id}/giphy.gif`;
                }
              }
              if (!urls.includes(url)) {
                urls.push(url);
              }
            }
          });
          
          return urls;
        };

        const parseComments = (children: any[], depth: number): RedditComment[] => {
          if (!Array.isArray(children)) return [];
          return children.map(child => {
            if (child.kind !== 't1') return null;
            const data = child.data;
            let replies: RedditComment[] = [];
            if (data.replies && data.replies.data && data.replies.data.children) {
              replies = parseComments(data.replies.data.children, depth + 1);
            }
            return {
              id: data.id,
              author: data.author,
              bodyHtml: data.body_html ? DOMPurify.sanitize(
                data.body_html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
                { FORBID_ATTR: ['id', 'name'] }
              ) : (data.body ? DOMPurify.sanitize(`<p>${data.body}</p>`, { FORBID_ATTR: ['id', 'name'] }) : ''),
              score: data.score,
              createdUtc: data.created_utc * 1000,
              depth,
              replies,
              mediaUrls: extractMediaUrls(data)
            };
          }).filter(Boolean) as RedditComment[];
        };

        setComments(parseComments(rawComments, 0));
      } catch (e) {
        console.error("Failed to load comments", e);
        setError("Error connecting to Reddit. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };
    
    loadComments();
  }, [post.permalink]);

  useEffect(() => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => { 
      document.body.style.overflow = '';
      document.body.style.paddingRight = ''; 
    };
  }, []);

  return (
    <motion.div 
      className="fixed inset-0 z-50 pointer-events-none transform-gpu"
      style={{ willChange: 'transform' }}
    >
      <motion.div 
        key="reddit-reader-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="fixed inset-0 bg-black/60 backdrop-blur-md pointer-events-auto"
        onClick={onClose}
      />
      <motion.article 
        key="reddit-reader-modal"
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 220 }}
        className="fixed inset-0 z-10 w-full h-full overflow-hidden flex flex-col transition-colors break-words font-sans bg-[#110b18] text-gray-100 scrollbar-hide pointer-events-auto isolate transform-gpu"
      >
        
        <header className="sticky top-0 z-20 px-4 py-4 flex items-center justify-between bg-gradient-to-b from-[#110b18]/90 via-[#110b18]/60 to-transparent backdrop-blur-md pointer-events-none">
          <button onClick={onClose} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-black/70 hover:bg-black border border-white/20 active:bg-white/20 text-white pointer-events-auto transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-black/70 hover:bg-black border border-white/20 active:bg-white/20 text-white transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronUp className="w-6 h-6" />
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-black/70 hover:bg-black border border-white/20 active:bg-white/20 text-white transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronDown className="w-6 h-6" />
            </button>
          </div>
        </header>

        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full pb-28 transform-gpu will-change-scroll scrollbar-hide"
        >
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.215, 0.61, 0.355, 1] }}
          className="mb-8 w-full"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3 reddit-post-meta-container">
            <span className="text-sm font-bold text-purple-400 drop-shadow-[0_0_5px_rgba(168,85,247,0.4)] truncate max-w-full">r/{post.subredditName}</span>
            <span className="text-xs text-gray-500 truncate max-w-full">• u/{post.author}</span>
            <span className="text-xs text-gray-500 whitespace-nowrap">• {format(post.createdUtc, 'HH:mm dd/MM/yy')}</span>
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-6 leading-snug tracking-tight" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.title, { FORBID_ATTR: ['id', 'name'] }) }} />
          
          {post.imageUrl && (
            <div className="w-full mb-6 overflow-hidden rounded-2xl border border-white/10 bg-black/40 flex items-center justify-center shadow-xl">
              <CachedImage 
                src={getSafeUrl(post.imageUrl)} 
                alt="" 
                className="w-full h-auto object-contain max-h-[75vh]" 
              />
            </div>
          )}
          
          {post.selftextHtml && (
            <div 
              className="text-gray-300 text-base sm:text-lg leading-relaxed reddit-post-body space-y-4 mb-6"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(
                post.selftextHtml.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
                { FORBID_ATTR: ['id', 'name'] }
              ) }}
            />
          )}

          <div className="flex items-center gap-6 mt-6 py-4 border-y border-white/10 text-sm font-medium text-gray-400">
            <span className="flex items-center gap-1.5 font-semibold text-white"><span className="text-purple-400 drop-shadow-[0_0_3px_rgba(168,85,247,0.6)] text-base">↑</span> {post.score}</span>
            <span className="flex items-center gap-1.5"><MessageSquare className="w-4 h-4 text-purple-400" /> {post.numComments} Comments</span>
          </div>
        </motion.div>

        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex justify-center py-8"
              >
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin shadow-[0_0_10px_rgba(168,85,247,0.4)]" />
              </motion.div>
            ) : error ? (
              <motion.div 
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="text-center py-8 px-4"
              >
                <p className="text-red-400 mb-2 font-medium">{error}</p>
                <button 
                  onClick={() => {
                     // Force a reload by clearing the cache entry if it failed
                     window.location.reload(); // Simple way to retry for now
                  }}
                  className="text-xs text-purple-400 underline"
                >
                  Retry
                </button>
              </motion.div>
            ) : comments.length > 0 ? (
              <motion.div 
                key="comments"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                {comments.map((comment, cIdx) => (
                  <CommentNode key={`comment-${comment.id || 'c'}-${cIdx}`} comment={comment} />
                ))}
              </motion.div>
            ) : (
              <motion.p 
                key="no-comments"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="text-center text-gray-500 py-8"
              >
                No comments yet.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.article>
    </motion.div>
  );
};
