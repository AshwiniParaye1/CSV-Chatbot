"use client";

import { useState } from "react";
import { UploadPanel } from "@/components/upload-panel";
import { ChatPanel } from "@/components/chat-panel";

export default function HomePage() {
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);

  return (
    <main className="min-h-screen py-8">
      <section className="mx-auto w-full max-w-6xl px-4">
        <header className="mb-6 md:mb-8">
          <h1 className="text-pretty font-sans text-2xl font-semibold tracking-tight md:text-3xl">
            Chat with Your Files
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Upload CSV files on the left, select which ones to analyze, then
            chat about them on the right.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <UploadPanel onDocumentSelectionChange={setSelectedDocumentIds} />
          <ChatPanel selectedDocumentIds={selectedDocumentIds} />
        </div>
      </section>
    </main>
  );
}
