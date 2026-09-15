# Sovereign Agentic AI

An air-gapped, offline-first Agentic AI system built with a React/Vite frontend and a powerful Python FastAPI backend. The system is designed to run locally with strict privacy enforcement, ensuring no data leaves the host environment.

## 🌟 Features

- **Strictly Offline & Air-Gapped:** Zero external internet dependencies. HuggingFace, Transformers, and datasets are strictly configured to run in offline mode. Localhost-only CORS enforcement.
- **Retrieval-Augmented Generation (RAG):** Built-in document parsing, chunking, and local embedding generation with FAISS vector stores for rapid retrieval.
- **Vision Capabilities:** Image loading and offline analysis using localized vision models (e.g., Qwen-VL).
- **Voice Assistant:** Native voice integration endpoints.
- **Robust Auditing & Telemetry:** Full visibility into agent actions, execution history, and system approvals.
- **Agent Orchestration:** Specialized agents (document reasoning, code generation, execution, and dynamic routing).

## 🛠️ Tech Stack

**Frontend:**
- React 18
- Vite
- TypeScript
- TailwindCSS
- Lucide Icons & KaTeX

**Backend:**
- Python 3.11+
- FastAPI & Uvicorn
- PyTorch & Transformers
- FAISS (CPU)
- Sentence Transformers

## 🚀 Getting Started

### 1. Backend Setup (Python)

Ensure you have Python installed. Navigate to the project root and install the dependencies:

```bash
pip install -r requirements.txt
```

Run the FastAPI backend server:

```bash
uvicorn backend.main:app --reload --port 8000
```

### 2. Frontend Setup (Node.js)

Open a new terminal window, navigate to the project root, and install the Node dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

## 🔒 Security & Privacy

This system is built with security as a primary focus. All models must be downloaded locally prior to execution. The backend explicitly disables parallel tokenizers and forces all HuggingFace hubs to offline mode to prevent accidental data leakage.
