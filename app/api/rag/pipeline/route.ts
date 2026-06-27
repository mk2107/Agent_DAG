import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import { compiledGraph } from "@/lib/langgraph";
import { clearSessionVectors } from "@/lib/pinecone";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { documentName, documentText, params } = await req.json();

    if (!documentText) {
      return NextResponse.json({ error: "Document text is required" }, { status: 400 });
    }

    // Create a new active educational session
    const ragSession = await prisma.ragSession.create({
      data: {
        userId,
        documentName,
        documentText,
        chunkSize: params?.chunkSize || 500,
        chunkOverlap: params?.chunkOverlap || 50,
        topK: params?.topK || 3,
        promptTemplate: params?.promptTemplate || "Use the following context to answer the question. If you don't know, say you don't know.\n\nContext:\n{context}\n\nQuestion: {question}\n\nAnswer:",
        state: "{}",
        currentNode: "START",
      },
    });

    const sessionId = ragSession.id;

    // Clear old Pinecone vectors for this session
    await clearSessionVectors(sessionId);

    // Build the initial state schema for LangGraph
    const initialState = {
      sessionId,
      documentName,
      documentText,
      chunks: [],
      embeddings: [],
      query: "",
      queryVector: [],
      retrievedContext: [],
      outputResponse: "",
      currentNode: "START",
      logs: [`[System] Initialized new RAG session: ${sessionId}`],
      params: {
        chunkSize: ragSession.chunkSize,
        chunkOverlap: ragSession.chunkOverlap,
        topK: ragSession.topK,
        promptTemplate: ragSession.promptTemplate,
      },
    };

    // Run the graph (START -> supervisor -> ingest -> END)
    const finalState = await compiledGraph.invoke(initialState as any);

    // Save final output state to DB
    await prisma.ragSession.update({
      where: { id: sessionId },
      data: {
        state: JSON.stringify(finalState),
        currentNode: finalState.currentNode,
      },
    });

    return NextResponse.json({
      sessionId,
      state: finalState,
    });
  } catch (error: any) {
    console.error("Pipeline initialization error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
