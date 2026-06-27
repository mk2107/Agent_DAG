"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Cpu,
  Layers,
  Database,
  Search,
  MessageSquare,
  Play,
  RotateCcw,
  Sparkles,
  Terminal,
  Settings,
  HelpCircle,
  FileText,
  AlertTriangle,
  History,
  Trash2
} from "lucide-react";

interface Match {
  text: string;
  score: number;
}

interface RagState {
  sessionId: string;
  documentName: string;
  documentText: string;
  chunks: string[];
  embeddings: number[][];
  query: string;
  queryVector: number[];
  retrievedContext: Match[];
  outputResponse: string;
  currentNode: string;
  logs: string[];
  params: {
    chunkSize: number;
    chunkOverlap: number;
    topK: number;
    promptTemplate: string;
  };
}

export default function Dashboard() {
  const { status } = useSession();
  const router = useRouter();

  // Authentication Redirect
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/dashboard");
    }
  }, [status, router]);

  // Session & Past Sessions state
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [currentState, setCurrentState] = useState<RagState | null>(null);

  // Ingestion inputs
  const [docName, setDocName] = useState("");
  const [docText, setDocText] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);

  // Parameter states (tweakable in sidebar)
  const [chunkSize, setChunkSize] = useState(500);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [topK, setTopK] = useState(3);
  const [promptTemplate, setPromptTemplate] = useState(
    "Use the following context to answer the question. If you don't know, say you don't know.\n\nContext:\n{context}\n\nQuestion: {question}\n\nAnswer:"
  );

  // Parameter Change detection flags
  const [paramChangeRequired, setParamChangeRequired] = useState(false);

  // Dashboard Tab state (Inspector)
  const [activeInspectorTab, setActiveInspectorTab] = useState<"chunks" | "embeddings" | "similarity" | "json">("chunks");
  // Console Tab state (Console vs System Logs)
  const [activeConsoleTab, setActiveConsoleTab] = useState<"chat" | "logs">("chat");

  // Query state
  const [userQuery, setUserQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Scrolling anchor
  const logsEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch past sessions
  const fetchSessions = async () => {
    try {
      const res = await fetch("/api/rag/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessionsList(data);
      }
    } catch (err) {
      console.error("Error fetching sessions:", err);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchSessions();
    }
  }, [status]);

  // Scroll to bottom on updates
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentState?.logs, activeConsoleTab]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentState?.outputResponse, activeConsoleTab]);

  // Load a session
  const handleSelectSession = (sessionRecord: any) => {
    setActiveSessionId(sessionRecord.id);
    const parsedState = JSON.parse(sessionRecord.state);
    setCurrentState(parsedState);
    
    // Sync sidebar controls
    setChunkSize(parsedState.params.chunkSize);
    setChunkOverlap(parsedState.params.chunkOverlap);
    setTopK(parsedState.params.topK);
    setPromptTemplate(parsedState.params.promptTemplate);
    setParamChangeRequired(false);
  };

  // Delete a session
  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this session? This will clear all Pinecone vectors.")) return;

    try {
      const res = await fetch(`/api/rag/sessions?sessionId=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (activeSessionId === id) {
          setActiveSessionId("");
          setCurrentState(null);
        }
        fetchSessions();
      }
    } catch (err) {
      console.error("Delete session error:", err);
    }
  };

  // Check if chunk params changed (requires re-ingestion)
  useEffect(() => {
    if (currentState) {
      const sizeDiff = chunkSize !== currentState.params.chunkSize;
      const overlapDiff = chunkOverlap !== currentState.params.chunkOverlap;
      setParamChangeRequired(sizeDiff || overlapDiff);
    }
  }, [chunkSize, chunkOverlap, currentState]);

  // Ingest Document Handler
  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docText.trim()) return;

    setIsIngesting(true);
    setCurrentState(null);

    const name = docName.trim() || "pasted-document.txt";

    try {
      const res = await fetch("/api/rag/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentName: name,
          documentText: docText,
          params: {
            chunkSize,
            chunkOverlap,
            topK,
            promptTemplate,
          },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(`Error starting pipeline: ${errorData.error}`);
        setIsIngesting(false);
        return;
      }

      const data = await res.json();
      setActiveSessionId(data.sessionId);
      setCurrentState(data.state);
      setDocName("");
      setDocText("");
      fetchSessions();
    } catch (err) {
      console.error(err);
      alert("An unexpected error occurred during ingestion.");
    } finally {
      setIsIngesting(false);
    }
  };

  // Re-run Ingestion step
  const handleReIngest = async () => {
    if (!currentState) return;
    setIsProcessing(true);

    try {
      const res = await fetch("/api/rag/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId,
          step: "ingest",
          params: {
            chunkSize,
            chunkOverlap,
            topK,
            promptTemplate,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentState(data.state);
        setParamChangeRequired(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 2: Retrieve Context from Pinecone
  const handleRetrieve = async () => {
    if (!currentState || !userQuery.trim()) return;
    setIsProcessing(true);
    setActiveConsoleTab("logs");

    try {
      const res = await fetch("/api/rag/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId,
          query: userQuery,
          params: {
            topK,
            promptTemplate,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentState(data.state);
        setActiveInspectorTab("similarity");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 3: Generate Response using Gemini
  const handleGenerate = async () => {
    if (!currentState) return;
    setIsProcessing(true);
    setActiveConsoleTab("logs");

    try {
      const res = await fetch("/api/rag/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId,
          step: "generate",
          params: {
            promptTemplate,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentState(data.state);
        setActiveConsoleTab("chat");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Full Fast-Forward helper (run retrieval and generation automatically)
  const handleAskAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentState || !userQuery.trim() || isProcessing) return;

    setIsProcessing(true);
    setActiveConsoleTab("logs");

    try {
      // 1. Run Retrieval
      let res = await fetch("/api/rag/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId,
          query: userQuery,
          params: { topK, promptTemplate },
        }),
      });

      if (!res.ok) throw new Error("Retrieval failed");
      let data = await res.json();
      setCurrentState(data.state);

      // 2. Run Generation immediately after
      res = await fetch("/api/rag/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId,
          step: "generate",
          params: { promptTemplate },
        }),
      });

      if (!res.ok) throw new Error("Generation failed");
      data = await res.json();
      setCurrentState(data.state);
      setUserQuery("");
      setActiveConsoleTab("chat");
    } catch (err: any) {
      alert(`Pipeline error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="auth-container">
        <div className="glass-panel auth-card" style={{ textAlign: "center", padding: "3rem" }}>
          <h2>Loading Session...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Sidebar Controls */}
      <aside className="sidebar-panel">
        <div className="sidebar-title">
          <Settings size={18} style={{ color: "var(--color-accent)" }} />
          <span>Interactive Parameters</span>
        </div>

        {/* Chunk Size */}
        <div className="param-group">
          <div className="param-header">
            <span className="param-label">Chunk Size (characters)</span>
            <span className="param-value">{chunkSize}</span>
          </div>
          <input
            type="range"
            min="100"
            max="1200"
            step="50"
            value={chunkSize}
            onChange={(e) => setChunkSize(Number(e.target.value))}
            className="slider-input"
            disabled={isIngesting || isProcessing}
          />
          <span className="param-hint">Determines text window length for embedding vectors.</span>
        </div>

        {/* Chunk Overlap */}
        <div className="param-group">
          <div className="param-header">
            <span className="param-label">Chunk Overlap</span>
            <span className="param-value">{chunkOverlap}</span>
          </div>
          <input
            type="range"
            min="0"
            max="300"
            step="10"
            value={chunkOverlap}
            onChange={(e) => setChunkOverlap(Number(e.target.value))}
            className="slider-input"
            disabled={isIngesting || isProcessing}
          />
          <span className="param-hint">Overlap size between consecutive chunks to retain semantic context.</span>
        </div>

        {/* Top-K Similarity */}
        <div className="param-group">
          <div className="param-header">
            <span className="param-label">Top-K Nearest Neighbors</span>
            <span className="param-value">{topK}</span>
          </div>
          <input
            type="range"
            min="1"
            max="6"
            step="1"
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
            className="slider-input"
            disabled={isIngesting || isProcessing}
          />
          <span className="param-hint">Number of context chunks returned from Pinecone.</span>
        </div>

        {/* Prompt Template */}
        <div className="param-group">
          <label className="param-label" htmlFor="promptTemplate">
            Prompt Synthesis Template
          </label>
          <textarea
            id="promptTemplate"
            className="textarea-field"
            value={promptTemplate}
            onChange={(e) => setPromptTemplate(e.target.value)}
            style={{ fontSize: "0.8rem", minHeight: "100px" }}
            disabled={isIngesting || isProcessing}
          />
          <span className="param-hint">Must contain `{`{context}`}` and `{`{question}`}` tags.</span>
        </div>

        {/* Sync Indicator warning */}
        {paramChangeRequired && (
          <div className="error-banner" style={{ margin: 0, padding: "0.5rem" }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: "0.75rem" }}>
              Chunking changed.
              <button
                onClick={handleReIngest}
                className="btn btn-accent"
                style={{
                  padding: "0.15rem 0.4rem",
                  fontSize: "0.7rem",
                  marginLeft: "0.5rem",
                  display: "inline-flex"
                }}
              >
                Re-embed
              </button>
            </div>
          </div>
        )}

        {/* Session History section */}
        <div className="sidebar-title" style={{ marginTop: "1rem" }}>
          <History size={18} style={{ color: "var(--color-primary)" }} />
          <span>RAG Workshops</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            maxHeight: "180px",
            overflowY: "auto"
          }}
        >
          {sessionsList.length === 0 ? (
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "1rem" }}>
              No active sessions. Upload below!
            </span>
          ) : (
            sessionsList.map((s) => (
              <div
                key={s.id}
                onClick={() => handleSelectSession(s)}
                style={{
                  padding: "0.5rem 0.75rem",
                  background: activeSessionId === s.id ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.02)",
                  border: "1px solid",
                  borderColor: activeSessionId === s.id ? "var(--color-primary)" : "rgba(255,255,255,0.05)",
                  borderRadius: "8px",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.8rem",
                  transition: "var(--transition-smooth)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", overflow: "hidden" }}>
                  <FileText size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                    {s.documentName || "document.txt"}
                  </span>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(e, s.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer"
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-error)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Canvas Workspace */}
      <main className="workspace-canvas">
        {/* Node Graph Flow Component */}
        <section className="glass-panel graph-display-card">
          <div className="card-title">
            <Cpu size={18} style={{ color: "var(--color-accent)" }} />
            <span>LangGraph Execution Sandbox</span>
          </div>

          <div className="rag-flow-container">
            {/* INGESTION NODE */}
            <div
              className={`flow-node ${
                currentState && (currentState.chunks.length > 0 || currentState.currentNode === "ingestion")
                  ? "completed"
                  : isIngesting
                  ? "active"
                  : ""
              }`}
            >
              <div className="flow-node-icon">
                <Layers size={18} />
              </div>
              <span className="flow-node-title">Ingestion Agent</span>
              <span className="flow-node-status">
                {currentState && currentState.chunks.length > 0
                  ? `${currentState.chunks.length} Chunks`
                  : isIngesting
                  ? "Embedding..."
                  : "Idle"}
              </span>
            </div>

            <div
              className={`flow-connector ${
                currentState && (currentState.chunks.length > 0 || currentState.currentNode === "ingestion") ? "active" : ""
              }`}
            />

            {/* PINECONE DB NODE */}
            <div
              className={`flow-node ${
                currentState && (currentState.chunks.length > 0 || currentState.currentNode === "ingestion") ? "completed" : ""
              }`}
            >
              <div className="flow-node-icon">
                <Database size={18} />
              </div>
              <span className="flow-node-title">Pinecone Vector DB</span>
              <span className="flow-node-status">
                {currentState && currentState.chunks.length > 0 ? "Vectors Stored" : "Empty"}
              </span>
            </div>

            <div
              className={`flow-connector ${
                currentState && currentState.currentNode === "retrieval"
                  ? "active"
                  : currentState && currentState.retrievedContext.length > 0
                  ? "active"
                  : ""
              }`}
            />

            {/* RETRIEVAL NODE */}
            <div
              className={`flow-node ${
                currentState && currentState.retrievedContext.length > 0
                  ? "completed"
                  : isProcessing && currentState?.currentNode === "ingestion"
                  ? "active"
                  : ""
              }`}
            >
              <div className="flow-node-icon">
                <Search size={18} />
              </div>
              <span className="flow-node-title">Retrieval Agent</span>
              <span className="flow-node-status">
                {currentState && currentState.retrievedContext.length > 0
                  ? `K = ${currentState.retrievedContext.length} Match`
                  : "Idle"}
              </span>
            </div>

            <div
              className={`flow-connector ${
                currentState && currentState.currentNode === "generation"
                  ? "active"
                  : currentState && currentState.outputResponse
                  ? "active"
                  : ""
              }`}
            />

            {/* GENERATION NODE */}
            <div
              className={`flow-node ${
                currentState && currentState.outputResponse
                  ? "completed"
                  : isProcessing && currentState?.currentNode === "retrieval"
                  ? "active"
                  : ""
              }`}
            >
              <div className="flow-node-icon">
                <Sparkles size={18} />
              </div>
              <span className="flow-node-title">Generation Agent</span>
              <span className="flow-node-status">
                {currentState && currentState.outputResponse ? "Gemini 2.5 Flash" : "Idle"}
              </span>
            </div>
          </div>
        </section>

        {/* Main interactive split panels */}
        {!currentState && !isIngesting ? (
          /* Initial Upload Workspace State */
          <div className="glass-panel" style={{ padding: "3rem 2rem", textAlign: "center" }}>
            <h2 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>Initialize Your RAG Workspace</h2>
            <p style={{ maxWidth: "550px", margin: "0 auto 2rem auto" }}>
              Upload a plain text document or paste code, click Ingest, and watch how LangGraph chunks, embeds, and loads the data into Pinecone.
            </p>

            <form onSubmit={handleIngest} style={{ maxWidth: "600px", margin: "0 auto" }}>
              <div className="auth-form-group">
                <label htmlFor="docName">Document Name (Optional)</label>
                <input
                  id="docName"
                  type="text"
                  className="input-field"
                  placeholder="explaining-quantum-mechanics.txt"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                />
              </div>

              <div className="auth-form-group" style={{ marginBottom: "1.5rem" }}>
                <label htmlFor="docText">Document Source Content</label>
                <textarea
                  id="docText"
                  className="textarea-field"
                  placeholder="Paste context texts here... (e.g. quantum mechanics is a fundamental theory in physics that provides a description of the physical properties of nature at the scale of atoms and subatomic particles.)"
                  value={docText}
                  onChange={(e) => setDocText(e.target.value)}
                  style={{ minHeight: "200px" }}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
                <Upload size={16} />
                <span>Begin Graph Ingestion</span>
              </button>
            </form>
          </div>
        ) : (
          /* Active Pipeline Split Workspace */
          <div className="workspace-grid">
            {/* LEFT PANEL: STATE INSPECTOR */}
            <div className="glass-panel workspace-panel">
              <div className="panel-header">
                <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>State Variable Inspector</h3>
                <span
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.1rem 0.4rem",
                    borderRadius: "4px",
                    background: "rgba(0, 242, 254, 0.15)",
                    color: "var(--color-accent)",
                    fontFamily: "var(--font-mono)"
                  }}
                >
                  Node: {currentState?.currentNode || "processing..."}
                </span>
              </div>

              {/* Tabs for State Inspector */}
              <div className="tabs-header">
                <button
                  onClick={() => setActiveInspectorTab("chunks")}
                  className={`tab-btn ${activeInspectorTab === "chunks" ? "active" : ""}`}
                >
                  Document Chunks
                </button>
                <button
                  onClick={() => setActiveInspectorTab("embeddings")}
                  className={`tab-btn ${activeInspectorTab === "embeddings" ? "active" : ""}`}
                  disabled={!currentState || currentState.embeddings.length === 0}
                >
                  Embeddings Grid
                </button>
                <button
                  onClick={() => setActiveInspectorTab("similarity")}
                  className={`tab-btn ${activeInspectorTab === "similarity" ? "active" : ""}`}
                  disabled={!currentState || currentState.retrievedContext.length === 0}
                >
                  Similarity Matches
                </button>
                <button
                  onClick={() => setActiveInspectorTab("json")}
                  className={`tab-btn ${activeInspectorTab === "json" ? "active" : ""}`}
                >
                  Raw State JSON
                </button>
              </div>

              <div className="panel-body">
                {/* 1. DOCUMENT CHUNKS TAB */}
                {activeInspectorTab === "chunks" && currentState && (
                  <div className="chunks-list">
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                      Document: <span className="highlight-text">{currentState.documentName}</span> | 
                      Characters: <span className="highlight-text">{currentState.documentText.length}</span>
                    </div>
                    {currentState.chunks.map((chunk, idx) => (
                      <div key={idx} className="chunk-card">
                        <span className="chunk-badge">Chunk {idx + 1}</span>
                        <div className="chunk-meta">Index: {idx} | Length: {chunk.length} chars</div>
                        <div className="chunk-text">{chunk}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 2. EMBEDDINGS GRID TAB (Visual representation of high-dimensional vectors) */}
                {activeInspectorTab === "embeddings" && currentState && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      Below is a pixelated grid representation of the vector footprint generated by **Gemini 2.5 Flash's text-embedding-004** model (768 dimensions per chunk). Hover to see float values.
                    </div>
                    {currentState.embeddings.map((vector, chunkIdx) => (
                      <div key={chunkIdx} className="glass-card" style={{ padding: "0.75rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.5rem" }}>
                          <span style={{ fontWeight: 600 }}>Chunk {chunkIdx + 1} Embedding</span>
                          <span style={{ color: "var(--color-accent)" }}>Dimensions: {vector.length}</span>
                        </div>
                        <div className="embeddings-grid">
                          {vector.slice(0, 120).map((val, dimIdx) => {
                            // Map float value to rgb
                            // embedding floats usually cluster between -0.1 and 0.1
                            // Make it glow blue for negative, cyan/indigo for positive
                            const magnitude = Math.min(Math.max((val + 0.1) * 5, 0), 1); // Normalize
                            const r = Math.floor(99 * (1 - magnitude) + 0 * magnitude);
                            const g = Math.floor(102 * (1 - magnitude) + 242 * magnitude);
                            const b = Math.floor(241 * (1 - magnitude) + 254 * magnitude);
                            return (
                              <div
                                key={dimIdx}
                                className="embedding-cell"
                                style={{
                                  backgroundColor: `rgb(${r}, ${g}, ${b})`,
                                  color: magnitude > 0.6 ? "#05070f" : "#fff",
                                  fontSize: "0.5rem"
                                }}
                                title={`Dim ${dimIdx}: ${val.toFixed(6)}`}
                              />
                            );
                          })}
                        </div>
                        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "0.4rem", textAlign: "right" }}>
                          Showing first 120 of 768 dimensions.
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 3. SIMILARITY RESULTS TAB */}
                {activeInspectorTab === "similarity" && currentState && (
                  <div className="chunks-list">
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                      Query: <span className="highlight-text">"{currentState.query}"</span>
                    </div>
                    {currentState.retrievedContext.map((match, idx) => (
                      <div key={idx} className="chunk-card" style={{ borderColor: "rgba(16, 185, 129, 0.4)" }}>
                        <span className="chunk-badge" style={{ background: "rgba(16, 185, 129, 0.2)", color: "#34d399" }}>
                          Match {idx + 1}
                        </span>
                        <div className="chunk-meta" style={{ display: "flex", gap: "1rem" }}>
                          <span>Rank: {idx + 1}</span>
                          <span style={{ color: "var(--color-success)" }}>
                            Similarity Score: {match.score.toFixed(6)}
                          </span>
                        </div>
                        {/* Similarity Score bar */}
                        <div
                          style={{
                            height: "4px",
                            width: "100%",
                            background: "rgba(255,255,255,0.05)",
                            borderRadius: "2px",
                            marginBottom: "0.75rem",
                            overflow: "hidden"
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${match.score * 100}%`,
                              background: "var(--color-success)"
                            }}
                          />
                        </div>
                        <div className="chunk-text">{match.text}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 4. RAW STATE JSON */}
                {activeInspectorTab === "json" && currentState && (
                  <pre className="json-viewer">{JSON.stringify(currentState, null, 2)}</pre>
                )}
              </div>
            </div>

            {/* RIGHT PANEL: WORKSPACE CONSOLE / CHAT */}
            <div className="glass-panel workspace-panel">
              {/* Header and selection tabs */}
              <div className="panel-header">
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={() => setActiveConsoleTab("chat")}
                    className={`tab-btn ${activeConsoleTab === "chat" ? "active" : ""}`}
                    style={{ fontSize: "0.9rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.3rem" }}
                  >
                    <MessageSquare size={14} />
                    <span>Workshop Console</span>
                  </button>
                  <button
                    onClick={() => setActiveConsoleTab("logs")}
                    className={`tab-btn ${activeConsoleTab === "logs" ? "active" : ""}`}
                    style={{ fontSize: "0.9rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.3rem" }}
                  >
                    <Terminal size={14} />
                    <span>System Logs</span>
                  </button>
                </div>
              </div>

              {/* Chat View */}
              {activeConsoleTab === "chat" && currentState && (
                <div className="chat-container">
                  <div className="chat-messages">
                    {/* Ingestion Success Log as System message */}
                    <div className="message system">
                      <div className="message-label">Ingestion Agent</div>
                      <span>
                        Document <strong>{currentState.documentName}</strong> ingested successfully. Vector space created with{" "}
                        {currentState.chunks.length} chunks. Ask a question to query Pinecone!
                      </span>
                    </div>

                    {/* Query Message */}
                    {currentState.query && (
                      <div className="message user">
                        <div className="message-label" style={{ textAlign: "right" }}>Question</div>
                        <span>{currentState.query}</span>
                      </div>
                    )}

                    {/* Retrieval Status */}
                    {currentState.retrievedContext.length > 0 && (
                      <div className="message system">
                        <div className="message-label">Retrieval Agent</div>
                        <span>
                          Retrieved the top <strong>{currentState.retrievedContext.length}</strong> matching chunks from Pinecone. 
                          Click <strong>Generate Answer</strong> to route context and query into Gemini 2.5 Flash.
                        </span>
                        
                        {/* Inspect link shortcut */}
                        <button
                          onClick={() => setActiveInspectorTab("similarity")}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--color-accent)",
                            textDecoration: "underline",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            padding: 0,
                            marginTop: "0.25rem",
                            textAlign: "left"
                          }}
                        >
                          Show retrieved source text chunks
                        </button>
                      </div>
                    )}

                    {/* Gemini synthesized output response */}
                    {currentState.outputResponse && (
                      <div className="message system" style={{ borderLeft: "3px solid var(--color-secondary)" }}>
                        <div className="message-label" style={{ color: "var(--color-secondary)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <Sparkles size={12} />
                          <span>Generation Agent (Gemini 2.5 Flash)</span>
                        </div>
                        <span style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{currentState.outputResponse}</span>
                      </div>
                    )}

                    {/* Educational step prompts inside chat list */}
                    {currentState.currentNode === "ingestion" && userQuery === "" && !isProcessing && (
                      <div
                        style={{
                          background: "rgba(99,102,241,0.05)",
                          border: "1px dashed var(--color-primary)",
                          borderRadius: "12px",
                          padding: "1rem",
                          textAlign: "center",
                          margin: "1rem 0"
                        }}
                      >
                        <HelpCircle size={24} style={{ color: "var(--color-primary)", marginBottom: "0.5rem" }} />
                        <h4 style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>What's next in the RAG flow?</h4>
                        <p style={{ fontSize: "0.75rem", marginBottom: "0.75rem" }}>
                          The document is embedded. Type a question in the bar below. You will pause after Retrieval to inspect matches.
                        </p>
                      </div>
                    )}

                    {/* Retrieval Node prompt */}
                    {currentState.currentNode === "retrieval" && !currentState.outputResponse && !isProcessing && (
                      <div
                        style={{
                          background: "rgba(0, 242, 254, 0.05)",
                          border: "1px dashed var(--color-accent)",
                          borderRadius: "12px",
                          padding: "1rem",
                          textAlign: "center",
                          margin: "1rem 0"
                        }}
                      >
                        <Cpu size={24} style={{ color: "var(--color-accent)", marginBottom: "0.5rem" }} />
                        <h4 style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>Similarity Check Point</h4>
                        <p style={{ fontSize: "0.75rem", marginBottom: "0.75rem" }}>
                          Review the similarity score ratings in the Inspector. Click below to proceed to prompt synthesis.
                        </p>
                        <button onClick={handleGenerate} className="btn btn-accent" style={{ fontSize: "0.8rem", padding: "0.4rem 1rem" }}>
                          <Play size={10} />
                          <span>Generate Answer</span>
                        </button>
                      </div>
                    )}

                    <div ref={chatEndRef} />
                  </div>

                  {/* Message Input container */}
                  <form onSubmit={handleAskAll} className="chat-input-bar">
                    <input
                      type="text"
                      className="input-field"
                      placeholder={
                        currentState.currentNode === "START"
                          ? "Please run ingestion first..."
                          : "Ask a question about the document..."
                      }
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      disabled={currentState.currentNode === "START" || isProcessing}
                      style={{ flex: 1 }}
                    />
                    
                    {/* Separate Step Execution Button */}
                    {currentState.currentNode === "ingestion" && userQuery.trim() !== "" && (
                      <button
                        type="button"
                        onClick={handleRetrieve}
                        disabled={isProcessing}
                        className="btn btn-secondary"
                        style={{ padding: "0 1rem" }}
                        title="Only run similarity lookup (step-by-step)"
                      >
                        <Search size={14} />
                        <span>Retrieve</span>
                      </button>
                    )}

                    <button
                      type="submit"
                      disabled={!userQuery.trim() || isProcessing}
                      className="btn btn-primary"
                    >
                      {isProcessing ? (
                        "Processing..."
                      ) : (
                        <>
                          <Play size={12} />
                          <span>Ask RAG</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* Logs terminal view */}
              {activeConsoleTab === "logs" && currentState && (
                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                  <div className="panel-body" style={{ background: "#010206", fontFamily: "var(--font-mono)", flex: 1 }}>
                    {currentState.logs.map((log, idx) => {
                      let type = "info";
                      if (log.includes("[Ingestion]")) type = "accent";
                      else if (log.includes("[Retrieval]")) type = "success";
                      else if (log.includes("[Generation]")) type = "warning";
                      else if (log.includes("[System]")) type = "error";
                      
                      return (
                        <div key={idx} className={`terminal-line ${type}`}>
                          <span className="timestamp">{`[Step ${idx + 1}]`}</span>
                          <span>{log}</span>
                        </div>
                      );
                    })}
                    <div ref={logsEndRef} />
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                    <button
                      onClick={() => {
                        if (confirm("Reset current session nodes?")) {
                          handleReIngest();
                        }
                      }}
                      className="btn btn-secondary"
                      style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}
                    >
                      <RotateCcw size={12} />
                      <span>Reset Graph</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
