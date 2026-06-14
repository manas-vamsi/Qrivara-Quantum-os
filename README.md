# ⚛️ QRIVARA

**The Next-Gen Operating System for Quantum Hardware Design.**

QRIVARA is a premium, dark-first engineering platform built for designing, simulating, and optimizing superconducting quantum hardware. It provides a seamless, high-performance interface that bridges the gap between visual design and scientific rigor.

> **Design Philosophy:** A fusion of Linear's speed, Figma's flexibility, Stripe's clarity, and VS Code's power—tailored for the quantum era.

---

## 🚀 Key Modules

| Module | Description | Highlights |
| :--- | :--- | :--- |
| **Dashboard** | Mission control | KPIs, real-time throughput, and project activity. |
| **Visual Designer** | Infinite canvas | Drag-and-drop qubits, resonators, and couplers. |
| **Code Studio** | Integrated Editor | Bidirectional sync between visual canvas and Python code. |
| **Sim Workspace** | Physics Engine | Frequency sweeps, capacitance matrices, and coupling analysis. |
| **Opt Engine** | Goal-Driven Tuning | Multi-objective optimization with Pareto front visualization. |
| **Experiments** | Version Control | Git-like history for design evolution and comparisons. |

---

## 🛠 Tech Stack

### Frontend
- **Framework:** React 18 (TypeScript)
- **Build Tool:** Vite 5
- **Styling:** Tailwind CSS (Token-driven)
- **Visuals:** Framer Motion, Recharts, @xyflow/react
- **Editor:** @monaco-editor/react
- **State:** Zustand

### Backend
- **Framework:** FastAPI (Python 3.12+)
- **Server:** Uvicorn
- **Database:** SQLModel (SQLite/PostgreSQL ready)
- **Scientific:** NumPy, Pydantic v2

---

## 🏁 Getting Started

Follow these steps to get the full QRIVARA environment running on your machine.

### 1. Prerequisites
- **Node.js** (v18+)
- **Python** (v3.12+)
- **Git Bash** (Recommended for Windows users)

### 2. Frontend Setup
Open a terminal in the root directory:
```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```
🌐 **Access at:** [http://localhost:5173](http://localhost:5173)

### 3. Backend Setup
Open a **separate terminal** and navigate to the `backend` folder:
```bash
cd backend

# Activate the virtual environment
# On Windows (Git Bash):
source .venv/Scripts/activate
# On Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# On macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
uvicorn app.main:app --reload
```
📡 **API Docs at:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## ⌨️ Keyboard Shortcuts

- `⌘ K` or `Ctrl + K` — Open Command Palette
- `Esc` — Close modals/palettes
- `S` — Save current design
- `Space` — Pan designer canvas

---

## 🏗 Architecture Overview

QRIVARA is designed for scale:
- **Stateless API:** The FastAPI layer handles transactional requests with sub-100ms latency.
- **Decoupled Compute:** Heavy simulations are dispatched to background workers, ensuring the UI remains responsive.
- **CRDT Design:** Supports conflict-free concurrent editing for future-proof collaboration.

---

## 🌓 Theme & Personalization

QRIVARA defaults to a "Deep Space" dark theme to reduce eye strain during long engineering sessions. Themes can be toggled via the Command Palette or Settings.

---

*QRIVARA — Built by engineers, for engineers. Designing the future, one qubit at a time.*
