// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseRedditAtom } from '../reddit';

describe('parseRedditAtom', () => {
  const sampleAtom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <category term="technology" label="r/technology"/>
  <updated>2026-10-20T06:40:00+00:00</updated>
  <entry>
    <author><name>/u/test_author</name></author>
    <category term="technology" label="r/technology"/>
    <content type="html">&lt;table&gt;&lt;tr&gt;&lt;td&gt;&lt;a href="https://www.reddit.com/r/technology/comments/123/test"&gt;&lt;img src="https://example.com/img.jpg"/&gt;&lt;/a&gt;&lt;/td&gt;&lt;td&gt;submitted by &lt;a href="/u/test_author"&gt;/u/test_author&lt;/a&gt;&lt;br/&gt;&lt;span&gt;&lt;a href="https://external.com/news"&gt;[link]&lt;/a&gt;&lt;/span&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;&lt;div class="md"&gt;&lt;p&gt;Test body content&lt;/p&gt;&lt;/div&gt;</content>
    <id>t3_123abc</id>
    <media:thumbnail url="https://example.com/thumb.jpg"/>
    <link href="https://www.reddit.com/r/technology/comments/123/test/"/>
    <updated>2026-10-20T06:30:00+00:00</updated>
    <published>2026-10-20T06:30:00+00:00</published>
    <title>Test Post Title &amp;amp; News</title>
  </entry>
</feed>`;

  it('correctly parses Reddit Atom XML entries into RedditPost objects', () => {
    const { posts, after } = parseRedditAtom(sampleAtom, 'technology');
    expect(posts).toHaveLength(1);
    expect(after).toBe('t3_123abc');

    const post = posts[0];
    expect(post.id).toBe('technology/123abc');
    expect(post.originalId).toBe('123abc');
    expect(post.title).toBe('Test Post Title & News');
    expect(post.author).toBe('test_author');
    expect(post.subredditName).toBe('technology');
    expect(post.permalink).toBe('/r/technology/comments/123/test/');
    expect(post.url).toBe('https://external.com/news');
    expect(post.imageUrl).toBe('https://example.com/thumb.jpg');
    expect(post.selftextHtml).toBe('<p>Test body content</p>');
    expect(post.createdUtc).toBe(new Date('2026-10-20T06:30:00+00:00').getTime());
  });

  it('handles empty or malformed XML gracefully', () => {
    const { posts, after } = parseRedditAtom('', 'technology');
    expect(posts).toHaveLength(0);
    expect(after).toBeUndefined();
  });
});
