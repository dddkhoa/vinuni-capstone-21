# ChatVin - VinUni AI Chatbot

## Capstone Team Members

- Dang Dinh Dang Khoa - Backend Lead
- Nguyen Tung Lam - Frontend Lead
- Huynh Quynh Anh - Backend & AI
- Nguyen Nhat Minh - Backend & DevOps
- Le Hoang Tung - DevOps & Frontend
- Le Dieu Linh - PM & AI

## Project Overview

This is a RAG-style AI chatbot built with Next.js 15 and the AI SDK. We implement a Claude-style interface with advanced features including document artifacts, file search capabilities, and multi-model support.

## Architecture

### Tech Stack

- **Frontend**: Next.js 15 with App Router, React 19 RC
- **AI Integration**: AI SDK by Vercel with multi-provider support
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: NextAuth.js with credentials provider
- **UI Components**: shadcn/ui with Radix UI primitives
- **Styling**: Tailwind CSS with Framer Motion animations
- **Storage**: Vercel Blob for file storage
- **Package Manager**: pnpm

### Core Features

#### 1. AI Models & Providers

- **Default Provider**: OpenAI GPT-3.5-turbo (configurable)
- **Multi-Model Support**: Regular chat model + reasoning model with `<think>` tags
- **Provider Architecture**: Custom provider abstraction supporting:
  - OpenAI
  - Anthropic
  - Google Gemini
  - Other AI SDK-compatible providers

#### 2. Document Artifacts System

The project implements a sophisticated artifact system similar to Claude's interface:

- **Artifact Types**: Text, Code (Python), Spreadsheets, Images
- **Real-time Preview**: Live updates in right sidebar
- **Version Control**: Full document history with diff viewing
- **Collaborative Editing**: Document suggestions and collaborative features
- **Auto-save**: Debounced saving with dirty state tracking

#### 3. File Search Integration

Advanced file search capabilities with:

- **Vector Search**: OpenAI-powered semantic search
- **Google Sheets Integration**: Filename-to-URL mapping
- **Citation System**: Automatic source citation with URLs
- **VinUni-specific**: Restricted to university-related queries
- **Fallback Mechanisms**: Web search when vector search fails

#### 4. Database Schema

```sql
-- Core entities
User: id, email, password, original_password
Chat: id, createdAt, title, userId, visibility
Message_v2: id, chatId, role, parts, attachments, createdAt, annotations
Document: id, createdAt, title, content, kind, userId
Suggestion: id, documentId, originalText, suggestedText, description, isResolved
Vote_v2: chatId, messageId, isUpvoted
```

## Key Components

### 1. Chat Interface (`app/(chat)/`)

- **Route Structure**: App Router with grouped routes
- **Real-time Streaming**: Server-sent events for live responses
- **Message Handling**: Parts-based message structure supporting attachments
- **Multimodal Input**: Support for text, images, and file uploads

### 2. API Routes (`app/(chat)/api/`)

- **`/api/chat`**: Main chat endpoint with streaming responses
- **`/api/document`**: Document CRUD operations
- **`/api/files`**: File upload and management
- **`/api/history`**: Chat history management
- **`/api/suggestions`**: Document suggestion system
- **`/api/vote`**: Message voting system

### 3. AI Tools (`lib/ai/tools/`)

- **File Search**: Vector search with Google Sheets integration
- **Document Creation**: Artifact document generation
- **Document Updates**: Targeted document modifications
- **Weather**: Example external API integration

### 4. Core Libraries (`lib/`)

- **Database**: Drizzle ORM with migration system
- **AI**: Provider abstraction and prompt management
- **Utils**: Utility functions and helpers
- **Constants**: Environment-specific configurations

## Prompt Engineering

### System Prompts

The project uses sophisticated prompt engineering:

#### File Search Prompt

- **Restriction**: VinUni/university-only topics
- **Source Validation**: Must use provided documents only
- **Denial System**: "DENIED" for off-topic queries
- **Not Found Handling**: "NOT_FOUND" when no relevant docs

#### Artifacts Prompt

- **Creation Rules**: When to create vs. update documents
- **Language Support**: Python focus with expansion capabilities
- **User Interaction**: Wait for feedback before updates
- **Content Guidelines**: Substantial content threshold

#### Reasoning Model

- **Advanced Reasoning**: Uses `<think>` tags for step-by-step thinking
- **Model Selection**: Conditional system prompt based on model choice

## Development Workflow

### Environment Setup

```bash
# Install dependencies
pnpm install

# Database setup
pnpm db:generate
pnpm db:migrate

# Development server
pnpm dev
```

### Key Scripts

- `pnpm dev`: Development with Turbo
- `pnpm build`: Production build with migration
- `pnpm db:studio`: Drizzle Studio for database management
- `pnpm test`: Playwright E2E testing

### Environment Variables

