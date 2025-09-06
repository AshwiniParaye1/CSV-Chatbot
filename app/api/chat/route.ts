import { NextRequest, NextResponse } from "next/server";
import { querySpecificDocuments } from "@/lib/vector-service";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";

// Helper function to check if question is related to CSV data using AI
async function checkIfDataRelated(message: string): Promise<boolean> {
  const model = new ChatOpenAI({
    model: "gpt-5-mini",
    openAIApiKey: process.env.OPENAI_API_KEY!,
  });

  const prompt = PromptTemplate.fromTemplate(`
You are a filter that determines if a question is related to CSV data analysis or completely unrelated.

Question: {question}

Respond with only "YES" if the question is about:
- Data analysis, statistics, insights, summaries
- CSV content, rows, columns, records
- Asking to analyze, summarize, or explore data
- Any question that could be answered using CSV data

Respond with only "NO" if the question is clearly about:
- Weather, cooking, news, entertainment, personal advice
- Topics completely unrelated to data or CSV files

When in doubt, respond with "YES".
`);

  const response = await model.invoke(
    await prompt.format({ question: message })
  );
  return response.content.toString().trim().toUpperCase() === "YES";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, documentIds } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required and must be a string" },
        { status: 400 }
      );
    }

    if (message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message cannot be empty" },
        { status: 400 }
      );
    }

    // System prompt to filter out external questions
    const isDataRelatedQuestion = await checkIfDataRelated(message);
    if (!isDataRelatedQuestion) {
      return NextResponse.json({
        success: true,
        message:
          "I can only answer questions about the CSV data you've uploaded. Please ask questions about your data such as counts, statistics, specific records, or data analysis.",
        timestamp: new Date().toISOString(),
      });
    }

    // Query specific documents if provided, otherwise query all
    const answer = await querySpecificDocuments(message, documentIds);

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
