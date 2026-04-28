import { GoogleGenAI } from "@google/genai";

// Initialize the API client. Prefer user-provided API_KEY, fallback to system GEMINI_API_KEY.
const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey! });

export const generateArticleContext = async (articleTitle: string, articleSnippet: string): Promise<string> => {
  try {
    const prompt = `Non riassumere questo articolo. Piuttosto fornisci esclusivamente i fatti precedenti, i pregressi e il contesto storico o politico che hanno portato a questa notizia, per aiutarmi a capire meglio la vicenda. Quali sono gli antefatti? Mantieni la risposta concisa (max 4-6 brevi frasi), adatta al colpo d'occhio su smartphone. Non usare parole come "contesto", "in breve" o testo in grassetto.\n\nTitolo: ${articleTitle}\n\nSnippet/Contenuto: ${articleSnippet}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    return response.text || "Nessun contesto disponibile.";
  } catch (error) {
    console.error("Errore durante la chiamata a Gemini:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Errore durante la generazione del contesto: ${errorMessage}`;
  }
};
