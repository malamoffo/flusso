import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RedditPost, RedditComment } from '../types';
import { ArrowLeft, ExternalLink, MessageSquare, ChevronUp, ChevronDown, Share2 } from 'lucide-react';
import { storage } from '../services/storage';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
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

export const RedditPostReader = ({ post, onClose, onNext, onPrev, hasNext, hasPrev }: RedditPostReaderProps) => {
  const [comments, setComments] = useState<RedditComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadComments = async () => {
      setIsLoading(true);
      try {
        const rawComments = await storage.fetchRedditComments(post.permalink);
        
        const parseComments = (children: any[], depth: number): RedditComment[] => {
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
      } finally {
        setIsLoading(false);
      }
    };
    
    loadComments();
  }, [post.permalink]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
    >
      <header className="flex items-center justify-between p-4 border-b border-gray-800 bg-black/80 backdrop-blur-md z-10">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-800 text-gray-300 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="p-2 rounded-full hover:bg-gray-800 text-gray-300 transition-colors disabled:opacity-30"
          >
            <ChevronUp className="w-6 h-6" />
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="p-2 rounded-full hover:bg-gray-800 text-gray-300 transition-colors disabled:opacity-30"
          >
            <ChevronDown className="w-6 h-6" />
          </button>
          <button
            onClick={async () => {
              const shareData = {
                title: post.title,
                text: post.title,
                url: `https://reddit.com${post.permalink}`,
              };

              try {
                if (Capacitor.isNativePlatform()) {
                  await Share.share({
                    ...shareData,
                    dialogTitle: 'Condividi post'
                  });
                } else if (navigator.share) {
                  await navigator.share(shareData);
                } else {
                  await navigator.clipboard.writeText(`${post.title}\n${shareData.url}`);
                }
              } catch (err) {
                console.error('Error sharing:', err);
              }
            }}
            className="p-2 rounded-full hover:bg-gray-800 text-gray-300 transition-colors"
            title="Share post"
          >
            <Share2 className="w-5 h-5" />
          </button>
          <a
            href={`https://reddit.com${post.permalink}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-full hover:bg-gray-800 text-gray-300 transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full">
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
          ) : comments.length > 0 ? (
            comments.map(comment => (
              <CommentNode key={comment.id} comment={comment} />
            ))
          ) : (
            <p className="text-center text-gray-500 py-8">No comments yet.</p>
          )}
        </div>
      </div>
    </motion.div>
  );
};
