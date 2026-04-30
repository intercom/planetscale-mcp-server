import { Gram } from "@gram-ai/functions";
import { z } from "zod";
import { PlanetScaleAPIError, listCustomShards } from "../lib/planetscale-api.ts";
import type { CustomShard } from "../lib/planetscale-api.ts";
import { getAuthToken, getAuthHeader } from "../lib/auth.ts";

const MAX_PAGES = 20;

async function fetchAllCustomShards(
  organization: string,
  database: string,
  branch: string,
  keyspace: string,
  authHeader: string,
): Promise<CustomShard[]> {
  const allShards: CustomShard[] = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    const response = await listCustomShards(
      organization, database, branch, keyspace, authHeader,
      { page, perPage: 100 },
    );
    allShards.push(...response.data);
    if (response.next_page == null) break;
    page++;
  }

  return allShards;
}

export const listCustomShardsGram = new Gram().tool({
  name: "list_custom_shards",
  description:
    "Vitess/MySQL databases only. List all shards for a keyspace with their effective cluster sizes. Returns each shard's effective size (SKU and display name), whether it has been individually resized away from the keyspace default (has_override), and whether a resize is currently in progress (active_resize). When called without pagination parameters, auto-paginates and returns a summary with size distribution, override shards, and active resizes. When called with page/per_page, returns raw paginated results. Use get_branch_keyspaces first to discover keyspace names. To look up CPU, RAM, storage, and rates for a given SKU, use list_cluster_sizes.",
  inputSchema: {
    organization: z.string().describe("PlanetScale organization name"),
    database: z.string().describe("Database name"),
    branch: z.string().describe("Branch name (e.g., 'main')"),
    keyspace: z.string().describe("Keyspace name (use get_branch_keyspaces to discover available keyspaces)"),
    page: z
      .number()
      .optional()
      .describe("Page number for pagination. When provided, returns raw paginated results instead of a summary."),
    per_page: z
      .number()
      .optional()
      .describe("Results per page (default: 25, max: 100)"),
  },
  async execute(ctx, input) {
    try {
      const env =
        Object.keys(ctx.env).length > 0
          ? (ctx.env as Record<string, string | undefined>)
          : process.env;

      const auth = getAuthToken(env);
      if (!auth) {
        return ctx.text("Error: No PlanetScale authentication configured.");
      }

      const { organization, database, branch, keyspace } = input;
      if (!organization || !database || !branch || !keyspace) {
        return ctx.text("Error: organization, database, branch, and keyspace are required.");
      }

      const authHeader = getAuthHeader(env);

      if (input.page != null || input.per_page != null) {
        const response = await listCustomShards(
          organization, database, branch, keyspace, authHeader,
          { page: input.page, perPage: input.per_page },
        );

        return ctx.json({
          organization,
          database,
          branch,
          keyspace,
          current_page: response.current_page,
          next_page: response.next_page,
          shards: response.data.map((s) => ({
            key_range: s.key_range,
            effective_cluster_size: s.effective_cluster_size,
            effective_cluster_display_name: s.effective_cluster_display_name,
            has_override: s.has_override,
            override_cluster_size: s.override_cluster_size,
            active_resize: s.active_resize,
          })),
        });
      }

      const allShards = await fetchAllCustomShards(
        organization, database, branch, keyspace, authHeader,
      );

      const sizeCounts: Record<string, number> = {};
      for (const s of allShards) {
        const size = s.effective_cluster_display_name;
        sizeCounts[size] = (sizeCounts[size] ?? 0) + 1;
      }

      const defaultSize = Object.entries(sizeCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      const overrideShards = allShards
        .filter((s) => s.has_override)
        .map((s) => ({
          key_range: s.key_range,
          effective_size: s.effective_cluster_display_name,
          effective_sku: s.effective_cluster_size,
        }));

      const activeResizes = allShards
        .filter((s) => s.active_resize)
        .map((s) => ({
          key_range: s.key_range,
          effective_size: s.effective_cluster_display_name,
        }));

      return ctx.json({
        organization,
        database,
        branch,
        keyspace,
        shard_count: allShards.length,
        size_distribution: sizeCounts,
        default_size: defaultSize,
        override_shards: overrideShards,
        active_resizes: activeResizes,
      });
    } catch (error) {
      if (error instanceof PlanetScaleAPIError) {
        if (error.statusCode === 404) {
          return ctx.text(
            "Error: Not found. Check that the organization, database, branch, and keyspace names are correct. (status: 404)",
          );
        }
        return ctx.text(`Error: ${error.message} (status: ${error.statusCode})`);
      }
      if (error instanceof Error) {
        return ctx.text(`Error: ${error.message}`);
      }
      return ctx.text("Error: An unexpected error occurred");
    }
  },
});
