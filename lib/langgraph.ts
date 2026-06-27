import { StateGraph, Annotation } from "@langchain/langgraph";
import { getEmbedding, getEmbeddingsBatch, generateText } from "./gemini";
import { upsertVectors, queryVectors } from "./pinecone";

// Recursive Character Text Splitter Implementation in TypeScript
export function recursiveCharacterSplitter(
  text: string,
  chunkSize: number,
  chunkOverlap: number
): string[] {
  const separators = ["\n\n", "\n", " ", ""];
  
  function split(txt: string, separatorsList: string[]): string[] {
    if (txt.length <= chunkSize) return [txt];
    
    const separator = separatorsList[0] !== undefined ? separatorsList[0] : "";
    const nextSeparators = separatorsList.slice(1);
    
    let parts: string[];
    if (separator === "") {
      parts = txt.split("");
    } else {
      parts = txt.split(separator);
    }
    
    let chunks: string[] = [];
    let currentChunk = "";
    
    for (const part of parts) {
      const candidate = currentChunk + (currentChunk && separator ? separator : "") + part;
      if (candidate.length <= chunkSize) {
        currentChunk = candidate;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        
        if (part.length > chunkSize) {
          if (nextSeparators.length > 0) {
            chunks.push(...split(part, nextSeparators));
          } else {
            chunks.push(part);
          }
          currentChunk = "";
        } else {
          currentChunk = part;
        }
      }
    }
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }
  
  const rawChunks = split(text, separators);
  
  // Apply overlap grouping
  const mergedChunks: string[] = [];
  for (let i = 0; i < rawChunks.length; i++) {
    let chunk = rawChunks[i];
    if (i > 0 && chunkOverlap > 0) {
      const prev = rawChunks[i - 1];
      const overlapText = prev.slice(-chunkOverlap);
      chunk = overlapText + chunk;
    }
    mergedChunks.push(chunk);
  }
  
  return mergedChunks;
}

// 1. Define LangGraph State Schema
export const GraphState = Annotation.Root({
  sessionId: Annotation<string>({ value: (x, y) => y, default: () => "" }),
  documentName: Annotation<string>({ value: (x, y) => y, default: () => "" }),
  documentText: Annotation<string>({ value: (x, y) => y, default: () => "" }),
  chunks: Annotation<string[]>({ value: (x, y) => y, default: () => [] }),
  embeddings: Annotation<number[][]>({ value: (x, y) => y, default: () => [] }),
  query: Annotation<string>({ value: (x, y) => y, default: () => "" }),
  queryVector: Annotation<number[]>({ value: (x, y) => y, default: () => [] }),
  retrievedContext: Annotation<{ text: string; score: number }[]>({ value: (x, y) => y, default: () => [] }),
  outputResponse: Annotation<string>({ value: (x, y) => y, default: () => "" }),
  currentNode: Annotation<string>({ value: (x, y) => y, default: () => "START" }),
  logs: Annotation<string[]>({
    value: (left, right) => left.concat(right),
    default: () => [],
  }),
  params: Annotation<{
    chunkSize: number;
    chunkOverlap: number;
    topK: number;
    promptTemplate: string;
  }>({
    value: (x, y) => ({ ...x, ...y }),
    default: () => ({
      chunkSize: 500,
      chunkOverlap: 50,
      topK: 3,
      promptTemplate: "Use the following context to answer the question. If you don't know, say you don't know.\n\nContext:\n{context}\n\nQuestion: {question}\n\nAnswer:"
    }),
  }),
});

// 2. Educational Nodes

// supervisorNode - Logs active routing
const supervisorNode = async (state: typeof GraphState.State) => {
  return {
    logs: [`[Supervisor] Routing check. Previous step completed: ${state.currentNode}`],
  };
};

