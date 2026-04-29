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

const CommentNode: React.FC<{ comment: RedditComment }> = ({ comment }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="mb-3 text-sm">
      <div 
        className="flex items-center gap-2 mb-1 cursor-pointer hover:bg-gray-800 p-1 rounded"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className="font-medium text-purple-400 text-xs">u/{comment.author}</span>
        <span className="text-gray-500 text-[10px]">• {format(comment.createdUtc, 'HH:mm dd/MM/yy')}</span>
        <span className="text-gray-500 text-[10px]">• ↑ {comment.score}</span>
        <span className="text-gray-600 text-[10px] ml-auto">{isCollapsed ? '[+]' : '[-]'}</span>
      </div>
      {!isCollapsed && (
        <>
          <div 
            className="text-gray-300 reddit-comment-body"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.bodyHtml, { FORBID_ATTR: ['id', 'name'] }) }}
          />
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-2 pl-3 border-l-2 border-gray-800">
              {comment.replies.map(reply => (
                <CommentNode key={reply.id} comment={reply} />
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
              ) : '',
              score: data.score,
              createdUtc: data.created_utc * 1000,
              depth,
              replies
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
    <>
      <motion.div 
        key={`backdrop-${post.id}`}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed inset-0 bg-black z-[40]"
        onClick={onClose}
      />
      <motion.article 
        key={`modal-${post.id}`}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 z-50 h-[92vh] overflow-hidden flex flex-col transition-colors break-words font-sans bg-black rounded-t-[2.5rem] border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transform-gpu isolate"
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.1, bottom: 0.8 }}
        onDragEnd={(e, info) => {
          if (info.offset.y > 100 || info.velocity.y > 500) {
            onClose();
          }
        }}
      >
        <div 
          onPointerDown={(e) => controls.start(e)}
          className="absolute top-0 left-0 right-0 h-12 z-[60] cursor-grab active:cursor-grabbing flex items-center justify-center pointer-events-auto touch-none"
        >
          <div className="w-12 h-1.5 bg-white/20 rounded-full" />
        </div>
        
        <header className="sticky top-0 z-20 px-4 py-6 mt-4 flex items-center justify-between bg-gradient-to-b from-transparent to-transparent pointer-events-none">
          <button onClick={onClose} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-black border border-white/20 active:bg-white/20 text-white pointer-events-auto transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-black border border-white/20 active:bg-white/20 text-white transition-colors disabled:opacity-30"
            >
              <ChevronUp className="w-6 h-6" />
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-black border border-white/20 active:bg-white/20 text-white transition-colors disabled:opacity-30"
            >
              <ChevronDown className="w-6 h-6" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 max-w-3xl mx-auto w-full pb-20 transform-gpu will-change-scroll">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-bold text-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.4)]">r/{post.subredditName}</span>
            <span className="text-xs text-gray-500">• u/{post.author}</span>
            <span className="text-xs text-gray-500">• {format(post.createdUtc, 'HH:mm dd/MM/yy')}</span>
          </div>
          <h1 className="text-xl font-bold text-white mb-4" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.title, { FORBID_ATTR: ['id', 'name'] }) }} />
          
          {post.imageUrl && (
            <CachedImage src={getSafeUrl(post.imageUrl)} alt="" className="w-full rounded-xl mb-4" />
          )}
          
          {post.selftextHtml && (
            <div 
              className="text-gray-300 text-base leading-relaxed reddit-post-body"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(
                post.selftextHtml.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
                { FORBID_ATTR: ['id', 'name'] }
              ) }}
            />
          )}

          <div className="flex items-center gap-4 mt-4 py-3 border-y border-gray-800 text-sm font-medium text-gray-400">
            <span className="flex items-center gap-1"><span className="text-purple-400 shadow-[0_0_5px_rgba(168,85,247,0.6)]">↑</span> {post.score}</span>
            <span className="flex items-center gap-1"><MessageSquare className="w-4 h-4 text-purple-400" /> {post.numComments} Comments</span>
          </div>
        </div>

        <div className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin shadow-[0_0_10px_rgba(168,85,247,0.4)]" />
            </div>
          ) : error ? (
            <div className="text-center py-8 px-4">
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
            </div>
          ) : comments.length > 0 ? (
            comments.map(comment => (
              <CommentNode key={comment.id} comment={comment} />
            ))
          ) : (
            <p className="text-center text-gray-500 py-8">No comments yet.</p>
          )}
        </div>
      </div>
    </motion.article>
    </>
  );
};
