# Testing & Quality Assurance

TaskFlow Pro employs a hybrid testing strategy, combining automated unit/integration tests for critical backend DAG logic with rigorous manual workflow validation for frontend state management.

## Automated Testing (`pytest`)

The backend test suite is executed using `pytest` and `fastapi.testclient.TestClient`. 

### Current Execution Results
```text
============================= test session starts =============================
platform win32 -- Python 3.12.10, pytest-9.1.1, pluggy-1.6.0
rootdir: backend
plugins: anyio-4.15.1
collected 7 items

tests\test_ai_suggestions.py .                                           [ 14%]
tests\test_api.py ..                                                     [ 42%]
tests\test_scheduler.py ....                                             [100%]

======================= 7 passed, 42 warnings in 1.22s ========================
```

### Coverage Modules

1. **`test_api.py`** 
   * *Purpose*: Validates FastAPI routing and REST semantics.
   * *Coverage*: End-to-end task creation, dependency creation, and cycle rejection at the API layer (returns 400 Bad Request on cycle). Also validates rollback status changes over HTTP.

2. **`test_scheduler.py`**
   * *Purpose*: Validates the core mathematical properties of the DAG.
   * *Coverage*: 
     * Verifies topological sorting and `MAX()` logic (no-compounding propagation) using mock tasks.
     * Verifies DFS `would_create_cycle` algorithms dynamically against in-memory SQLite states.

3. **`test_ai_suggestions.py`**
   * *Purpose*: Validates the safety and grounding of the LLM pipeline.
   * *Coverage*: Ensures the AI cannot hallucinate IDs by filtering suggestions against real DB records, and verifies self-reference rejection.

## Manual Testing Scenarios

Given the visual and drag-and-drop nature of the Kanban board, extensive manual testing was conducted during development to verify UI state alignment with backend persistence.

| Scenario | Steps to Reproduce | Expected Result | Observed Result |
| --- | --- | --- | --- |
| **Persistence** | Drag a task from Backlog to In Progress, refresh the page. | Task remains in In Progress. | Not re-run on final build |
| **Cycle Rejection** | Open Edit Modal for Task 1, attempt to add Task 3 as a dependency (where 1->2->3 already exists implicitly, so adding 3 creates 1->2->3->1). | System displays red toast error, backend rejects transaction. | ✅ Passed |
| **No-Compounding** | Edit Task 5 (left diamond branch) duration to 15 days. | Task 7 (diamond convergence) start date shifts based entirely on Task 5, ignoring Task 6. | ✅ Passed |
| **Rollback** | Drag Task 4 (Done) back to Backlog. | Task 5 and 6 immediately update their dependency status to 'Blocked', while Task 7 was already Blocked. | Not re-run on final build (covered by an automated test) |
| **Soft Blocker Warning** | Drag a 'Blocked' task to the 'Done' column. | A confirmation modal appears warning the user about incomplete prerequisites. | ✅ Passed |
| **Cascade Deletion** | Delete Task 5. | Task 5 is removed. Edges 4->5 and 5->7 are automatically pruned. | Not re-run on final build |
| **AI Suggestions** | Create a new task related to DB models, click AI Suggest. | AI dynamically returns recommendations (results vary by model). | Not re-run on final build |
| **Critical Path Toggle** | Click the Graph View button, toggle 'Highlight Critical Path'. | The longest time-path (Task 4 -> Task 5 -> Task 7) is highlighted with thick red animated edges. | ✅ Passed |

## Known Limitations Discovered During Testing
*   **Timezone Strip**: The HTML native `<input type="date">` naturally strips time signatures. For scheduling, this means tasks lock to midnight `00:00:00` of their respective local timezones. 
*   **Direct Prerequisite Assumption**: The `dependency_status` visual flag evaluates strictly by querying immediate prerequisites. If Task A is In Progress, Task B is Done, and Task C depends on B, Task C will appear 'Ready' even though its grand-parent A is incomplete.
*   **Cascade Orphan behavior**: Deleting a task successfully prunes incoming/outgoing dependencies, but does *not* automatically bridge its parents to its children.
