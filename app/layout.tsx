import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "LearnRAG - Interactive Vector Search and Generation Workshop",
  description: "An educational platform to build, visualize, and inspect RAG models step-by-step.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="main-wrapper">
            <Navbar />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
