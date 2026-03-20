import express from "express";
import cors from "cors";
import Parser from "rss-parser";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { createServer as createViteServer } from "vite";
import path from "path";
import he from "he";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  const parser = new Parser({
    customFields: {
      item: ["media:content", "media:thumbnail", "description"],
    },
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/feed", async (req, res) => {
    const feedUrl = req.query.url as string;
    console.log(`[API] Fetching feed: ${feedUrl}`);
    try {
      if (!feedUrl) {
        return res.status(400).json({ error: "Missing feed URL" });
      }
      
      const response = await fetch(feedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "application/rss+xml, application/xml, text/xml, */*"
        },
        signal: AbortSignal.timeout(30000)
      });
      
      if (!response.ok) {
        console.warn(`[API] Source returned ${response.status} for ${feedUrl}`);
        return res.status(response.status).json({ error: `Source returned ${response.status}` });
      }
      
      let xml = await response.text();
      console.log(`[API] Received XML for ${feedUrl}, length: ${xml.length}`);
      
      // Basic XML cleaning to handle common malformed feed issues
      // 1. Remove control characters that are invalid in XML
      xml = xml.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
      
      // 2. Fix unescaped ampersands (common in many feeds)
      // This regex looks for & not followed by a valid entity
      xml = xml.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[a-f\d]+);)/gi, "&amp;");

      let feed;
      try {
        feed = await parser.parseString(xml);
      } catch (parseError) {
        console.warn(`Standard parsing failed for ${feedUrl}, attempting JSDOM fallback...`);
        try {
          const dom = new JSDOM(xml, { contentType: "text/xml" });
          const doc = dom.window.document;
          
          const channel = doc.querySelector("channel");
          const feedTitle = channel?.querySelector("title")?.textContent || doc.querySelector("feed > title")?.textContent || "Untitled Feed";
          const feedDescription = channel?.querySelector("description")?.textContent || doc.querySelector("feed > subtitle")?.textContent || "";
          const feedLink = channel?.querySelector("link")?.textContent || doc.querySelector("feed > link[rel='alternate']")?.getAttribute("href") || doc.querySelector("feed > link")?.textContent || "";
          
          const items = Array.from(doc.querySelectorAll("item, entry")).map(item => {
            const title = item.querySelector("title")?.textContent || "";
            const link = item.querySelector("link")?.getAttribute("href") || item.querySelector("link")?.textContent || "";
            const content = item.querySelector("content\\:encoded, content, description, summary")?.textContent || "";
            const pubDate = item.querySelector("pubDate, published, updated")?.textContent || "";
            const guid = item.querySelector("guid, id")?.textContent || "";
            const creator = item.querySelector("dc\\:creator, author > name")?.textContent || "";
            
            return {
              title,
              link,
              content,
              contentSnippet: content.replace(/<[^>]*>/g, "").substring(0, 200),
              pubDate,
              isoDate: pubDate ? new Date(pubDate).toISOString() : undefined,
              guid,
              creator
            };
          });
          
          feed = {
            title: feedTitle,
            description: feedDescription,
            link: feedLink,
            items
          };
        } catch (fallbackError) {
          console.error(`JSDOM fallback also failed for ${feedUrl}:`, fallbackError);
          throw parseError; // Re-throw original error if fallback also fails
        }
      }
      
      feed = {
        title: feed.title || "Untitled Feed",
        description: feed.description || "",
        link: feed.link || feedUrl,
        items: feed.items || []
      };

      console.log(`[API] Successfully parsed ${feedUrl}, items: ${feed.items.length}`);
      
      // Decode HTML entities in feed items
      if (feed.items) {
        feed.items = feed.items.map(item => ({
          ...item,
          title: item.title ? he.decode(item.title) : item.title,
          contentSnippet: item.contentSnippet ? he.decode(item.contentSnippet) : item.contentSnippet,
          description: item.description ? he.decode(item.description) : item.description,
        }));
      }
      
      try {
        const jsonResponse = JSON.stringify(feed);
        console.log(`[API] Sending JSON response for ${feedUrl}, length: ${jsonResponse.length}, items: ${feed.items?.length || 0}`);
        res.setHeader('Content-Type', 'application/json');
        res.send(jsonResponse);
      } catch (jsonError) {
        console.error(`[API] Error serializing JSON for ${feedUrl}:`, jsonError);
        res.status(500).json({ error: "Failed to serialize JSON response", details: jsonError instanceof Error ? jsonError.message : String(jsonError) });
      }
    } catch (error) {
      console.error(`Error parsing feed ${req.query.url}:`, error);
      res.status(500).json({ error: "Failed to parse feed", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/article", async (req, res) => {
    try {
      const articleUrl = req.query.url as string;
      if (!articleUrl) {
        return res.status(400).json({ error: "Missing article URL" });
      }
      
      const response = await fetch(articleUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });
      
      const html = await response.text();
      const doc = new JSDOM(html, { url: articleUrl });
      const reader = new Readability(doc.window.document);
      const article = reader.parse();
      
      if (article) {
        article.title = he.decode(article.title);
      }
      
      res.json(article);
    } catch (error) {
      console.error("Error fetching article:", error);
      res.status(500).json({ error: "Failed to fetch article" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
