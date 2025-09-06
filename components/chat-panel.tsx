"use client";

import { useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
  isLoading?: boolean;
};

type ChatPanelProps = {
  selectedDocumentIds?: string[];
};

export function ChatPanel({ selectedDocumentIds = [] }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        "Hi! Upload CSV files using the panel on the left, then select which files you want to chat about. I'll analyze the content and provide answers based on your selected data.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const sendMessage = async (message: string) => {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          documentIds:
            selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `Chat failed with status ${response.status}`
        );
      }

      const result = await response.json();
      return result.message;
    } catch (error) {
      console.error("Chat error:", error);
      throw error;
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    if (selectedDocumentIds.length === 0) {
      // Add a message to suggest selecting documents
      const warningMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Please select at least one document to chat with from the upload panel on the left.",
      };
      setMessages((prev) => [...prev, warningMsg]);
      return;
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    // Add user message immediately
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    // Add loading indicator
    const loadingMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "Thinking...",
      isLoading: true,
    };
    setMessages((prev) => [...prev, loadingMsg]);

    try {
      // Send message to API
      const response = await sendMessage(text);

      // Remove loading message and add real response
      setMessages((prev) => {
        const withoutLoading = prev.filter((m) => !m.isLoading);
        const reply: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response,
        };
        return [...withoutLoading, reply];
      });
    } catch (error) {
      // Remove loading message and add error response
      setMessages((prev) => {
        const withoutLoading = prev.filter((m) => !m.isLoading);
        const errorMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Sorry, I encountered an error. Please try again.",
        };
        return [...withoutLoading, errorMsg];
      });
    } finally {
      setIsLoading(false);
    }

    // Scroll on next tick
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  };

  return (
    <Card aria-labelledby="chat-title" className="flex flex-col h-[600px]">
      <CardHeader className="flex-shrink-0">
        <CardTitle id="chat-title" className="font-sans text-lg">
          Chat with Your Files
        </CardTitle>
        <CardDescription>
          Ask questions about your selected CSV data. Select files from the
          upload panel to get started.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 min-h-0 p-6">
        <ScrollArea
          ref={scrollRef}
          className="flex-1 rounded-md border p-4 mb-4 overflow-hidden"
          style={{ height: "calc(100% - 80px)" }}
        >
          <div className="mx-auto flex w-full max-w-none flex-col gap-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={[
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                ].join(" ")}
                role="group"
                aria-label={
                  m.role === "user" ? "User message" : "Assistant message"
                }
              >
                <div
                  className={[
                    "max-w-[85%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap",
                    m.role === "user" ? "bg-blue-600 text-white" : "bg-muted",
                  ].join(" ")}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2 h-16 flex-shrink-0">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question..."
            className="min-h-[48px] max-h-32 resize-none flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            aria-label="Chat message input"
          />
          <Button
            style={{ backgroundColor: "#0f172a", color: "white" }}
            className="h-[48px] hover:!bg-slate-800 flex-shrink-0"
            onClick={send}
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? "Sending..." : "Send"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