- `OPENAI_API_KEY`: OpenAI API access
- `GOOGLE_CREDENTIALS_JSON`: Google Sheets service account
- `GOOGLE_SPREADSHEET_ID`: File reference spreadsheet
- `AUTH_SECRET`: NextAuth.js secret
- Database connection strings for PostgreSQL

## Security Features

### Authentication

- **Credential-based**: Email/password with bcrypt hashing
- **Session Management**: JWT-based sessions
- **Password Security**: Dummy password comparison for timing attacks
- **User Isolation**: Chat and document access control

### Data Protection

- **Input Validation**: Zod schema validation
- **SQL Injection**: Parameterized queries via Drizzle
- **XSS Prevention**: React's built-in protection + sanitization
- **CSRF Protection**: NextAuth.js built-in CSRF protection

## Performance Optimizations

### Frontend

- **React Server Components**: Reduced client bundle
- **Streaming UI**: Progressive content loading
- **Debounced Saves**: Reduced database writes
- **SWR Caching**: Client-side data caching
- **Parallel Tool Calls**: Efficient AI tool execution

### Backend

- **Connection Pooling**: PostgreSQL connection management
- **Middleware**: Turbo-powered development
- **Edge Functions**: Vercel edge runtime support
- **Incremental Builds**: Next.js optimization

## File Structure

```
├── app/                 # Next.js App Router
│   ├── (auth)/         # Authentication routes
│   ├── (chat)/         # Main chat interface
│   └── globals.css     # Global styles
├── components/         # React components
│   ├── ui/            # shadcn/ui components
│   ├── artifact.tsx   # Main artifact component
│   ├── chat.tsx       # Chat interface
│   └── ...
├── lib/               # Core libraries
│   ├── ai/           # AI integration
│   ├── db/           # Database layer
│   └── utils.ts      # Utility functions
├── hooks/            # Custom React hooks
├── artifacts/        # Artifact type definitions
└── tests/           # E2E tests
```

## Deployment

### Vercel Deployment

- **One-click Deploy**: Pre-configured Vercel button
- **Environment Setup**: Automatic integration setup
- **Database**: Neon Serverless Postgres
- **Storage**: Vercel Blob integration
- **Analytics**: Vercel Analytics integration

### Local Development

- **Database**: Local PostgreSQL or Neon
- **File Storage**: Local file system or Vercel Blob
- **AI Providers**: OpenAI API key required

## Extension Points

### Adding New AI Providers

1. Update `lib/ai/providers.ts`
2. Add provider-specific configuration
3. Update environment variables
4. Test model compatibility

### Custom Artifact Types

1. Create artifact definition in `artifacts/`
2. Add to `artifactDefinitions` array
3. Implement client-side renderer
4. Update database schema if needed

### New AI Tools

1. Create tool in `lib/ai/tools/`
2. Add to main chat endpoint
3. Update system prompts
4. Test integration

## Testing

### E2E Testing

- **Playwright**: Comprehensive browser testing
- **Test Environment**: Isolated test database
- **Mock Services**: AI provider mocking
- **CI/CD**: GitHub Actions integration

### Development Testing

- **Type Safety**: TypeScript throughout
- **Linting**: ESLint + Biome
- **Formatting**: Biome formatter
- **Pre-commit**: Automated checks

---

For questions, please contact us at:
21khoa.ddd@vinuni.edu.vn or 21lam.nt@vinuni.edu.vn

## Enhanced VinUni Search System

This application features an enhanced search system specifically designed for VinUni (VinUniversity) document searches:

### Key Features:

1. **Dual Domain Search**: Automatically searches both `policy.vinuni.edu.vn` and `vinuni.edu.vn` domains
2. **Top Results Collection**: Collects top 3 results from each domain (maximum 6 total)
3. **Enhanced Guardrails**: Validates queries to ensure they're VinUni-related before searching
4. **Tool Usage Enforcement**: Forces the AI to use the search tool for all VinUni queries
5. **Transparent Search Process**: Shows detailed progress and search statistics

### Search Flow:

1. **Query Validation**: Checks if the question is VinUni-related
2. **Keyword Extraction**: Extracts meaningful keywords from the user query
3. **Dual Domain Search**: Searches both VinUni domains simultaneously
4. **Result Processing**: Combines and ranks results by relevance
5. **Answer Generation**: Creates comprehensive answers based on found documents

### UI Features:

- **Real-time Progress**: Shows search steps as they happen
- **Search Statistics**: Displays results count from each domain
- **Source Citations**: Provides links to original documents
- **Keyword Display**: Shows extracted search keywords
- **Error Handling**: Clear messaging for invalid queries or no results

### Tool Enforcement:

- AI must explicitly announce when using the search tool
- No document creation/editing tools for search queries
- Automatic fallback messages for insufficient results
- Strict adherence to VinUni-only content policy

This system ensures accurate, transparent, and comprehensive responses to VinUni-related queries while preventing hallucination and maintaining strict content guidelines.
