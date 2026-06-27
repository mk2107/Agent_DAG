"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { BookOpen, LogOut, User, LayoutDashboard } from "lucide-react";

export default function Navbar() {
  const { data: session, status } = useSession();

  return (
    <nav className="navbar">
      <Link href="/" className="nav-logo">
        <BookOpen size={24} style={{ color: "var(--color-accent)" }} />
        <span className="gradient-text font-extrabold">LearnRAG</span>
      </Link>
      
      <div className="nav-links">
        {status === "authenticated" ? (
          <div className="nav-user">
            <Link href="/dashboard" className="btn btn-secondary" style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
              <LayoutDashboard size={14} />
              <span>Workshop</span>
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
              <User size={14} />
              <span>{session.user?.name || session.user?.email}</span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="btn btn-secondary"
              style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
            >
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          status !== "loading" && (
            <>
              <Link href="/login" className="btn btn-secondary" style={{ padding: "0.4rem 1rem", fontSize: "0.85rem" }}>
                Log In
              </Link>
              <Link href="/register" className="btn btn-primary" style={{ padding: "0.4rem 1rem", fontSize: "0.85rem" }}>
                Get Started
              </Link>
            </>
          )
        )}
      </div>
    </nav>
  );
}
