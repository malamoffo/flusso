import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.post("/api/gemini/context", async (req: Request, res: Response) => {
    try {
      const { title, snippet } = req.body;
      const apiKey = process.env.API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API key not configured" });
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Non riassumere questo articolo. Piuttosto fornisci esclusivamente i fatti precedenti, i pregressi e il contesto storico o politico che hanno portato a questa notizia, per aiutarmi a capire meglio la vicenda. Quali sono gli antefatti? Mantieni la risposta concisa (max 4-6 brevi frasi), adatta al colpo d'occhio su smartphone. Non usare parole come "contesto", "in breve" o testo in grassetto.\n\nTitolo: ${title}\n\nSnippet/Contenuto: ${snippet}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      res.json({ text: response.text || "Nessun contesto disponibile." });
    } catch (error) {
      console.error("Gemini API Error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: `Errore durante la generazione del contesto: ${errorMessage}` });
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
