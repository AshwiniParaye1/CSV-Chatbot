import { NextRequest, NextResponse } from "next/server";
import { processUploadedFile } from "@/lib/vector-service";

export async function POST(request: NextRequest) {
  try {
    // Parse the FormData
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      return NextResponse.json(
        { error: "Only CSV files are allowed" },
        { status: 400 }
      );
    }

    // Validate file size (3MB limit)
    const maxSize = 3 * 1024 * 1024; // 3MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size exceeds 3MB limit" },
        { status: 400 }
      );
    }

    console.log(`Processing upload: ${file.name} (${file.size} bytes)`);

    // Process the file using LangChain
    const result = await processUploadedFile(file);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to process file" },
        { status: 500 }
      );
    }

    console.log(`Successfully processed: ${file.name}`);

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${file.name}`,
      filename: result.filename,
      chunksStored: result.chunksStored,
      metadata: {
        filename: file.name,
        fileSize: file.size,
        chunkCount: result.chunksStored,
      },
    });
  } catch (error) {
    console.error("Upload API error:", error);

    return NextResponse.json(
      {
        error: "Failed to process file",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Upload API is ready",
    timestamp: new Date().toISOString(),
  });
}
