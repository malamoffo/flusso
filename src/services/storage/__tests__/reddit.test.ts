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

describe('parseRedditAtomComments', () => {
  const sampleCommentsAtom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>t3_post123</id>
    <author><name>/u/author_post</name></author>
    <title>Post Title</title>
  </entry>
  <entry>
    <id>t1_comm1</id>
    <author><name>/u/commenter_one</name></author>
    <title>/u/commenter_one on Post Title</title>
    <content type="html">&lt;!-- SC_OFF --&gt;&lt;div class="md"&gt;&lt;p&gt;First comment text&lt;/p&gt;&lt;/div&gt;&lt;!-- SC_ON --&gt;</content>
    <updated>2026-10-21T02:00:00+00:00</updated>
  </entry>
  <entry>
    <id>t1_comm2</id>
    <author><name>/u/commenter_two</name></author>
    <title>/u/commenter_two on Post Title</title>
    <content type="html">&lt;!-- SC_OFF --&gt;&lt;div class="md"&gt;&lt;p&gt;Second comment text&lt;/p&gt;&lt;/div&gt;&lt;!-- SC_ON --&gt;</content>
    <updated>2026-10-21T02:15:00+00:00</updated>
  </entry>
</feed>`;

  it('correctly parses Reddit comment entries into RedditComment objects', async () => {
    const { parseRedditAtomComments } = await import('../reddit');
    const comments = parseRedditAtomComments(sampleCommentsAtom);
    expect(comments).toHaveLength(2);
    expect(comments[0].kind).toBe('t1');
    expect(comments[0].data.id).toBe('comm1');
    expect(comments[0].data.author).toBe('commenter_one');
    expect(comments[0].data.body).toBe('First comment text');
    expect(comments[0].data.body_html).toContain('<p>First comment text</p>');
    expect(comments[1].data.id).toBe('comm2');
    expect(comments[1].data.author).toBe('commenter_two');
  });

  it('handles empty comments XML gracefully', async () => {
    const { parseRedditAtomComments } = await import('../reddit');
    const comments = parseRedditAtomComments('');
    expect(comments).toHaveLength(0);
  });

  it('correctly nests replies when in-reply-to references are present', async () => {
    const nestedAtom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:thr="http://purl.org/syndication/thread/1.0">
  <entry>
    <id>t3_parent_post</id>
  </entry>
  <entry>
    <id>t1_root1</id>
    <author><name>/u/root_user</name></author>
    <content type="html">&lt;div class="md"&gt;&lt;p&gt;Root comment&lt;/p&gt;&lt;/div&gt;</content>
  </entry>
  <entry>
    <id>t1_reply1</id>
    <author><name>/u/reply_user</name></author>
    <thr:in-reply-to ref="t1_root1"/>
    <content type="html">&lt;div class="md"&gt;&lt;p&gt;Nested reply&lt;/p&gt;&lt;/div&gt;</content>
  </entry>
</feed>`;
    const { parseRedditAtomComments } = await import('../reddit');
    const comments = parseRedditAtomComments(nestedAtom);
    expect(comments).toHaveLength(1);
    expect(comments[0].data.id).toBe('root1');
    expect(comments[0].data.replies.data.children).toHaveLength(1);
    expect(comments[0].data.replies.data.children[0].data.id).toBe('reply1');
    expect(comments[0].data.replies.data.children[0].data.author).toBe('reply_user');
  });

  it('correctly nests replies when parent is referenced via [parent] link in content', async () => {
    const parentLinkAtom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>t1_root99</id>
    <author><name>/u/first_user</name></author>
    <content type="html">&lt;div class="md"&gt;&lt;p&gt;Parent comment&lt;/p&gt;&lt;/div&gt;</content>
  </entry>
  <entry>
    <id>t1_reply99</id>
    <author><name>/u/second_user</name></author>
    <content type="html">&lt;div class="md"&gt;&lt;p&gt;Child reply&lt;/p&gt;&lt;/div&gt;&lt;a href="https://www.reddit.com/r/technology/comments/xyz/post/root99"&gt;[parent]&lt;/a&gt;</content>
  </entry>
</feed>`;
    const { parseRedditAtomComments } = await import('../reddit');
    const comments = parseRedditAtomComments(parentLinkAtom);
    expect(comments).toHaveLength(1);
    expect(comments[0].data.id).toBe('root99');
    expect(comments[0].data.replies.data.children).toHaveLength(1);
    expect(comments[0].data.replies.data.children[0].data.id).toBe('reply99');
    expect(comments[0].data.replies.data.children[0].data.author).toBe('second_user');
  });
});

