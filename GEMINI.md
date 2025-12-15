# Agent99 Project Context (`GEMINI.md`)

## 1. Overview
**Agent99** is a "Unified Runtime" designed to treat "Services-as-a-Service" and "Agents-as-Data". It provides a fluent TypeScript Builder API that compiles to a portable, safe, and Turing-complete JSON AST, which is then executed by a secure VM.

**This Repository:**
This project serves as the **TosiJS Blueprint Template** for Agent99. It encapsulates the core Agent99 framework and provides a TosiJS-based UI for:
1.  **Testing/Debugging:** A harness to visualize and execute Agent99 chains.
2.  **Consumption:** A blueprint that allows other developers to easily integrate Agent99 into their applications.

## 2. Tech Stack & Libraries

### Core Logic
*   **Language:** TypeScript (Strict).
*   **Runtime:** Agent99 VM (Custom "Fuel"-based execution engine).
*   **Schema & Validation:** `tosijs-schema` (imported as `s`).
    *   *Note:* Used for runtime validation, type inference, and defining Agent99 input/output contracts.

### User Interface
*   **Framework:** `tosijs` (imported as `xin` or destructured parts).
    *   *Usage:* Web Components, State Management (`tosi`), and Reactive Views.
    *   *Pattern:* This repo produces a **Blueprint** (a portable bundle of logic and UI).

## 3. Architecture

### A. The Agent99 Engine (Logic Layer)
1.  **Layer 0: The Runtime**
    *   Pure TS, no deps.
    *   **Environment Agnostic:** Runs in Browser, Node, Bun, Deno, etc.
    *   Sandboxed (No `eval`).
    *   Fuel-limited (prevents infinite loops).
2.  **Layer 1: The Primitives (Atoms)**
    *   Self-describing atoms (`seq`, `if`, `math.calc`, `http.fetch`, etc.).
3.  **Layer 2: The Builder SDK**
    *   Fluent API generating the JSON AST.
    *   **The Golden Syntax:**
        ```typescript
        const logic = A99.take(s.object({ x: s.number() }))
          .calc("x * 2").as('result')
          .return(s.object({ result: s.number() }));
        ```

### B. The UI Layer (Presentation Layer)
*   **Blueprints:** We define `XinBlueprint` artifacts to export the Agent99 capabilities.
*   **State:** Uses `tosi` proxies for reactive state management of the agent execution (fuel levels, variable scope, logs).
*   **Components:** Custom web components to visualize the AST and execution trace.

## 4. Implementation Strategy

1.  **Fluent Builder:** Build out the Builder SDK with extensive test coverage. Focus on ergonomic Typescript generation of the JSON AST.
2.  **Runtime & Core Atoms:** Build the core runtime (VM) and control flow atoms (`seq`, `if`, `scope`).
3.  **Mocked Integration:** Create tests with mocked atoms for network/database access to verify the full flow (Builder -> AST -> Runtime).
4.  **Real Atoms:** Implement concrete atoms:
    *   **Browser:** DOM, LocalStorage.
    *   **Server:** Firebase, Node-fetch.
    *   **AI:** Agent/Delegate atoms (LM Studio for local, Gemini for server).
5.  **Extensibility:** Architect the atom system to allow easy custom extensions (e.g. Supabase, AWS).

## 5. Development Standards

### General
*   **Files:**
    *   `src/blueprint.ts`: Main entry point for the blueprint.
    *   `src/`: Source code for Agent99 runtime and UI components.
*   **Formatting:** Prettier + ESLint.

### Schema (`tosijs-schema`)
*   Prefer `tosijs-schema` over Zod.
*   Use "Tacit Schemas" where possible for cleaner syntax.
*   Output schemas must be strict (no extra properties) for LLM compatibility.

### Agent99 "Atoms"
*   All new primitives must define: `{ op, docs, in, out, exec, examples }`.
*   IO operations (HTTP, File) must use the **Capability Factory** pattern for security.

## 6. Reference Contexts
*   **Project Plan & Architecture:** [CTX_AGENT99.md](./CTX_AGENT99.md)
*   **Schema Library:** [CTX_TOSIJS_SCHEMA.md](./CTX_TOSIJS_SCHEMA.md)
*   **UI Framework:** [CTX_TOSIJS.md](./CTX_TOSIJS.md)