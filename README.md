# TaskFlow Pro

TaskFlow Pro is a dependency-aware Kanban workflow and Directed Acyclic Graph (DAG) scheduling tool. Traditional task boards fail to handle complex engineering workflows where tasks inherently block one another. TaskFlow Pro bridges this gap by marrying visual Kanban simplicity with explicit backend DAG tracking. As task durations or dependencies change, downstream task dates propagate automatically through the graph. 

## Key Features

*   **4-Column Kanban**: Standard agile columns (Backlog, In Progress, Review, Done).

*   **Drag-Drop Persistence**: Moving tasks between columns instantly updates their `workflow_status` and board ordering.

*   **Dependency Tracking**: Tasks can block other tasks. A task has a visual `Ready` or `Blocked` dependency status indicator computed natively from its prerequisites.

*   **Dynamic Schedule Propagation**: When a duration or dependency changes, downstream start and finish dates are automatically recalculated using Kahn's algorithm.

*   **Cycle Rejection**: Strict Depth-First Search (DFS) runs on the backend before any dependency is committed, guaranteeing no circular dependencies (e.g., A -> B -> C -> A).

*   **No-Compounding Dates**: Earliest start dates are properly derived from the `MAX()` of all direct prerequisites' finish dates (rather than incorrectly summing durations).

*   **Rollback Mechanism**: If a "Done" task is dragged back to "In Progress", all its dependents are instantly re-evaluated and blocked.

*   **Critical Path**: A native DAG visualizer featuring a toggleable Critical Path overlay, identifying the exact chain of tasks determining the project's minimum length.

*   **AI Dependency Suggestion**: Context-aware LLM generation that actively reads your new task description and intelligently recommends which existing board tasks should be prerequisites.

## Tech Stack

| Layer | Technology | Why Chosen |
| --- | --- | --- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4 | Blazing fast HMR setup, type-safe robust component scaling, zero-config styling. |
| **Visualization** | `dnd-kit`, `reactflow`, `dagre` | Powerful accessible drag-and-drop combined with structured DAG layouts. |
| **Backend** | Python 3, FastAPI | Instant native request validation via Pydantic, high-performance async routing. |
| **Database** | SQLite, SQLAlchemy ORM | Zero-setup persistence for frictionless cloning and instant boot. |
| **AI Integration** | `google-genai` / HTTP APIs | Supports Gemini (gemini-2.0-flash), OpenRouter (openrouter/free), and OpenAI (gpt-3.5-turbo) automatically determined by key format. |

## Quick Start

### Backend Setup

1. Open a terminal and navigate to the `backend/` directory.

2. Create and activate a Python virtual environment:
   * Windows:
```powershell
python -m venv venv
.\venv\Scripts\activate
```
   * Mac/Linux:
```bash
python3 -m venv venv
source venv/bin/activate
```

3. Install dependencies:
```bash
python -m pip install -r requirements.txt
```

4. Create a `.env` file in the `backend/` directory:
```env
LLM_API_KEY=your_api_key_here
```

5. Seed the database (creates tasks and relationships):
```bash
python seed.py
```

6. Start the server:
```bash
python -m uvicorn main:app --reload --port 8000
```

### Frontend Setup

1. Open a new terminal and navigate to the `frontend/` directory.

2. Install Node dependencies:
```bash
npm install
```

3. Start the Vite server:
```bash
npm run dev
```

4. Open the provided URL (e.g., `http://localhost:5173`) in your browser.

### Environment Variables

| Variable | Required? | Purpose | Where to get it |
| --- | --- | --- | --- |
| `LLM_API_KEY` | Optional | Powers the AI Dependency Suggestion feature. | OpenAI requires paid credits, while Google AI Studio and OpenRouter have free tiers. |

*(Note: If the key is omitted, the AI Suggest feature will throw a UI error, but all other core features operate perfectly without it.)*

## Project Structure
```text
taskflow-pro/
+-- backend/
|   +-- main.py                # FastAPI application routing and REST logic
|   +-- database.py            # SQLite configuration and SQLAlchemy Models
|   +-- schemas.py             # Pydantic validation schemas
|   +-- scheduler.py           # DAG scheduling, topological sort, DFS algorithms
|   +-- ai_suggest.py          # LLM orchestration and prompt definitions
|   +-- seed.py                # Database population script
|   +-- requirements.txt       # Python dependencies
|   +-- tests/                 # Pytest automated test suites
+-- frontend/
|   +-- src/
|   |   +-- App.tsx            # Core Kanban board, Drag-and-Drop, Modals, DAG view
|   |   +-- api.ts             # Axios wrappers mapping directly to backend routes
|   |   +-- main.tsx           # React entry point
|   |   +-- index.css          # Tailwind and global styles
|   +-- package.json           # Node dependencies and scripts
|   +-- vite.config.ts         # Vite bundler configuration
+-- docs/
    +-- DESIGN.md              # In-depth architectural decisions and algorithm docs
    +-- TESTING.md             # Test coverage and manual QA scenarios
+-- AI_TOOL_DECLARATION.md     # Details on the AI-partnered workflow
```

