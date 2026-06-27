import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY || "";

export const getGeminiClient = () => {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined in your environment variables. Please add it to your .env file.");
  }
  return new GoogleGenerativeAI(apiKey);
};

export async function generateText(prompt: string): Promise<string> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(prompt);
  return result.response.text() || "";
}

export async function getEmbedding(text: string): Promise<number[]> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values || [];
}

export async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
  
  const result = await model.batchEmbedContents({
    requests: texts.map((t) => ({
      content: { role: "user", parts: [{ text: t }] },
    })),
  });
  
  return result.embeddings.map((e) => e.values) || [];
}
