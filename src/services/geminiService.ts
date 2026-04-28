export const generateArticleContext = async (articleTitle: string, articleSnippet: string): Promise<string> => {
  try {
    const response = await fetch("/api/gemini/context", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: articleTitle,
        snippet: articleSnippet,
      }),
    });

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error("Non-JSON response received:", text.substring(0, 100));
      throw new Error(`Risposta del server non valida (HTML invece di JSON). Stato: ${response.status}`);
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Errore nella chiamata API");
    }

    const data = await response.json();
    return data.text || "Nessun contesto disponibile.";
  } catch (error) {
    console.error("Errore durante la chiamata a Gemini:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Errore durante la generazione del contesto: ${errorMessage}`;
  }
};