## Seed Data

Running `python seed.py` provisions a realistic testing environment with 8 tasks in specific structures:

| ID | Title | Status | Duration | Prerequisites | Topology Pattern |
| --- | --- | --- | --- | --- | --- |
| 1 | Design DB Schema | Done | 2.0 | None | Linear chain start |
| 2 | Implement Models | In Progress | 3.0 | 1 | Linear chain middle |
| 3 | Create API Endpoints | Backlog | 2.0 | 2 | Linear chain end |
| 4 | Define API Spec | Done | 1.0 | None | Diamond pattern start |
| 5 | Develop Frontend UI | In Progress | 5.0 | 4 | Diamond left branch |
| 6 | Develop Backend Auth| Done | 3.0 | 4 | Diamond right branch |
| 7 | Integration Testing | Review | 4.0 | 5, 6 | Diamond convergence |
| 8 | Setup CI/CD | Backlog | 2.0 | None | Isolated |

## "Try it in 5 minutes" Judge Walkthrough

Once running, you can verify the integrity of the tool by testing the 6 core behaviors:

1. **Cycle Rejection**: Click "Edit" on Task 1 (*Design DB Schema*). In the "Add Prerequisite Dependency" dropdown, attempt to add Task 3 (*Create API Endpoints*). The system will reject this (A->B->C->A cycle) and display a red error toast.

2. **No-Compounding via the Diamond**: Edit Task 4 in the Kanban Edit modal, increase its duration by 3 days, and save. Tasks 5 and 6 each start 3 days later, and Task 7 starts exactly 3 days later (not 6), demonstrating relative shifts without cumulative summation errors.

3. **Rollback**: Move Task 1 (*Design DB Schema*) from "Done" to "In Progress", and Task 2 (*Implement Models*) instantly flips from "Ready" to "Blocked" (since dependency_status checks direct prerequisites only). As a second example, moving Task 4 back to "In Progress" makes Tasks 5 and 6 "Blocked" (though Task 6 stays in the Done column), while Task 7 was already Blocked because Task 5 is not Done.

4. **Blocked-to-Done Warning**: Attempt to drag Task 3 (which is Blocked) directly into the "Done" column. A confirmation modal will warn you that prerequisites aren't met, requiring explicit override.

5. **AI Suggest**: Click "Create Task". Enter "Write end-to-end tests". Save it, which automatically opens the Edit modal. Click the "Suggest" button (labelled with a sparkle). (Note: A valid API key is required, and AI suggestions depend on the model and are not guaranteed). A relevant suggestion would be Integration Testing, but results vary by model.

6. **Critical Path**: Click the Graph View button in the top right. Toggle "Highlight Critical Path" on. The visualization dynamically draws red edges highlighting the exact longest time-path through the active network (with the seed data, this highlights Task 4 -> Task 5 -> Task 7).

## API Summary

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/tasks` | Retrieves all tasks with evaluated `dependency_status`. |
| `POST` | `/tasks` | Creates a new task. |
| `PUT` | `/tasks/{id}` | Updates task fields and recalculates downstream dates. |
| `PUT` | `/tasks/{id}/position` | Handles drag-and-drop column sorting and status updates. |
| `DELETE`| `/tasks/{id}` | Safely deletes a task and prunes connected graph edges. |
| `POST` | `/dependencies` | Creates an edge; triggers cycle-check and recalculation. |
| `DELETE`| `/dependencies` | Removes an edge; triggers downstream date updates. |
| `POST` | `/tasks/{id}/suggest-dependencies`| Calls configured LLM to recommend prerequisites. |
| `GET` | `/critical-path` | Executes topological analysis to identify the critical path. |

## Testing

We utilize `pytest` for backend execution covering routing, edge validations, and cycle checking. 

*   **Result**: 7 passing tests across 3 modules (API, Scheduler, AI). 

*   Please refer to [TESTING.md](docs/TESTING.md) for full automation results and manual test cases.

## Troubleshooting

* **An Application Control policy has blocked this file (pip.exe / uvicorn.exe)**: Windows Smart App Control blocks unsigned launcher executables inside virtual environments. Run the tools through Python instead: `python -m pip ...`, `python -m uvicorn ...`, `python -m pytest ...`.

* **ModuleNotFoundError when testing**: Run tests with the correct path:

  * PowerShell: `$env:PYTHONPATH="."; python -m pytest tests/`

  * Mac/Linux: `PYTHONPATH=. python -m pytest tests/`

* **Server hangs on startup**: Check that you are in the `backend` directory when executing `python -m uvicorn main:app --reload`.

* **AI button errors out**: Ensure your `.env` contains a valid key, and the python virtual environment has `google-genai` installed (`python -m pip install -r requirements.txt`).

---

*For deep-dives into the architecture, please see [DESIGN.md](DESIGN.md) and [AI_TOOL_DECLARATION.md](AI_TOOL_DECLARATION.md).*

