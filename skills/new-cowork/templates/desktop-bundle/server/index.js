#!/usr/bin/env node
// Cowork desktop bundle — delegates to @modelcontextprotocol/server-filesystem
// with the user-configured allowed_directories args.
//
// The filesystem MCP package's bin is dist/index.js (verified via
// `npm view @modelcontextprotocol/server-filesystem bin`). It's ESM with
// top-level await, so this CJS wrapper must use dynamic import() — require()
// throws ERR_REQUIRE_ASYNC_MODULE on Node ≥22. The dynamic import keeps the
// MCP server alive via its stdio loops once loaded.
import("@modelcontextprotocol/server-filesystem/dist/index.js");
