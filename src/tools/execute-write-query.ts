import { Gram } from "@gram-ai/functions";
import { z } from "zod";
import {
  getDatabase,
  createVitessCredentials,
  createPostgresCredentials,
  PlanetScaleAPIError,
} from "../lib/planetscale-api.ts";
import {
  executeVitessQuery,
  executePostgresQuery,
} from "../lib/query-executor.ts";
import { validateWriteQuery } from "../lib/query-validator.ts";

export const executeWriteQueryGram = new Gram().tool({
  name: "execute_write_query",
  description:
    "Execute a write SQL query (INSERT, UPDATE, DELETE) against a PlanetScale database. This tool creates short-lived credentials and executes the query securely. TRUNCATE is blocked. DELETE and UPDATE without WHERE clause are blocked. DELETE queries require confirm_destructive: true.",
  inputSchema: {
    organization: z.string().describe("PlanetScale organization name"),
    database: z.string().describe("Database name"),
    branch: z.string().describe("Branch name (e.g., 'main')"),
    query: z.string().describe("SQL INSERT/UPDATE/DELETE query to execute"),
    confirm_destructive: z
      .boolean()
      .optional()
      .describe(
        "Required for DELETE queries and UPDATE/DELETE without WHERE clause"
      ),
  },
  async execute(ctx, input) {
    console.error(`[execute_write_query] Called with input:`, JSON.stringify(input));
    
    try {
      const token = process.env["PLANETSCALE_API_TOKEN"];
      if (!token) {
        return ctx.text("Error: PLANETSCALE_API_TOKEN environment variable is required. Set it before starting the server.");
      }

      const query = input["query"];
      if (!query) {
        return ctx.text("Error: query is required");
      }

      const organization = input["organization"];
      const database = input["database"];
      const branch = input["branch"];
      const confirmed = input["confirm_destructive"] ?? false;

      if (!organization || !database || !branch) {
        return ctx.text("Error: organization, database, and branch are required");
      }

      // Validate the write query for safety
      const validation = validateWriteQuery(query, confirmed);
      if (!validation.allowed) {
        const confirmHint = validation.requiresConfirmation 
          ? " Set confirm_destructive: true to proceed." 
          : "";
        return ctx.text(`Error: ${validation.reason ?? "Query validation failed"}${confirmHint}`);
      }

      // Get database info to determine type
      const db = await getDatabase(organization, database, token);

      if (db.kind === "mysql") {
        // Vitess database - create password with readwriter role
        const credentials = await createVitessCredentials(
          organization,
          database,
          branch,
          "readwriter",
          token
        );

        const result = await executeVitessQuery(credentials, query);
        return ctx.json(result);
      } else {
        // Postgres database - create role with read and write permissions
        const credentials = await createPostgresCredentials(
          organization,
          database,
          branch,
          ["pg_read_all_data", "pg_write_all_data"],
          token
        );

        const result = await executePostgresQuery(credentials, query);
        return ctx.json(result);
      }
    } catch (error) {
      console.error(`[execute_write_query] Error:`, error);
      
      if (error instanceof PlanetScaleAPIError) {
        return ctx.text(`Error: ${error.message} (status: ${error.statusCode})`);
      }

      if (error instanceof Error) {
        return ctx.text(`Error: ${error.message}`);
      }

      return ctx.text("Error: An unexpected error occurred");
    }
  },
});
