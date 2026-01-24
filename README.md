# PlanetScale mcp server functions

## Quick start

To get started, install dependencies and run the development server:

```bash
pnpm install
```

To build a zip file that can be deployed to Gram, run:

```bash
pnpm build
```

After building, push your function to Gram with:

```bash
pnpm push
```

## Testing Locally

If you want to poke at the tools you've built during local development, you can
start a local MCP server over stdio transport with:

```bash
pnpm dev
```

Specifically, this command will spin up [MCP inspector][mcp-inspector] to let
you interactively test your tools.

[mcp-inspector]: https://github.com/modelcontextprotocol/inspector

## What next?

To learn more about using the framework, check out [CONTRIBUTING.md](./CONTRIBUTING.md)
