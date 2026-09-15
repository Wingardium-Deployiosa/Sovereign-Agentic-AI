# Sovereign Agentic AI

An air-gapped, offline-first Agentic AI system built with a React/Vite frontend and a powerful Python FastAPI backend. The system is designed to run locally with strict privacy enforcement, ensuring no data leaves the host environment.

## 🎥 Video Demos
*Once your videos are uploaded to Google Drive or YouTube, you can add the links here!*
- [Demo Video 1 (e.g. footage 1) - Link here]()
- [Demo Video 2 (e.g. footage 2) - Link here]()
- [Demo Video 3 (e.g. footage 3) - Link here]()
- [Demo Video 4 (e.g. footage 4) - Link here]()

---

## 🏗️ Project Structure

This repository is organized into three main components:

1. **`Gravion-main/`**: The primary React/Vite frontend dashboard and FastAPI backend. It contains the Retrieval-Augmented Generation (RAG) system, vision capabilities, auditing, and telemetry.
2. **`Gravion-AI/`**: Contains core AI reasoning modules, debugging scripts, and experimental features.
3. **`voice assistant/`**: Native voice integration endpoints for Speech-to-Text, Text-to-Speech, and Voice Activity Detection.

---

## 🌟 Features

- **Strictly Offline & Air-Gapped:** Zero external internet dependencies. HuggingFace, Transformers, and datasets are strictly configured to run in offline mode. Localhost-only CORS enforcement.
- **Retrieval-Augmented Generation (RAG):** Built-in document parsing, chunking, and local embedding generation with FAISS vector stores for rapid retrieval.
- **Vision Capabilities:** Image loading and offline analysis using localized vision models (e.g., Qwen-VL).
- **Voice Assistant:** Native voice integration endpoints using Whisper and Piper.
- **Robust Auditing & Telemetry:** Full visibility into agent actions, execution history, and system approvals.
- **Agent Orchestration:** Specialized agents (document reasoning, code generation, execution, and dynamic routing).

---

## 🛠️ Tech Stack

**Frontend:**
- React 18, Vite, TypeScript, TailwindCSS
- Lucide Icons & KaTeX

**Backend:**
- Python 3.11+, FastAPI & Uvicorn
- PyTorch & Transformers
- FAISS (CPU), Sentence Transformers

---

## 🚀 Getting Started

### 1. Main Backend Setup (Python)

Ensure you have Python installed. Navigate to the `Gravion-main` directory and install the dependencies:

```bash
cd Gravion-main
pip install -r requirements.txt
```

Run the FastAPI backend server:

```bash
uvicorn backend.main:app --reload --port 8000
```

### 2. Main Frontend Setup (Node.js)

Open a new terminal window, navigate to the `Gravion-main` directory, and install the Node dependencies:

```bash
cd Gravion-main
npm install
```

Start the Vite development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

### 3. Voice Assistant Setup

Navigate to the voice assistant folder to install its dependencies:

```bash
cd "voice assistant/voice assistant"
pip install -r requirements.txt
python run_voice_assistant.py
```

---

## 🔒 Security & Privacy

This system is built with security as a primary focus. All models must be downloaded locally prior to execution. The backend explicitly disables parallel tokenizers and forces all HuggingFace hubs to offline mode to prevent accidental data leakage.
