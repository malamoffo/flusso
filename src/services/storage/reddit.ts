import { db } from '../db';
import { Subreddit, RedditPost } from '../../types';
import { fetchWithProxy } from '../../utils/proxy';
import { Capacitor } from '@capacitor/core';
import { isNative } from '../../utils/platform';
import he from 'he';

export function parseRedditAtom(xmlString: string, defaultSubreddit: string): { posts: RedditPost[], after?: string } {
  try {
    const parser = new DOMParser();
    let doc = parser.parseFromString(xmlString, 'text/xml');
    
    if (doc.getElementsByTagName('parsererror').length > 0) {
      doc = parser.parseFromString(xmlString, 'text/html');
    }

    let entries = Array.from(doc.getElementsByTagName('entry'));
    if (entries.length === 0) {
      entries = Array.from(doc.getElementsByTagNameNS('*', 'entry'));
    }
    if (entries.length === 0 && doc.querySelectorAll) {
      entries = Array.from(doc.querySelectorAll('entry'));
    }
    if (entries.length === 0) {
      return { posts: [] };
    }

    let lastEntryId: string | undefined = undefined;
    const posts: RedditPost[] = [];

    for (const entry of entries) {
      const idEl = entry.getElementsByTagName('id')[0] || entry.getElementsByTagNameNS('*', 'id')[0];
      const rawId = idEl?.textContent?.trim() || '';
      const originalId = rawId.replace(/^t3_/, '').replace(/^.*?:t3_/, '');
      lastEntryId = rawId || (originalId ? `t3_${originalId}` : undefined);

      const titleEl = entry.getElementsByTagName('title')[0] || entry.getElementsByTagNameNS('*', 'title')[0];
      const rawTitle = titleEl?.textContent?.trim() || 'Senza titolo';
      const title = he.decode(rawTitle);

      const authorEl = entry.getElementsByTagName('author')[0] || entry.getElementsByTagNameNS('*', 'author')[0];
      const nameEl = authorEl ? (authorEl.getElementsByTagName('name')[0] || authorEl.getElementsByTagNameNS('*', 'name')[0]) : null;
      const rawAuthor = nameEl?.textContent || authorEl?.textContent || '';
      const author = rawAuthor.replace(/^\/?u\//i, '').trim() || 'reddit_user';

      const catEl = entry.getElementsByTagName('category')[0] || entry.getElementsByTagNameNS('*', 'category')[0];
      const subName = (catEl?.getAttribute('term') || defaultSubreddit).replace(/^r\//i, '').trim();

      const linkEl = entry.getElementsByTagName('link')[0] || entry.getElementsByTagNameNS('*', 'link')[0];
      const permalinkUrl = linkEl?.getAttribute('href') || '';

      const publishedEl = entry.getElementsByTagName('published')[0] || 
                          entry.getElementsByTagName('updated')[0] ||
                          entry.getElementsByTagNameNS('*', 'published')[0] || 
                          entry.getElementsByTagNameNS('*', 'updated')[0];
      const publishedStr = publishedEl?.textContent || '';
      let createdUtc = publishedStr ? new Date(publishedStr).getTime() : Date.now();
      if (isNaN(createdUtc)) createdUtc = Date.now();

      let imageUrl: string | undefined = undefined;
      const mediaThumb = entry.getElementsByTagName('media:thumbnail')[0] || entry.getElementsByTagNameNS('*', 'thumbnail')[0];
      if (mediaThumb) {
        const thumbUrl = mediaThumb.getAttribute('url');
        if (thumbUrl && !thumbUrl.includes('default') && !thumbUrl.includes('self')) {
          imageUrl = thumbUrl;
        }
      }

      const contentEl = entry.getElementsByTagName('content')[0] || entry.getElementsByTagNameNS('*', 'content')[0];
      const contentHtml = contentEl?.textContent || '';
      
      let permalink = '';
      let outboundUrl = permalinkUrl;
      let selftextHtml: string | undefined = undefined;

      if (contentHtml) {
        // In Reddit Atom XML, the comments permalink is explicitly tagged with [comments]
        const commentsMatch = contentHtml.match(/<a\s+href="([^"]+)">\[comments\]<\/a>/i);
        if (commentsMatch && commentsMatch[1]) {
          try {
            const parsed = new URL(he.decode(commentsMatch[1]));
            permalink = parsed.pathname;
          } catch {
            permalink = he.decode(commentsMatch[1]);
          }
        }

        const linkMatch = contentHtml.match(/<a\s+href="([^"]+)">\[link\]<\/a>/i);
        if (linkMatch && linkMatch[1]) {
          outboundUrl = he.decode(linkMatch[1]);
        }

        if (!imageUrl) {
          const imgMatch = contentHtml.match(/<img[^>]+src="([^">]+)"/i);
          if (imgMatch && imgMatch[1]) {
            imageUrl = he.decode(imgMatch[1]);
          }
        }

        const selftextMatch = contentHtml.match(/<div class="md">([\s\S]*?)<\/div>/i);
        if (selftextMatch && selftextMatch[1]) {
          selftextHtml = selftextMatch[1];
        }
      }

      if (!permalink && permalinkUrl) {
        try {
          const parsed = new URL(permalinkUrl);
          permalink = parsed.pathname;
        } catch {
          permalink = permalinkUrl;
        }
      }

      if (!permalink && originalId) {
        permalink = `/r/${subName}/comments/${originalId}/`;
      }

      let numComments = 0;
      const commentCountMatch = contentHtml.match(/([0-9,]+)\s+comments?/i) ||
                                title.match(/\(([0-9,]+)\s+comments?\)/i) ||
                                contentHtml.match(/\[([0-9,]+)\s+comments?\]/i);
      if (commentCountMatch && commentCountMatch[1]) {
        numComments = parseInt(commentCountMatch[1].replace(/,/g, ''), 10) || 0;
      }

      posts.push({
        id: `${subName}/${originalId || rawId || crypto.randomUUID()}`,
        originalId: originalId || rawId,
        title,
        author,
        subredditId: `sub_${subName.toLowerCase()}`,
        subredditName: subName,
        permalink,
        url: outboundUrl,
        imageUrl: imageUrl ? he.decode(imageUrl) : undefined,
        createdUtc,
        score: 1,
        numComments,
        selftextHtml,
        isRead: 0,
        isFavorite: 0
      });
    }

    return { posts, after: lastEntryId };
  } catch (err) {
    console.error('Failed to parse Reddit Atom XML:', err);
    return { posts: [] };
  }
}

