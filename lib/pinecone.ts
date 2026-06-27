import { Pinecone } from "@pinecone-database/pinecone";

const apiKey = process.env.PINECONE_API_KEY || "";
const indexName = process.env.PINECONE_INDEX || "rag-education";

export const getPineconeClient = () => {
  if (!apiKey) {
    throw new Error("PINECONE_API_KEY is not defined in your environment variables. Please add it to your .env file.");
  }
  return new Pinecone({ apiKey });
};

export const getPineconeIndex = () => {
  const pc = getPineconeClient();
  return pc.Index(indexName);
};

export async function upsertVectors(
  vectors: { id: string; values: number[]; metadata: Record<string, any> }[]
) {
  const index = getPineconeIndex();
  // Upsert vectors in Pinecone
  await index.upsert({ records: vectors });
}

export async function queryVectors(
  vector: number[],
  topK: number,
  sessionId: string
) {
  const index = getPineconeIndex();
  const queryResponse = await index.query({
    vector,
    topK,
    includeMetadata: true,
    filter: {
      sessionId: { $eq: sessionId },
    },
  });
  return queryResponse.matches || [];
}

export async function clearSessionVectors(sessionId: string) {
  const index = getPineconeIndex();
  try {
    // Delete vectors matching the sessionId metadata filter
    await index.deleteMany({
      filter: {
        sessionId: { $eq: sessionId },
      },
    });
  } catch (error) {
    console.error("Error clearing session vectors in Pinecone:", error);
  }
}
