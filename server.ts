import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Request logger
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`[SERVER] ${req.method} ${req.url}`);
    next();
  });

  // API Status
  app.get("/api/health", (req: Request, res: Response) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // API routes
  app.post("/api/gemini/context", async (req: Request, res: Response) => {
    console.log("[SERVER] Received POST to /api/gemini/context");
    try {
      const { title, snippet } = req.body;
      
      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        console.error("[SERVER] Gemini API Key NOT FOUND in environment");
        return res.status(500).json({ error: "Gemini API key not configured on server" });
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Non riassumere questo articolo. Piuttosto fornisci esclusivamente i fatti precedenti, i pregressi e il contesto storico o politico che hanno portato a questa notizia, per aiutarmi a capire meglio la vicenda. Quali sono gli antefatti? Mantieni la risposta concisa (max 4-6 brevi frasi), adatta al colpo d'occhio su smartphone. Non usare parole come "contesto", "in breve" o testo in grassetto.\n\nTitolo: ${title}\n\nSnippet/Contenuto: ${snippet || ''}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      console.log("[SERVER] Gemini response generated successfully");
      res.json({ text: response.text || "Nessun contesto disponibile." });
    } catch (error) {
      console.error("[SERVER] Gemini API Error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: `Errore Gemini: ${errorMessage}` });
    }
  });

  // Catch-all for undefined API routes to prevent HTML response
  app.all("/api/*all", (req, res) => {
    console.log(`[SERVER] 404 on API route: ${req.method} ${req.url}`);
    res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