export function parseRedditAtomComments(xmlString: string): any[] {
  if (!xmlString || typeof xmlString !== 'string') return [];
  try {
    const parser = new DOMParser();
    let doc = parser.parseFromString(xmlString, 'text/xml');
    
    if (doc.getElementsByTagName('parsererror').length > 0) {
      doc = parser.parseFromString(xmlString, 'text/html');
    }

    let entries = Array.from(doc.getElementsByTagName('entry'));
    if (entries.length === 0) {
      entries = Array.from(doc.getElementsByTagNameNS('*', 'entry'));
    }
    if (entries.length === 0 && doc.querySelectorAll) {
      entries = Array.from(doc.querySelectorAll('entry'));
    }
    if (entries.length === 0) {
      return [];
    }

    const comments: any[] = [];
    const commentMap = new Map<string, any>();

    for (const entry of entries) {
      const idEl = entry.getElementsByTagName('id')[0] || entry.getElementsByTagNameNS('*', 'id')[0];
      const rawId = idEl?.textContent?.trim() || '';
      // Skip the post entry itself (t3_) or feed id
      if (rawId.startsWith('t3_') || rawId.includes('.rss') || !rawId) {
        continue;
      }

      const id = rawId.replace(/^t1_/, '').replace(/^.*?:t1_/, '');
      const authorEl = entry.getElementsByTagName('author')[0] || entry.getElementsByTagNameNS('*', 'author')[0];
      const nameEl = authorEl ? (authorEl.getElementsByTagName('name')[0] || authorEl.getElementsByTagNameNS('*', 'name')[0]) : null;
      const rawAuthor = nameEl?.textContent || authorEl?.textContent || '';
      const author = rawAuthor.replace(/^\/?u\//i, '').trim() || '[deleted]';

      const contentEl = entry.getElementsByTagName('content')[0] || entry.getElementsByTagNameNS('*', 'content')[0];
      const rawContent = contentEl?.textContent || contentEl?.innerHTML || '';
      let bodyHtml = rawContent;
      let body = '';

      if (rawContent) {
        const mdMatch = rawContent.match(/<div class="md">([\s\S]*?)<\/div>/i);
        if (mdMatch && mdMatch[1]) {
          bodyHtml = mdMatch[1];
        }
        try {
          const temp = document.createElement('div');
          temp.innerHTML = bodyHtml;
          body = temp.textContent || temp.innerText || '';
        } catch {
          body = bodyHtml.replace(/<[^>]+>/g, '');
        }
      }

      const publishedEl = entry.getElementsByTagName('published')[0] || 
                          entry.getElementsByTagName('updated')[0] ||
                          entry.getElementsByTagNameNS('*', 'published')[0] || 
                          entry.getElementsByTagNameNS('*', 'updated')[0];
      const publishedStr = publishedEl?.textContent || '';
      let createdUtc = publishedStr ? Math.floor(new Date(publishedStr).getTime() / 1000) : Math.floor(Date.now() / 1000);
      if (isNaN(createdUtc)) createdUtc = Math.floor(Date.now() / 1000);

      const inReplyToEl = entry.getElementsByTagName('thr:in-reply-to')[0] ||
                          entry.getElementsByTagName('in-reply-to')[0] ||
                          entry.getElementsByTagNameNS('*', 'in-reply-to')[0];
      let inReplyTo = inReplyToEl?.getAttribute('ref') || undefined;
      if (inReplyTo) {
        inReplyTo = inReplyTo.replace(/^t1_/, '').replace(/^.*?:t1_/, '');
      }

      const commentNode = {
        kind: 't1',
        data: {
          id: id || crypto.randomUUID(),
          author,
          score: 1,
          created_utc: createdUtc,
          body: body.trim(),
          body_html: bodyHtml,
          parent_id: inReplyTo,
          replies: {
            data: {
              children: []
            }
          }
        }
      };

      commentMap.set(commentNode.data.id, commentNode);
      comments.push(commentNode);
    }

    // Build hierarchical replies if parent references are present
    const topLevel: any[] = [];
    for (const c of comments) {
      const pid = c.data.parent_id;
      if (pid && commentMap.has(pid)) {
        commentMap.get(pid).data.replies.data.children.push(c);
      } else {
        topLevel.push(c);
      }
    }

    return topLevel.length > 0 ? topLevel : comments;
  } catch (err) {
    console.error('Failed to parse Reddit comments Atom XML:', err);
    return [];
  }
}

export const redditStorage = {
   isImgurUrl(url: string): boolean {
    try {
      const { hostname } = new URL(url);
      return hostname === 'imgur.com' || hostname.endsWith('.imgur.com');
    } catch {
      return false;
    }
  },
  async fetchJsonWithProxy(url: string, signal?: AbortSignal, etag?: string, lastModified?: string): Promise<{ data: any, etag?: string, lastModified?: string } | null> {
    const response = await fetchWithProxy(url, false, undefined, signal, etag, lastModified);
    
    if (response.data === '') {
      return {
        data: null,
        etag: response.etag || etag,
        lastModified: response.lastModified || lastModified
      };
    }

    if (!response.data || response.data.trim() === '') return null;
    
    let trimmed = response.data.trim();
    
    const firstBrace = trimmed.indexOf('{');
    const firstBracket = trimmed.indexOf('[');
    let startIndex = -1;
    
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIndex = firstBrace;
    } else if (firstBracket !== -1) {
      startIndex = firstBracket;
    }
    
    if (startIndex === -1) {
      throw new Error(`Invalid JSON response (starts with ${trimmed.substring(0, 5)}). The service might be temporarily unavailable via proxy.`);
    }
    
    if (startIndex > 0) {
      trimmed = trimmed.substring(startIndex);
    }
    
    try {
      return {
        data: JSON.parse(trimmed),
        etag: response.etag,
        lastModified: response.lastModified
      };
    } catch (e) {
      console.error(`Failed to parse JSON from ${url}:`, e);
      throw new Error(`Malformed JSON response from ${url}`);
    }
  },

  async getSubreddits(): Promise<Subreddit[]> {
    return await db.subreddits.toArray();
  },

  async saveSubreddits(subs: Subreddit[]): Promise<void> {
    await db.subreddits.bulkPut(subs);
  },

  async getRedditPosts(offset = 0, limit = 0): Promise<RedditPost[]> {
    let query = db.redditPosts.orderBy('createdUtc').reverse();
    if (limit > 0) {
      return await query.offset(offset).limit(limit).toArray();
    }
    return await query.toArray();
  },

  async saveRedditPosts(posts: RedditPost[]): Promise<void> {
    const normalized = posts.map(p => ({
      ...p,
      isRead: p.isRead ? 1 : 0,
      isFavorite: p.isFavorite ? 1 : 0
    }));
    await db.redditPosts.bulkPut(normalized as RedditPost[]);
  },

  async updateRedditPost(id: string, updates: Partial<RedditPost>): Promise<void> {
    const normalizedUpdates: any = { ...updates };
    if ('isRead' in normalizedUpdates) normalizedUpdates.isRead = normalizedUpdates.isRead ? 1 : 0;
    if ('isFavorite' in normalizedUpdates) normalizedUpdates.isFavorite = normalizedUpdates.isFavorite ? 1 : 0;
    await db.redditPosts.update(id, normalizedUpdates);
  },

  async markRedditPostsAsRead(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    await db.transaction('rw', db.redditPosts, async () => {
      for (const id of ids) {
        await db.redditPosts.update(id, { isRead: 1 });
      }
    });
  },

  async addSubreddit(name: string): Promise<Subreddit | null> {
    try {
      let cleanName = name.trim();
      const lowerName = cleanName.toLowerCase();
      if (lowerName.includes('reddit.com/r/')) {
        cleanName = cleanName.split(/reddit\.com\/r\//i)[1].split('/')[0];
      } else if (lowerName.startsWith('r/')) {
        cleanName = cleanName.substring(2);
      }
      cleanName = cleanName.replace(/[^a-zA-Z0-9_]/g, '');

      if (!cleanName) return null;

      let displayName = cleanName;
      let iconUrl: string | undefined = undefined;

      // 1. Try checking Reddit via RSS (works without API key/OAuth)
      try {
        const rssUrl = `https://www.reddit.com/r/${cleanName}/.rss`;
        const res = await fetchWithProxy(rssUrl, true);
        if (res.data && (res.data.includes('<feed') || res.data.includes('<entry'))) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(res.data, 'text/xml');
          const title = doc.getElementsByTagName('title')[0]?.textContent;
          if (title) displayName = title.replace(/^r\//i, '').trim() || cleanName;
          const logo = doc.getElementsByTagName('logo')[0]?.textContent || doc.getElementsByTagName('icon')[0]?.textContent;
          if (logo) iconUrl = logo;
        }
      } catch (err) {
        // Fallback to about.json if possible
        try {
          const url = `https://www.reddit.com/r/${cleanName}/about.json`;
          const result = await this.fetchJsonWithProxy(url);
          if (result && result.data && result.data.data) {
            const subData = result.data.data;
            displayName = subData.display_name || cleanName;
            let rawIcon = subData.icon_img || subData.community_icon || undefined;
            if (rawIcon) {
              iconUrl = he.decode(rawIcon.split('?')[0]);
            }
          }
        } catch {
          // Keep default cleanName
        }
      }

      const newSub: Subreddit = {
        id: `sub_${cleanName.toLowerCase()}`,
        name: displayName || cleanName,
        iconUrl,
        addedAt: Date.now(),
      };

      const subs = await this.getSubreddits();
      const lowerNewName = newSub.name.toLowerCase();
      if (!subs.some(s => s.name.toLowerCase() === lowerNewName)) {
        subs.push(newSub);
        await this.saveSubreddits(subs);
      }

      return newSub;
    } catch (e) {
      console.error('Failed to add subreddit:', e);
      return null;
    }
  },

  async getLocalPostsForSubreddit(subredditName: string): Promise<RedditPost[]> {
    try {
      const allPosts = await db.redditPosts.toArray();
      const target = subredditName.toLowerCase().trim();
      const filtered = allPosts.filter(p => 
        (p.subredditName && p.subredditName.toLowerCase() === target) ||
        (p.id && p.id.toLowerCase().startsWith(`${target}/`))
      );
      if (filtered.length > 0) return filtered;
      return allPosts;
    } catch {
      return [];
    }
  },

  async fetchSubredditPosts(subredditName: string, sinceDate?: number, after?: string, sort: 'new' | 'hot' | 'top' = 'new'): Promise<RedditPost[]> {
    const res = await this.fetchRedditPosts(subredditName, sort, after);
    if (sinceDate) {
      return res.posts.filter(p => p.createdUtc > sinceDate);
    }
    return res.posts;
  },

  async fetchRedditPosts(subredditName: string, sort: 'new' | 'hot' | 'top' = 'new', after?: string, signal?: AbortSignal): Promise<{posts: RedditPost[], after?: string}> {
    try {
      if (signal?.aborted) return { posts: [] };

      const subreddits = await this.getSubreddits();
      const subreddit = subreddits.find(s => s.name.toLowerCase() === subredditName.toLowerCase());

      // 1. Primary Strategy: Reddit JSON API (provides real num_comments and scores)
      try {
        let url = `https://www.reddit.com/r/${subredditName}/${sort}.json?limit=25`;
        if (after) {
          const cursor = after.startsWith('t3_') ? after : `t3_${after}`;
          url += `&after=${cursor}`;
        }
        const result = await this.fetchJsonWithProxy(url, signal, subreddit?.etag, subreddit?.lastModified);
        if (result && result.data && result.data.data && result.data.data.children && result.data.data.children.length > 0) {
          if (subreddit) {
            subreddit.etag = result.etag;
            subreddit.lastModified = result.lastModified;
            subreddit.lastFetched = Date.now();
            await this.saveSubreddits(subreddits);
          }
          const posts = result.data.data.children.map((child: any) => {
            const post = child.data;
            let imageUrl = undefined;
            if (post.preview && post.preview.images && post.preview.images.length > 0) {
              imageUrl = post.preview.images[0].source.url;
            } else if (post.url && (post.url.match(/\.(jpg|jpeg|png|gif|webp)$/) || this.isImgurUrl(post.url))) {
              imageUrl = post.url;
            } else if (post.thumbnail && post.thumbnail.startsWith('http')) {
              imageUrl = post.thumbnail;
            }

            return {
              id: `${post.subreddit}/${post.id}`,
              originalId: post.id,
              title: he.decode(post.title),
              author: post.author,
              subredditId: post.subreddit_id,
              subredditName: post.subreddit,
              permalink: post.permalink,
              url: post.url,
              imageUrl: imageUrl ? he.decode(imageUrl) : undefined,
              createdUtc: post.created_utc * 1000,
              score: typeof post.score === 'number' ? post.score : 1,
              numComments: typeof post.num_comments === 'number' ? post.num_comments : 0,
              selftextHtml: post.selftext_html ? he.decode(post.selftext_html) : undefined,
              isRead: 0,
              isFavorite: 0
            };
          });
          return { posts, after: result.data.data.after };
        }
      } catch (jsonErr: any) {
        if (signal?.aborted || jsonErr?.name === 'AbortError' || jsonErr?.message?.includes('aborted') || jsonErr?.message?.includes('Aborted')) {
          return { posts: [] };
        }
        // If JSON is blocked, gracefully fall back to Atom/RSS
      }

      // 2. Secondary Strategy: Reddit's Atom/RSS feed (Public, reliable, NOT blocked with 403)
      try {
        const cursor = after ? (after.startsWith('t3_') ? after : `t3_${after}`) : undefined;
        const rssUrl = `https://www.reddit.com/r/${subredditName}/${sort}.rss?limit=25${cursor ? `&after=${cursor}` : ''}`;
        
        const rssRes = await fetchWithProxy(rssUrl, true, undefined, signal, subreddit?.etag, subreddit?.lastModified);
        if (rssRes.data && (rssRes.data.includes('<entry') || rssRes.data.includes('<feed'))) {
          const parsed = parseRedditAtom(rssRes.data, subredditName);
          if (parsed.posts.length > 0) {
            // Preserve known scores & comment counts from local database
            const existingLocalPosts = await this.getLocalPostsForSubreddit(subredditName);
            const existingMap = new Map(existingLocalPosts.map(p => [p.id, p]));
            parsed.posts = parsed.posts.map(p => {
              const existing = existingMap.get(p.id);
              if (existing) {
                return {
                  ...p,
                  score: Math.max(p.score || 0, existing.score || 0),
                  numComments: Math.max(p.numComments || 0, existing.numComments || 0),
                  isRead: existing.isRead,
                  isFavorite: existing.isFavorite
                };
              }
              return p;
            });

            if (subreddit) {
              subreddit.etag = rssRes.etag;
              subreddit.lastModified = rssRes.lastModified;
              subreddit.lastFetched = Date.now();
              await this.saveSubreddits(subreddits);
            }
            return parsed;
          }
        }
      } catch (rssErr: any) {
        if (signal?.aborted || rssErr?.name === 'AbortError' || rssErr?.message?.includes('aborted') || rssErr?.message?.includes('Aborted')) {
          return { posts: [] };
        }
        console.warn(`RSS fetch for r/${subredditName} did not succeed`, rssErr?.message || rssErr);
      }

      // 3. Fallback: Return locally stored/mock posts for this subreddit
      const localPosts = await this.getLocalPostsForSubreddit(subredditName);
      if (localPosts.length > 0) {
        return { posts: localPosts };
      }
      return { posts: [] };
    } catch (e: any) {
      if (signal?.aborted || e?.name === 'AbortError' || e?.message?.includes('aborted') || e?.message?.includes('Aborted')) {
        return { posts: [] };
      }
      const localPosts = await this.getLocalPostsForSubreddit(subredditName);
      return { posts: localPosts };
    }
  },

  async fetchRedditComments(permalink: string): Promise<any[]> {
    try {
      if (!permalink || permalink.includes('/mock') || permalink === 'mock') {
        const now = Math.floor(Date.now() / 1000);

        if (permalink && permalink.includes('mock_20_levels')) {
          // Generate 20 levels of consecutively nested replies
          let innerComment: any = null;

          for (let lvl = 20; lvl >= 1; lvl--) {
            const parentAuthor = lvl > 1 ? `dev_livello_${lvl - 1}` : undefined;
            const commentObj: any = {
              id: `mock_20_c_${lvl}`,
              author: `dev_livello_${lvl}`,
              score: Math.max(1, 65 - lvl * 2),
              created_utc: now - (21 - lvl) * 120,
              body: `Questo è il commento al Livello ${lvl} di profondità della discussione.${lvl > 3 ? " Oltre il 3° commento l'indentatura è interrotta: la larghezza rimane costante e leggibile al 100%." : " Questo commento è ancora nei primi 3 livelli e presenta la classica indentazione a sinistra."}${parentAuthor ? ` (In risposta a u/${parentAuthor})` : ''}`,
              body_html: `<p>Questo è il commento al <strong>Livello ${lvl}</strong> di profondità.${lvl > 3 ? " <span class='text-purple-300'>Notare come l'indentatura non aumenti ulteriormente</span>, garantendo massima leggibilità e spazio per il testo." : " Livello ad indentazione progressiva."}</p>`,
              replies: innerComment ? {
                data: {
                  children: [
                    {
                      kind: 't1',
                      data: innerComment
                    }
                  ]
                }
              } : ''
            };
            innerComment = commentObj;
          }

          return [
            {
              kind: 't1',
              data: innerComment
            },
            {
              kind: 't1',
              data: {
                id: 'mock_20_c_side',
                author: 'osservatore_ux',
                score: 24,
                created_utc: now - 300,
                body: 'Confermo: con questa impostazione i thread molto profondi non collassano più in una colonna microscopica!',
                body_html: '<p>Confermo: con questa impostazione i thread molto profondi non collassano più in una colonna microscopica!</p>'
              }
            }
          ];
        }

        return [
          {
            kind: 't1',
            data: {
              id: 'mock_c1',
              author: 'scienza_fan',
              score: 34,
              created_utc: now - 1800,
              body: 'Discussione molto interessante! Grazie per la condivisione.',
              body_html: '<p>Discussione molto interessante! Grazie per la condivisione.</p>',
              replies: {
                data: {
                  children: [
                    {
                      kind: 't1',
                      data: {
                        id: 'mock_c1_1',
                        author: 'curioso_dev',
                        score: 12,
                        created_utc: now - 900,
                        body: 'Concordo, ci sono ulteriori approfondimenti utili nella documentazione ufficiale.',
                        body_html: '<p>Concordo, ci sono ulteriori approfondimenti utili nella documentazione ufficiale.</p>'
                      }
                    }
                  ]
                }
              }
            }
          },
          {
            kind: 't1',
            data: {
              id: 'mock_c2',
              author: 'utente_reddit',
              score: 8,
              created_utc: now - 600,
              body: 'Seguo volentieri i futuri aggiornamenti su questo argomento.',
              body_html: '<p>Seguo volentieri i futuri aggiornamenti su questo argomento.</p>'
            }
          }
        ];
      }

      // Extract postId and normalize cleanPath
      let cleanPath = (permalink || '').trim().replace(/^https?:\/\/(?:[a-zA-Z0-9_-]+\.)?reddit\.com/i, '');
      cleanPath = cleanPath.split('?')[0].split('#')[0];
      if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
      cleanPath = cleanPath.replace(/\/+$/, '');

      const postIdMatch = cleanPath.match(/\/comments\/([a-zA-Z0-9_]+)/i) || permalink.match(/\/comments\/([a-zA-Z0-9_]+)/i);
      const postId = postIdMatch ? postIdMatch[1] : '';

      // 1. Strategy A: Reddit comments Atom/RSS feed (Public, reliable, no API key required)
      const rssUrlsToTry: string[] = [];
      if (postId) {
        rssUrlsToTry.push(`https://www.reddit.com/comments/${postId}/.rss`);
      }
      rssUrlsToTry.push(`https://www.reddit.com${cleanPath}/.rss`);
      rssUrlsToTry.push(`https://www.reddit.com${cleanPath}.rss`);

      for (const rssUrl of rssUrlsToTry) {
        try {
          const rssResponse = await fetchWithProxy(rssUrl, true);
          if (rssResponse.data && (rssResponse.data.includes('<entry') || rssResponse.data.includes('<feed'))) {
            const parsed = parseRedditAtomComments(rssResponse.data);
            if (parsed && parsed.length > 0) {
              return parsed;
            }
          }
        } catch {
          // Try next RSS candidate
        }
      }

      // 2. Strategy B: Reddit JSON endpoint
      const jsonUrlsToTry: string[] = [];
      if (postId) {
        jsonUrlsToTry.push(`https://www.reddit.com/comments/${postId}.json`);
      }
      jsonUrlsToTry.push(`https://www.reddit.com${cleanPath}.json`);

      for (const jsonUrl of jsonUrlsToTry) {
        try {
          const result = await this.fetchJsonWithProxy(jsonUrl);
          if (result && result.data && Array.isArray(result.data) && result.data.length >= 2 && result.data[1].data && result.data[1].data.children && result.data[1].data.children.length > 0) {
            // Also update post comments count from result.data[0] if available
            try {
              const postData = result.data[0]?.data?.children?.[0]?.data;
              if (postData && typeof postData.num_comments === 'number' && postId) {
                const subreddits = await this.getSubreddits();
                for (const sub of subreddits) {
                  const dbPostId = `${sub.name}/${postId}`;
                  await this.updateRedditPostCommentsCount(dbPostId, postData.num_comments);
                }
              }
            } catch {}
            return result.data[1].data.children;
          }
        } catch {
          // Try next JSON candidate
        }
      }

      // 3. Strategy C: Scraping fallback (supports both modern shreddit-comment and classic markup)
      const htmlUrlsToTry: string[] = [];
      if (postId) {
        htmlUrlsToTry.push(`https://www.reddit.com/comments/${postId}`);
      }
      htmlUrlsToTry.push(`https://www.reddit.com${cleanPath}`);

      for (const htmlUrl of htmlUrlsToTry) {
        try {
          const response = await fetchWithProxy(htmlUrl, false);
          if (response.data) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(response.data, 'text/html');
            
            const comments: any[] = [];
            
            // Modern Reddit web components
            const shredditComments = doc.querySelectorAll('shreddit-comment');
            if (shredditComments.length > 0) {
              shredditComments.forEach((el, idx) => {
                const author = el.getAttribute('author') || 'unknown';
                const score = parseInt(el.getAttribute('score') || '1', 10);
                const bodyEl = el.querySelector('[slot="comment"]') || el.querySelector('.md');
                const bodyHtml = bodyEl ? bodyEl.innerHTML : '';
                const bodyText = bodyEl ? (bodyEl.textContent || '') : '';
                if (bodyText.trim().length > 0) {
                  comments.push({
                    kind: 't1',
                    data: {
                      id: el.getAttribute('thingid') || `scraped_${idx}`,
                      author: author.replace(/^u\//, ''),
                      score: isNaN(score) ? 1 : score,
                      created_utc: Math.floor(Date.now() / 1000),
                      body: bodyText.trim(),
                      body_html: bodyHtml || `<p>${bodyText.trim()}</p>`,
                      replies: { data: { children: [] } }
                    }
                  });
                }
              });
              if (comments.length > 0) return comments;
            }

            // Classic Reddit HTML selectors
            const commentSelectors = ['.comment', 'div[data-testid="comment"]'];
            let commentElements: Element[] = [];
            for (const selector of commentSelectors) {
               const elements = doc.querySelectorAll(selector);
               if (elements.length > 0) {
                  commentElements = Array.from(elements);
                  break;
               }
            }
            
            commentElements.forEach((el, idx) => {
               const author = el.querySelector('.author')?.textContent 
                           || el.getAttribute('author') 
                           || 'unknown';
               const body = el.querySelector('.md')?.textContent 
                          || (el as HTMLElement).innerText
                          || '';
               if (body.trim().length > 0) {
                 comments.push({
                   kind: 't1',
                   data: {
                     id: `scraped_${idx}`,
                     author: author.replace(/^u\//, ''),
                     score: 1,
                     created_utc: Math.floor(Date.now() / 1000),
                     body: body.trim(),
                     body_html: `<p>${body.trim()}</p>`,
                     replies: { data: { children: [] } }
                   }
                 });
               }
            });

            if (comments.length > 0) return comments;
          }
        } catch {}
      }

      return [];
    } catch (e: any) {
      console.warn(`[Reddit Comments] Unable to retrieve comments for: ${permalink}`);
      return [];
    }
  },

  async updateRedditPostCommentsCount(postId: string, count: number): Promise<void> {
    try {
      await db.redditPosts.update(postId, { numComments: count });
    } catch (e) {
      console.warn('Failed to update reddit post comments count:', e);
    }
  },
  
  async cleanupOldRedditPosts(retentionDays: number = 3): Promise<void> {
    try {
      const retentionMs = (retentionDays || 3) * 24 * 60 * 60 * 1000;
      const now = Date.now();
      
      const posts = await this.getRedditPosts();
      
      // 1. Orphaned posts cleanup (subreddits no longer in list)
      const subreddits = await this.getSubreddits();
      const validSubNames = new Set(subreddits.map(s => s.name.toLowerCase()));
      const orphanedPosts = posts.filter(p => !validSubNames.has((p.subredditName || '').toLowerCase()) && !p.isFavorite);
      
      if (posts.length <= 5 && orphanedPosts.length === 0) return;

      // 2. Retention-based cleanup
      const oldPosts = posts
        .filter(p => {
          if (p.isFavorite) return false;
          if (!validSubNames.has((p.subredditName || '').toLowerCase())) return false;
          const postUtc = (p.createdUtc || 0) < 10000000000 ? (p.createdUtc || 0) * 1000 : (p.createdUtc || 0);
          return (now - postUtc) > retentionMs;
        })
        .sort((a, b) => {
          const aUtc = (a.createdUtc || 0) < 10000000000 ? (a.createdUtc || 0) * 1000 : (a.createdUtc || 0);
          const bUtc = (b.createdUtc || 0) < 10000000000 ? (b.createdUtc || 0) * 1000 : (b.createdUtc || 0);
          return bUtc - aUtc;
        }); // Newest first
      
      let idsToDelete: string[] = orphanedPosts.map(p => p.id);
      
      if (oldPosts.length > 0) {
        const postsToKeep = 5;
        const postsAfterCleanup = posts.length - oldPosts.length - orphanedPosts.length;
        
        if (postsAfterCleanup < postsToKeep) {
          const numberToRemove = oldPosts.length - (postsToKeep - postsAfterCleanup);
          if (numberToRemove > 0) {
            idsToDelete = [...idsToDelete, ...oldPosts.slice(oldPosts.length - numberToRemove).map(p => p.id)];
          }
        } else {
          idsToDelete = [...idsToDelete, ...oldPosts.map(p => p.id)];
        }
      }

      if (idsToDelete.length > 0) {
        await db.redditPosts.bulkDelete(idsToDelete);
      }
    } catch (e) {
      console.error('Failed to cleanup old reddit posts:', e);
    }
  },

  async removeSubreddit(id: string): Promise<void> {
    if (!id) return;
    await db.subreddits.delete(id);
    const posts = await db.redditPosts.where('subredditId').equals(id).toArray();
    const idsToDelete = posts.map(p => p.id);
    await db.redditPosts.bulkDelete(idsToDelete);
  }
};
