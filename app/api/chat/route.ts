import { NextRequest, NextResponse } from "next/server";
import { querySpecificDocuments } from "@/lib/vector-service";

export async function POST(request: NextRequest) {
  try {
    console.log("Chat API called");
    const body = await request.json();
    const { message, documentIds } = body;

    console.log("Received message:", message);
    console.log("Document IDs:", documentIds);

    if (!message || typeof message !== "string") {
      console.log("Invalid message format");
      return NextResponse.json(
        { error: "Message is required and must be a string" },
        { status: 400 }
      );
    }

    if (message.trim().length === 0) {
      console.log("Empty message");
      return NextResponse.json(
        { error: "Message cannot be empty" },
        { status: 400 }
      );
    }

    console.log(`Processing chat message: ${message}`);

    // Query specific documents if provided, otherwise query all
    const answer = await querySpecificDocuments(message, documentIds);

    console.log(`Generated answer for: ${message}`);

    return NextResponse.json({
      success: true,
      message: answer,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Chat API error:", error);
    console.error(
      "Error details:",
      error instanceof Error ? error.message : "Unknown error"
    );
    console.error(
      "Error stack:",
      error instanceof Error ? error.stack : "No stack trace"
    );

    return NextResponse.json(
      {
        error: "Failed to process chat message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Chat API is ready",
    timestamp: new Date().toISOString(),
  });
}
