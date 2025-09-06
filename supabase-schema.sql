-- Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table to store file metadata and content
CREATE TABLE documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  filename TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  content TEXT NOT NULL, -- Store the actual file content
  metadata JSONB DEFAULT '{}'::jsonb,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create document_chunks table to store text chunks and their embeddings
CREATE TABLE document_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(1536), -- OpenAI text-embedding-3-small produces 1536-dimensional vectors
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create an index on the embedding column for fast similarity search
CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create a function to search for similar document chunks
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter jsonb DEFAULT '{}'
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.content,
    document_chunks.metadata,
    1 - (document_chunks.embedding <=> query_embedding) AS similarity
  FROM document_chunks
  WHERE 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY document_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create indexes for better performance
CREATE INDEX idx_documents_filename ON documents(filename);
CREATE INDEX idx_documents_uploaded_at ON documents(uploaded_at);
CREATE INDEX idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_document_chunks_created_at ON document_chunks(created_at);

-- Enable Row Level Security (RLS) for security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "Public can view documents" ON documents FOR SELECT USING (true);
CREATE POLICY "Public can insert documents" ON documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update documents" ON documents FOR UPDATE USING (true);
CREATE POLICY "Public can delete documents" ON documents FOR DELETE USING (true);

CREATE POLICY "Public can view document_chunks" ON document_chunks FOR SELECT USING (true);
CREATE POLICY "Public can insert document_chunks" ON document_chunks FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update document_chunks" ON document_chunks FOR UPDATE USING (true);
CREATE POLICY "Public can delete document_chunks" ON document_chunks FOR DELETE USING (true);