import { NextRequest, NextResponse } from "next/server";
import { getUploadedDocuments, deleteDocument } from "@/lib/vector-service";

export async function GET() {
  try {
    const documents = await getUploadedDocuments();

    return NextResponse.json({
      success: true,
      documents,
      count: documents.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Documents API GET error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch documents",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("id");

    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 }
      );
    }

    console.log(`Deleting document: ${documentId}`);
    const result = await deleteDocument(documentId);

    return NextResponse.json({
      success: result.success,
      message: `Document ${documentId} deleted successfully`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Documents API DELETE error:", error);

    return NextResponse.json(
      {
        error: "Failed to delete document",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
