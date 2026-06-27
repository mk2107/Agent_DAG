import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import { clearSessionVectors } from "@/lib/pinecone";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;

    const sessions = await prisma.ragSession.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(sessions);
  } catch (error: any) {
    console.error("Fetch sessions error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    // Verify that user owns the session
    const ragSession = await prisma.ragSession.findUnique({
      where: { id: sessionId },
    });

    if (!ragSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (ragSession.userId !== (session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delete vectors in Pinecone database
    await clearSessionVectors(sessionId);

    // Delete database record
    await prisma.ragSession.delete({
      where: { id: sessionId },
    });

    return NextResponse.json({ message: "Session deleted successfully" });
  } catch (error: any) {
    console.error("Delete session error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