// Ingestion Agent Node
const ingestionNode = async (state: typeof GraphState.State) => {
  const { sessionId, documentText, documentName, params } = state;
  const logs: string[] = [];
  
  logs.push(`[Ingestion] Starting document processing for: ${documentName}`);
  logs.push(`[Ingestion] Params: Chunk Size = ${params.chunkSize}, Overlap = ${params.chunkOverlap}`);
  
  // Step 1: Chunking
  logs.push(`[Ingestion] Running recursive character splitting...`);
  const splitChunks = recursiveCharacterSplitter(documentText, params.chunkSize, params.chunkOverlap);
  logs.push(`[Ingestion] Document divided into ${splitChunks.length} chunks.`);
  
  // Step 2: Embedding calculation (batching optimized)
  logs.push(`[Ingestion] Generating embeddings with Gemini 2.5 Flash (text-embedding-004)...`);
  const vectorList = await getEmbeddingsBatch(splitChunks);
  logs.push(`[Ingestion] Embeddings generated successfully (${vectorList.length} vectors).`);
  
  // Step 3: Vector database upsertion
  logs.push(`[Ingestion] Storing vectors in Pinecone Index...`);
  const pineconeVectors = vectorList.map((vec, idx) => ({
    id: `${sessionId}-chunk-${idx}`,
    values: vec,
    metadata: {
      sessionId,
      text: splitChunks[idx],
      index: idx,
    },
  }));
  
  await upsertVectors(pineconeVectors);
  logs.push(`[Ingestion] Pinecone storage complete.`);
  
  return {
    chunks: splitChunks,
    embeddings: vectorList,
    currentNode: "ingestion",
    logs,
  };
};

// Retrieval Agent Node
const retrievalNode = async (state: typeof GraphState.State) => {
  const { sessionId, query, params } = state;
  const logs: string[] = [];
  
  logs.push(`[Retrieval] Processing question: "${query}"`);
  
  // Step 1: Query embedding
  logs.push(`[Retrieval] Converting query to vector using Gemini 2.5 Flash...`);
  const queryVec = await getEmbedding(query);
  logs.push(`[Retrieval] Vector calculated.`);
  
  // Step 2: Similarity search in Pinecone
  logs.push(`[Retrieval] Performing similarity search in Pinecone (topK = ${params.topK})...`);
  const matches = await queryVectors(queryVec, params.topK, sessionId);
  logs.push(`[Retrieval] Found ${matches.length} matching text chunks.`);
  
  const retrieved = matches.map((match) => {
    const text = match.metadata?.text as string;
    const score = match.score || 0;
    logs.push(`  - Chunk Match (Score: ${score.toFixed(4)}): "${text.substring(0, 60)}..."`);
    return { text, score };
  });
  
  return {
    queryVector: queryVec,
    retrievedContext: retrieved,
    currentNode: "retrieval",
    logs,
  };
};

// Generation Agent Node
const generationNode = async (state: typeof GraphState.State) => {
  const { query, retrievedContext, params } = state;
  const logs: string[] = [];
  
  logs.push(`[Generation] Compiling RAG context and query prompt...`);
  
  const contextStr = retrievedContext.map((c) => c.text).join("\n\n---\n\n");
  const prompt = params.promptTemplate
    .replace("{context}", contextStr)
    .replace("{question}", query);
  
  logs.push(`[Generation] Sending prompt to Gemini 2.5 Flash...`);
  const answer = await generateText(prompt);
  logs.push(`[Generation] Generation complete. Answer synthesized.`);
  
  return {
    outputResponse: answer,
    currentNode: "generation",
    logs,
  };
};

// 3. Supervisor Routing Logic
const supervisorAgent = (state: typeof GraphState.State): "ingest" | "retrieve" | "generate" | "end" => {
  const { documentText, chunks, query, retrievedContext, outputResponse, currentNode } = state;
  
  // Ingest: Document uploaded but chunks empty
  if (documentText && chunks.length === 0 && currentNode === "START") {
    return "ingest";
  }
  
  // Retrieve: Chunks exist, query input, retrieved empty
  if (chunks.length > 0 && query && retrievedContext.length === 0 && (currentNode === "START" || currentNode === "ingestion")) {
    return "retrieve";
  }
  
  // Generate: Retrieval done, outputResponse empty
  if (retrievedContext.length > 0 && query && !outputResponse && currentNode === "retrieval") {
    return "generate";
  }
  
  return "end";
};

// 4. Construct and Compile StateGraph
const workflow = new StateGraph(GraphState)
  .addNode("supervisor", supervisorNode)
  .addNode("ingest", ingestionNode)
  .addNode("retrieve", retrievalNode)
  .addNode("generate", generationNode);

workflow.addEdge("__start__", "supervisor");

workflow.addConditionalEdges("supervisor", (state) => {
  const nextNode = supervisorAgent(state);
  return nextNode === "end" ? "__end__" : nextNode;
});

// Go to END after each node completes, providing the HITL inspection point
workflow.addEdge("ingest", "__end__");
workflow.addEdge("retrieve", "__end__");
workflow.addEdge("generate", "__end__");

export const compiledGraph = workflow.compile();
