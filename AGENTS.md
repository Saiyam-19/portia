<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- codebase-memory-mcp:start -->
# Codebase Knowledge Graph

Prefer codebase-memory-mcp for structural code discovery:

1. `search_graph` to find symbols.
2. `trace_path` to trace callers and callees.
3. `get_code_snippet` to read specific symbols.
4. `query_graph` for complex relationships.
5. `get_architecture` for a project overview.

Use project `Users-saiyamchaplot-Documents-portia-main`. Check `index_status`
before relying on graph freshness, and `check_index_coverage` for evidence paths.
Refresh a stale index with `index_repository` using this repository's absolute path.
Reuse the existing MCP daemon; do not start duplicate workers or interrupt other clients.

Use text search for literals, configuration, non-code files, and missing or stale
graph coverage. If MCP tools are unavailable, report that limitation and use source reads.
<!-- codebase-memory-mcp:end -->
