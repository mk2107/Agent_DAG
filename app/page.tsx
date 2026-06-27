import Link from "next/link";
import { Cpu, Eye, Sliders, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <section className="hero-section">
        <div className="hero-badge">Educational Sandbox</div>
        <h1 className="hero-title">
          Understand RAG Models <br />
          <span className="gradient-text">Step-by-Step</span>
        </h1>
        <p className="hero-desc">
          Build, visualize, and interact with a Retrieval-Augmented Generation pipeline. 
          Upload documents, inspect embeddings, debug similarity retrievals, and trace LLM generation in real time.
        </p>
        
        <div className="hero-actions">
          <Link href="/register" className="btn btn-primary" style={{ fontSize: "1.05rem", padding: "0.8rem 1.6rem" }}>
            <span>Start Building</span>
            <ArrowRight size={18} />
          </Link>
          <Link href="/login" className="btn btn-secondary" style={{ fontSize: "1.05rem", padding: "0.8rem 1.6rem" }}>
            Sign In
          </Link>
        </div>

        <div className="features-grid" style={{ marginTop: "2rem" }}>
          <div className="glass-panel feature-card">
            <div className="feature-icon-wrapper">
              <Cpu size={22} />
            </div>
            <h3>LangGraph Orchestration</h3>
            <p>
              Observe a deterministic multi-agent network split tasks between Supervisor, Ingestion, Retrieval, and Generation.
            </p>
          </div>

          <div className="glass-panel feature-card">
            <div className="feature-icon-wrapper">
              <Eye size={22} />
            </div>
            <h3>Step-by-Step Visualization</h3>
            <p>
              Inspect numerical vectors from Gemini 2.5 Flash, chunk dividers, and exact search matching scores from Pinecone.
            </p>
          </div>

          <div className="glass-panel feature-card">
            <div className="feature-icon-wrapper">
              <Sliders size={22} />
            </div>
            <h3>Human-in-the-Loop Controls</h3>
            <p>
              Pause the graph execution, modify chunk size, similarity count, or prompts, and see the downstream impact.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
