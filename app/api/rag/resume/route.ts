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

    const { sessionId, query, params, step } = await req.json();

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    // Load session details
    const ragSession = await prisma.ragSession.findUnique({
      where: { id: sessionId },
    });

    if (!ragSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    let graphState = JSON.parse(ragSession.state);

    // Apply parameter overrides if they are changed in UI controls
    if (params) {
      graphState.params = {
        ...graphState.params,
        ...params,
      };
      
      // Sync DB record fields
      await prisma.ragSession.update({
        where: { id: sessionId },
        data: {
          chunkSize: graphState.params.chunkSize,
          chunkOverlap: graphState.params.chunkOverlap,
          topK: graphState.params.topK,
          promptTemplate: graphState.params.promptTemplate,
        },
      });
    }

    // Handle re-triggering specific nodes
    if (step === "ingest") {
      // Re-initialize and run ingestion
      await clearSessionVectors(sessionId);
      graphState.chunks = [];
      graphState.embeddings = [];
      graphState.currentNode = "START";
      graphState.query = "";
      graphState.queryVector = [];
      graphState.retrievedContext = [];
      graphState.outputResponse = "";
      graphState.logs = [
        ...graphState.logs,
        `[System] Re-running Document Ingestion with Chunk Size = ${graphState.params.chunkSize}, Overlap = ${graphState.params.chunkOverlap}...`,
      ];
    } else if (step === "retrieve") {
      // Re-run retrieval (e.g. if query or topK changed)
      if (query !== undefined) {
        graphState.query = query;
      }
      graphState.currentNode = "ingestion"; // Set node pointer to route to retrieve
      graphState.queryVector = [];
      graphState.retrievedContext = [];
      graphState.outputResponse = "";
      graphState.logs = [
        ...graphState.logs,
        `[System] Re-running similarity retrieval for query: "${graphState.query}" (K = ${graphState.params.topK})...`,
      ];
    } else if (step === "generate") {
      // Re-run answer generation
      graphState.currentNode = "retrieval"; // Set node pointer to route to generate
      graphState.outputResponse = "";
      graphState.logs = [
        ...graphState.logs,
        `[System] Re-running Generation using updated prompt/parameters...`,
      ];
    } else if (query !== undefined && graphState.currentNode === "ingestion") {
      // Standard transition: Ingestion complete -> User inputs query -> Routes to Retrieval
      graphState.query = query;
      graphState.queryVector = [];
      graphState.retrievedContext = [];
      graphState.outputResponse = "";
      graphState.logs = [
        ...graphState.logs,
        `[System] Question submitted: "${query}". Resuming graph workflow...`,
      ];
    }

    // Invoke compiled LangGraph
    const finalState = await compiledGraph.invoke(graphState as any);

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
    console.error("Resume pipeline error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
