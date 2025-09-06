# Supabase Vector Store Setup Guide

This guide will help you set up Supabase as a vector store for your CSV chatbot.

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/sign in
2. Click "New Project"
3. Choose your organization
4. Enter project name (e.g., "csv-chatbot")
5. Create a secure database password
6. Choose a region close to you
7. Click "Create new project"

## 2. Enable Vector Extension

1. In your Supabase dashboard, go to "SQL Editor"
2. Click "New Query"
3. Copy and paste the contents of `supabase-schema.sql` from this project
4. Click "Run" to execute the SQL

This will:

- Enable the `vector` extension
- Create `documents` table for file metadata
- Create `document_chunks` table for vector embeddings
- Set up indexes for fast similarity search
- Create the `match_documents` function for vector search
- Configure Row Level Security policies

## 3. Get Your Supabase Credentials

1. In your Supabase dashboard, go to "Settings" → "API"
2. Copy the following values:
   - **Project URL**: `https://your-project-id.supabase.co`
   - **Anon Public Key**: `eyJ...` (starts with eyJ)
   - **Service Role Key**: `eyJ...` (different from anon key, has more permissions)

## 4. Update Environment Variables

Update your `.env.local` file with your credentials:

```env
# OpenAI Configuration for LangChain
OPENAI_API_KEY=your_openai_api_key_here

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

⚠️ **Important Security Notes:**

- Never commit your `.env.local` file to version control
- The Service Role Key has admin privileges - keep it secure
- Only use the Service Role Key on the server side

## 5. Test Your Setup

1. Start your development server: `npm run dev`
2. Upload a CSV file using the interface
3. Check your Supabase dashboard:
   - Go to "Table Editor" → "documents" to see uploaded files
   - Go to "Table Editor" → "document_chunks" to see vector embeddings
4. Try asking questions about your uploaded data

## 6. Verify Vector Storage

In the Supabase SQL Editor, you can run queries to verify your data:

```sql
-- Check uploaded documents
SELECT filename, file_size, uploaded_at, metadata
FROM documents
ORDER BY uploaded_at DESC;

-- Check document chunks with embeddings
SELECT content, metadata,
       CASE WHEN embedding IS NOT NULL THEN 'Has Embedding' ELSE 'No Embedding' END as embedding_status
FROM document_chunks
LIMIT 10;

-- Test vector similarity search
SELECT content, metadata,
       1 - (embedding <=> (SELECT embedding FROM document_chunks LIMIT 1)) as similarity
FROM document_chunks
WHERE embedding IS NOT NULL
ORDER BY embedding <=> (SELECT embedding FROM document_chunks LIMIT 1)
LIMIT 5;
```

## 7. Features You Get

✅ **Persistent Storage**: Files and embeddings are stored permanently in Supabase
✅ **Vector Search**: Fast similarity search using pgvector
✅ **File Management**: Upload, view, and delete documents
✅ **Scalable**: Supabase handles scaling automatically
✅ **Real-time**: See uploaded documents immediately
✅ **Backup**: Supabase provides automatic backups

## 8. Troubleshooting

### Common Issues:

1. **"No CSV file uploaded" error**

   - Make sure you've uploaded a file first
   - Check the console for any upload errors

2. **Vector search not working**

   - Verify the `vector` extension is enabled in Supabase
   - Check that the `match_documents` function was created successfully

3. **Upload fails**

   - Check your OpenAI API key is valid
   - Verify Supabase credentials are correct
   - Check the browser console for detailed error messages

4. **Database connection issues**
   - Verify your Supabase URL and keys in `.env.local`
   - Make sure your Supabase project is active

### Monitoring:

- Check Supabase dashboard for API usage
- Monitor OpenAI API usage for embedding costs
- Use Supabase logs to debug any database issues

## Next Steps

- Add user authentication with Supabase Auth
- Implement file sharing between users
- Add support for other file types (JSON, TXT, etc.)
- Set up production deployment with proper environment variables
