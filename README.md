# CSV Chatbot

A simple web application that lets you chat with your CSV data using AI. Upload CSV files, select which ones to analyze, and ask questions in natural language.

## Features

- **Upload CSV files** - Drag & drop or click to upload (max 3MB)
- **Chat interface** - Ask questions about your data in plain English
- **Multi-file support** - Select specific files to query from multiple uploads
- **Smart AI filtering** - Prevents questions unrelated to your CSV data
- **Persistent storage** - Files stored in Supabase with vector search

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes, LangChain, OpenAI GPT-5-mini
- **Database**: Supabase (PostgreSQL + pgvector)
- **UI Components**: Radix UI, Lucide icons, Sonner toasts

## Quick Start

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd csv-chatbot
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Fill in your API keys:

   ```
   OPENAI_API_KEY=your_openai_api_key
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

4. **Set up Supabase database**

   - Create a new Supabase project
   - Enable the `vector` extension
   - Run the SQL schema from `supabase-schema.sql`

5. **Start development server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

## How to Use

1. **Upload CSV files** using the left panel
2. **Select files** you want to chat with (checkbox interface)
3. **Ask questions** in the chat panel on the right
4. **Get AI responses** based on your CSV data

## Example Questions

- "How many people work in San Francisco?"
- "What's the average salary by job title?"
- "Show me all software engineers"
- "Give me data analysis of this file"

## Environment Requirements

- Node.js 18+
- OpenAI API key
- Supabase account with vector extension enabled

## Project Structure

```
├── app/                # Next.js app directory
│   ├── api/           # API routes (upload, chat, documents)
│   └── page.tsx       # Main page
├── components/        # React components
│   ├── ui/           # UI primitives (buttons, cards, etc.)
│   ├── chat-panel.tsx
│   └── upload-panel.tsx
├── lib/              # Utilities and services
│   ├── vector-service.ts  # LangChain + OpenAI integration
│   └── supabase.ts       # Database client
└── supabase-schema.sql   # Database setup
```

## Notes

- Maximum file size: 3MB per CSV
- Supports standard CSV format with headers
- Uses adaptive chunking based on file size
- Files are processed and stored as vector embeddings for semantic search

## Deployment

Live URL: [CSV Chatbot](https://csv-chatbot-33xk.vercel.app/)
