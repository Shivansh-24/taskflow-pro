# AI Tool Declaration

## Development Assistance
Development followed a highly symbiotic, AI-partnered workflow where the boundary between human architecture and machine execution was intentionally blurred. I defined the core system architecture, data models, business rules (like cycle prevention and no-compounding propagation), and UI/UX direction, while treating Google Gemini and Claude chat interfaces as active pair-programmers.

Together, we iterated on complex logic and translated architectural decisions into functional code. For instance, when I identified a downstream date-propagation bug by hand-calculating the expected mathematical results, the AI and I worked in tandem to refine the syntax and perfectly align the code with my mathematical model. Similarly, we collaborated to debug UI state issues, such as an unconditional success-toast misrepresenting failed operations.

While the AI drove the rapid generation of structural code, boilerplate, and algorithmic drafts to keep pace with hackathon constraints, I retained absolute control over the product scope—making deliberate decisions to cut peripheral features like WIP limits to protect the stability of our core engine. Ultimately, the architectural vision, correctness verification, and final code integration were human-led, while the execution was a true joint effort.

## In-App AI Features
The TaskFlow Pro application itself features an "AI Dependency Assistant". This feature leverages an LLM to read a new task's title and description, evaluate all other tasks on the board, and logically deduce which existing tasks should be prerequisites. The system is currently configured to support multiple providers depending on the API key provided in the environment, routing requests dynamically to Google Gemini (gemini-2.0-flash) via the google-genai SDK, OpenRouter, or OpenAI.

### Grounding & Safety Constraints
To ensure reliable and safe operation, the AI Dependency Assistant employs a strict grounding approach:

* **Constrained Prompts**: The LLM is instructed to strictly select from a JSON array of existing task IDs, explicitly forbidding the invention or hallucination of new tasks.
* **Server-Side Validation**: All AI suggestions returned to the backend are validated against the database. The system verifies that the suggested tasks exist, applies the standard Depth-First Search cycle-check to prevent circular dependencies, and filters out self-references.
* **Human-in-the-Loop**: Nothing suggested by the AI is persisted automatically. Suggestions are surfaced dynamically in the frontend UI, where the human user must explicitly review, select, and save the suggestions to create actual edges in the graph.
