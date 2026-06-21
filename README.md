<div align="center">

# SlothQuery

**Local-first organizational intelligence platform for SQL engineers and data analysts.**

SlothQuery transforms your raw SQL queries, business rules, table schemas, and analyst notes into a searchable, AI-powered knowledge base — so your team never has to rediscover the same logic twice.

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?style=flat&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![SQLite](https://img.shields.io/badge/SQLite-Local--First-003B57?style=flat&logo=sqlite&logoColor=white)](https://sqlite.org)

</div>

---

## What is SlothQuery?

SlothQuery is a **local-first** knowledge retrieval system for data teams. Instead of storing queries in a flat file or Notion doc, SlothQuery extracts structured intelligence from each query — business intent, schema entities, business rules, transformations — and makes all of it searchable and retrievable at chat time.

Think of it as **institutional memory for your SQL stack**, powered by an LLM that only ever answers from your own grounded knowledge — never from hallucinated context.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Backend** | Python · FastAPI · SQLAlchemy · SQLite · ChromaDB · LiteLLM |
| **Frontend** | React · TypeScript · Vite · Tailwind CSS · Axios · Lucide Icons |
| **AI / Retrieval** | BGE-small-en-v1.5 (local embeddings) · LiteLLM (multi-provider LLM) · ChromaDB (vector search) |

---

## Features

### Knowledge Studio
- Add SQL queries with title, description, dialect, tags, and analyst comments
- Human-in-the-loop AI extraction — review and approve extracted business intent, schema entities, business rules, metric transformations, and ambiguities before saving
- Organize knowledge into domain Vaults (e.g. Marketing, Finance, Product)
- Business Rules Playbooks — consolidated business logic documentation
- Table Schema documentation with join patterns and naming conventions
- Analyst Notes — freeform knowledge about metrics, caveats, and patterns
- Delete queries (with ChromaDB sync) and delete entire vaults (full cascade)

### Chat Interface
- Grounded AI chat — every answer is retrieved from your knowledge base; the LLM never invents tables or metrics
- Multi-vault context — query across multiple vaults in a single conversation
- Dialect-aware SQL generation — Snowflake, BigQuery, PostgreSQL, Trino, Redshift
- Tag filtering — narrow retrieval to specific topic tags
- Markdown-rendered responses with bold, italic, lists, and SQL code blocks with one-click copy
- Auto-named persistent chat history
- Onboarding guard — if your knowledge base is empty, SlothQuery guides you to add content first

### LLM Provider Management
- Supports OpenAI, Anthropic, Google Gemini, Groq, OpenRouter, DeepSeek
- API keys are encrypted with Fernet symmetric encryption before being written to SQLite — never logged or exposed to the frontend
- Test Connection before saving
- Dynamic provider switching without restarting the app
- Last active provider automatically restored on restart

### Knowledge Portability
- Export your entire knowledge base or individual vaults as a `.slothkb` archive
- Import and automatically re-index embeddings
- Re-index — rebuild the entire ChromaDB vector store from SQLite at any time

---

## Architecture

```
UI (React)
  ↓
API (FastAPI)
  ↓
Services (chat · extraction · retrieval · provider · vector_store)
  ↓
Repositories (SQLAlchemy)
  ↓
Storage (SQLite + ChromaDB)
```

- **Local-first** — all data lives in `~/Documents/SlothQuery/` on your machine
- **SQLite** is the source of truth for all structured data
- **ChromaDB** is derived state — always rebuildable from SQLite via Re-index
- **No cloud dependency** — works fully offline once the embedding model is cached

---

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- An API key from any supported LLM provider

### 1. Clone the repository

```bash
git clone https://github.com/your-username/slothquery.git
cd slothquery
```

### 2. Set up the Backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv

# Windows
.\venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the backend server
uvicorn app.main:app --reload --port 8000
```

> First run downloads the BGE-small-en-v1.5 embedding model (~130MB). Subsequent starts are fast.

API available at: `http://127.0.0.1:8000`
Interactive docs: `http://127.0.0.1:8000/docs`

### 3. Set up the Frontend

```bash
cd frontend
npm install
npm run dev
```

App available at: `http://localhost:3000`

---

## How to Use SlothQuery

### Step 1 — Configure an LLM Provider
1. Open `http://localhost:3000`
2. Click the **Settings** icon or click **Configure** on the amber banner
3. Select your provider, enter model name and API key
4. Click **Test & Save** — your key is encrypted and stored locally

### Step 2 — Build Your Knowledge Base

Go to **Knowledge Studio** in the left sidebar.

**Adding a Query:**
1. Click `+ Add Asset → Add Query`
2. Fill in title, vault, dialect, description, and tags
3. Paste your SQL and analyst comments
4. Click **Generate & Review Intelligence** — AI extracts context
5. Review the draft, edit anything incorrect, then **Approve & Save**

**Adding Playbooks, Schemas, Notes:**
1. Click `+ Add Asset` and choose the asset type
2. Name it, select a vault, write the content, and save

### Step 3 — Chat

1. Go to the **Chat** view
2. Ask questions or request SQL — e.g.:
   - *"Show me the ARR calculation query"*
   - *"Write a Snowflake query for weekly active users"*
   - *"What business rules apply to revenue metrics?"*
3. SlothQuery retrieves matching context and generates a grounded response
4. SQL appears in a code block with a **Copy** button

> Tip: Use the **+** button in the chat input to filter by vault or tags.

---

## Data Storage

All data is stored locally at:

```
~/Documents/SlothQuery/
├── slothquery.db        # SQLite — queries, chats, providers (encrypted keys)
├── chroma_db/           # ChromaDB — vector embeddings (rebuildable)
└── Exports/             # .slothkb export archives
```

> The SQLite database contains encrypted API keys. Never commit it to version control — it is excluded by `.gitignore`.

---

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Send chat message | `Enter` |
| New line in input | `Shift + Enter` |

---

## Roadmap

- [ ] Schema Explorer with live table preview
- [ ] Query versioning and diff view
- [ ] Team shared knowledge base sync
- [ ] Slack / Teams bot integration
- [ ] Desktop wrapper (Tauri)
- [ ] MCP server support for AI coding agents

---

## Contributing

Branch naming:
```
feat/add-schema-versioning
fix/resolve-chromadb-sync
refactor/move-embedding-service
```

---

## License

MIT — use freely, build on top, keep it local-first.
