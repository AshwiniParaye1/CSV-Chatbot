/* eslint-disable @typescript-eslint/no-explicit-any */
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { ChatOpenAI } from "@langchain/openai";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { PromptTemplate } from "@langchain/core/prompts";
import { Document } from "@langchain/core/documents";
import Papa from "papaparse";
import { supabaseAdmin } from "./supabase";

let globalChain: any = null;
let globalEmbeddings: OpenAIEmbeddings | null = null;

export interface DocumentProcessResult {
  success: boolean;
  chunksStored: number;
  error?: string;
  filename: string;
  documentId?: string;
}

/**
 * Parse CSV file and convert to LangChain documents
 */
export async function parseCsvToDocuments(
  file: File
): Promise<{ documents: Document[]; csvContent: string }> {
  try {
    // Convert File to text in server environment
    const text = await file.text();

    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const data = results.data as Record<string, string>[];
            const headers = results.meta.fields || [];

            // Store the original CSV content
            const csvContent =
              headers.join(",") +
              "\n" +
              data
                .map((row) =>
                  headers.map((header) => row[header] || "").join(",")
                )
                .join("\n");

            // Convert CSV rows to documents
            const documents = data.map((row, index) => {
              const content = headers
                .map((header) => `${header}: ${row[header] || "N/A"}`)
                .join(", ");

              return new Document({
                pageContent: content,
                metadata: {
                  source: file.name,
                  row: index + 1,
                  headers: headers,
                  type: "csv_row",
                },
              });
            });

            resolve({ documents, csvContent });
          } catch (error) {
            reject(
              new Error(
                `Failed to parse CSV: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`
              )
            );
          }
        },
        error: ({ error }: any) => {
          reject(new Error(`Failed to parse CSV: ${error.message}`));
        },
      });
    });
  } catch (error) {
    throw new Error(
      `Failed to read file: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Process uploaded CSV file and store in Supabase vector store
 */
export async function processUploadedFile(
  file: File
): Promise<DocumentProcessResult> {
  try {
    console.log(`Processing file: ${file.name}`);

    // Parse CSV to documents and get original content
    const { documents: docs, csvContent } = await parseCsvToDocuments(file);
    console.log(`Parsed ${docs.length} documents from CSV`);

    // Store document in documents table first
    const { data: documentRecord, error: docError } = await supabaseAdmin
      .from("documents")
      .insert({
        filename: file.name,
        file_size: file.size,
        mime_type: file.type || "text/csv",
        content: csvContent,
        metadata: {
          row_count: docs.length,
          headers: docs[0]?.metadata?.headers || [],
          uploaded_by: "system",
        },
      })
      .select()
      .single();

    if (docError || !documentRecord) {
      throw new Error(`Failed to store document: ${docError?.message}`);
    }

    console.log(`Stored document with ID: ${documentRecord.id}`);

    // Adaptive chunking strategy based on dataset size
    const totalRows = docs.length;
    console.log(`Dataset has ${totalRows} rows`);

    let chunkSize: number;
    let chunkOverlap: number;
    let docsWithDocumentId: Document[];

    if (totalRows <= 50) {
      // Small datasets: Keep all rows together in fewer, larger chunks
      chunkSize = 2000;
      chunkOverlap = 100;
      console.log(
        "Using small dataset strategy: larger chunks to preserve context"
      );
    } else if (totalRows <= 500) {
      // Medium datasets: Balanced chunking
      chunkSize = 1500;
      chunkOverlap = 75;
      console.log("Using medium dataset strategy: balanced chunking");
    } else {
      // Large datasets: Smaller chunks for better retrieval
      chunkSize = 800;
      chunkOverlap = 40;
      console.log(
        "Using large dataset strategy: smaller chunks for efficiency"
      );
    }

    // For very small datasets (<=10 rows), don't chunk at all
    if (totalRows <= 10) {
      console.log("Very small dataset: preserving all data without chunking");
      docsWithDocumentId = docs.map((doc, index) => {
        return new Document({
          pageContent: doc.pageContent,
          metadata: {
            ...doc.metadata,
            document_id: documentRecord.id,
            chunk_index: index,
          },
        });
      });
    } else {
      // Use adaptive chunking for larger datasets
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separators: ["\n\n", "\n", ", "], // Prioritize line breaks and commas for CSV
      });

      const splittedDocs = await splitter.splitDocuments(docs);
      console.log(
        `Created ${splittedDocs.length} chunks from ${totalRows} rows`
      );

      docsWithDocumentId = splittedDocs.map((doc, index) => {
        return new Document({
          pageContent: doc.pageContent,
          metadata: {
            ...doc.metadata,
            document_id: documentRecord.id,
            chunk_index: index,
          },
        });
      });
    }

    // Add document_id and chunk_index to chunk metadata - already handled above
    // docsWithDocumentId is already created with proper metadata

    // Initialize embeddings if not already done
    if (!globalEmbeddings) {
      globalEmbeddings = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY!,
      });
    }

    // Generate embeddings for all document chunks
    console.log("Generating embeddings for chunks...");
    const embeddings = await globalEmbeddings.embedDocuments(
      docsWithDocumentId.map((doc) => doc.pageContent)
    );

    // Manually insert chunks with proper chunk_index
    const chunkInserts = docsWithDocumentId.map((doc, index) => ({
      document_id: documentRecord.id,
      content: doc.pageContent,
      chunk_index: index,
      embedding: embeddings[index],
      metadata: doc.metadata,
    }));

    console.log(`Inserting ${chunkInserts.length} chunks into Supabase...`);
    const { error: insertError } = await supabaseAdmin
      .from("document_chunks")
      .insert(chunkInserts);

    if (insertError) {
      throw new Error(`Failed to insert chunks: ${insertError.message}`);
    }

    console.log(
      `Successfully inserted ${chunkInserts.length} chunks from ${totalRows} rows`
    );

    // Create vector store for retrieval (without inserting new documents)
    const vectorStore = new SupabaseVectorStore(globalEmbeddings, {
      client: supabaseAdmin,
      tableName: "document_chunks",
      queryName: "match_documents",
    });

    // Create chat model
    const model = new ChatOpenAI({
      model: "gpt-5-mini",
      openAIApiKey: process.env.OPENAI_API_KEY!,
    });

    // Create retriever with filter for this document
    const vectorStoreRetriever = vectorStore.asRetriever({
      filter: { document_id: documentRecord.id },
      k: 5,
    });

    // Create chain to combine retrieved docs
    const combineDocsChain = await createStuffDocumentsChain({
      llm: model,
      prompt: new PromptTemplate({
        template: `You are a helpful assistant. Use the following context from the uploaded CSV file to answer the user's question accurately.

        Context: {context}

        Question: {input}

        Please provide a helpful answer based on the CSV data. If the question cannot be answered from the provided data, say so clearly.`,
        inputVariables: ["context", "input"],
      }),
    });

    // Create retrieval chain
    globalChain = await createRetrievalChain({
      retriever: vectorStoreRetriever,
      combineDocsChain,
    });

    console.log(`Successfully processed ${file.name}`);

    return {
      success: true,
      chunksStored: docsWithDocumentId.length,
      filename: file.name,
      documentId: documentRecord.id,
    };
  } catch (error) {
    console.error("Error processing file:", error);
    return {
      success: false,
      chunksStored: 0,
      filename: file.name,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Query specific uploaded documents by document IDs
 */
export async function querySpecificDocuments(
  question: string,
  documentIds?: string[]
): Promise<string> {
  try {
    console.log(
      `Querying ${documentIds ? "specific" : "all"} documents: ${question}`
    );
    if (documentIds) {
      console.log(`Document IDs: ${documentIds.join(", ")}`);
    }

    // First check if there are any documents and get their metadata
    let documentsQuery = supabaseAdmin
      .from("documents")
      .select("id, filename, metadata");

    if (documentIds && documentIds.length > 0) {
      documentsQuery = documentsQuery.in("id", documentIds);
    }

    const { data: documents, error: docError } = await documentsQuery.limit(10);

    if (docError) {
      throw new Error(`Failed to check documents: ${docError.message}`);
    }

    if (!documents || documents.length === 0) {
      if (documentIds && documentIds.length > 0) {
        throw new Error(`No documents found with the specified IDs.`);
      } else {
        throw new Error(
          "No CSV file uploaded. Please upload a CSV file first before asking questions."
        );
      }
    }

    // Calculate total rows across selected documents
    const totalRows = documents.reduce((sum, doc) => {
      return sum + (doc.metadata?.row_count || 0);
    }, 0);

    console.log(`Total rows across selected documents: ${totalRows}`);
    console.log(
      `Selected documents: ${documents.map((d) => d.filename).join(", ")}`
    );

    // Get total chunks for selected documents
    let chunksQuery = supabaseAdmin
      .from("document_chunks")
      .select("*", { count: "exact", head: true });

    if (documentIds && documentIds.length > 0) {
      chunksQuery = chunksQuery.in("document_id", documentIds);
    }

    const { count: totalChunks, error: countError } = await chunksQuery;

    if (countError) {
      console.warn("Could not count chunks, using default retrieval");
    }

    console.log(`Total chunks in selected documents: ${totalChunks}`);

    // Adaptive retrieval strategy based on dataset size
    let retrievalK: number;
    if (totalRows <= 10) {
      // Very small dataset: retrieve all chunks
      retrievalK = Math.max(totalChunks || 50, 10);
      console.log("Very small dataset: retrieving all available chunks");
    } else if (totalRows <= 50) {
      // Small dataset: retrieve most chunks to ensure completeness
      retrievalK = Math.min(Math.max(totalChunks || 100, 20), 100);
      console.log("Small dataset: retrieving comprehensive chunks");
    } else if (totalRows <= 500) {
      // Medium dataset: balanced retrieval
      retrievalK = Math.min(totalRows, 150);
      console.log("Medium dataset: using balanced retrieval");
    } else {
      // Large dataset: selective retrieval but ensure coverage
      retrievalK = Math.min(totalRows * 0.3, 200); // 30% of rows or max 200
      console.log("Large dataset: using selective but comprehensive retrieval");
    }

    console.log(`Using retrieval k=${retrievalK} for ${totalRows} total rows`);

    // Initialize embeddings if not already done
    if (!globalEmbeddings) {
      globalEmbeddings = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY!,
      });
    }

    // Create vector store for querying selected documents
    const vectorStore = new SupabaseVectorStore(globalEmbeddings, {
      client: supabaseAdmin,
      tableName: "document_chunks",
      queryName: "match_documents",
    });

    // Create chat model
    const model = new ChatOpenAI({
      model: "gpt-5-mini",
      openAIApiKey: process.env.OPENAI_API_KEY!,
    });

    // Create retriever with document filter if specified
    const retrieverConfig: any = {
      k: Math.round(retrievalK),
      searchType: "similarity",
    };

    if (documentIds && documentIds.length > 0) {
      retrieverConfig.filter = { document_id: { $in: documentIds } };
    }

    const vectorStoreRetriever = vectorStore.asRetriever(retrieverConfig);

    // Create chain to combine retrieved docs with improved prompt
    const combineDocsChain = await createStuffDocumentsChain({
      llm: model,
      prompt: new PromptTemplate({
        template: `You are a CSV data analysis assistant. You should analyze and answer questions about the CSV data provided below. Accept data analysis questions but refuse clearly unrelated topics.

GUIDELINES:
- Answer questions about data analysis, insights, statistics, summaries, and any CSV content
- Accept broad requests like: "analyze the data", "give insights", "tell me about the data", "summarize", "give data analysis"
- ONLY refuse obviously non-data questions (weather, cooking, news, personal advice)
- When in doubt, try to answer using the CSV context

Dataset: ${documents.map((d) => d.filename).join(", ")} (${totalRows} rows)
Context: {context}
Question: {input}

Provide analysis based on the CSV data above.`,
        inputVariables: ["context", "input"],
      }),
    });

    // Create retrieval chain
    const chain = await createRetrievalChain({
      retriever: vectorStoreRetriever,
      combineDocsChain,
    });

    const answer = await chain.invoke({
      input: question,
    });

    console.log("Retrieved context length:", answer.context?.length || 0);
    console.log(
      `Coverage: ${(((answer.context?.length || 0) / totalRows) * 100).toFixed(
        1
      )}% of total rows`
    );
    if (answer.context) {
      console.log(
        "First few context items:",
        answer.context
          .slice(0, 2)
          .map((doc: any) => doc.pageContent.substring(0, 100) + "...")
      );
    }

    return (
      answer.answer || "Sorry, I could not find an answer to your question."
    );
  } catch (error) {
    console.error("Error querying documents:", error);
    throw error;
  }
}

/**
 * Query all uploaded documents (legacy compatibility)
 */
export async function queryAllDocuments(question: string): Promise<string> {
  return querySpecificDocuments(question);
}

/**
 * Query the uploaded CSV data (legacy function, kept for compatibility)
 */
export async function queryVectorStore(question: string): Promise<string> {
  if (!globalChain) {
    throw new Error(
      "No CSV file has been uploaded yet. Please upload a CSV file first."
    );
  }

  try {
    console.log(`Querying: ${question}`);

    const answer = await globalChain.invoke({
      input: question,
    });

    return (
      answer.answer || "Sorry, I could not find an answer to your question."
    );
  } catch (error) {
    console.error("Error querying vector store:", error);
    throw new Error(
      `Failed to query: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Check if vector store is ready
 */
export function isVectorStoreReady(): boolean {
  return globalChain !== null;
}

/**
 * Get all uploaded documents
 */
export async function getUploadedDocuments() {
  try {
    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("*")
      .order("uploaded_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch documents: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error("Error fetching documents:", error);
    throw error;
  }
}

/**
 * Delete a document and all its chunks
 */
export async function deleteDocument(documentId: string) {
  try {
    // Delete from documents table (chunks will be deleted via CASCADE)
    const { error } = await supabaseAdmin
      .from("documents")
      .delete()
      .eq("id", documentId);

    if (error) {
      throw new Error(`Failed to delete document: ${error.message}`);
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting document:", error);
    throw error;
  }
}
