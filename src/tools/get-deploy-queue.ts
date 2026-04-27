import { Gram } from "@gram-ai/functions";
import { z } from "zod";
import { PlanetScaleAPIError } from "../lib/planetscale-api.ts";
import { getAuthToken, getAuthHeader } from "../lib/auth.ts";

const API_BASE = "https://api.planetscale.com/v1";

interface DeployOperationRaw {
  state: string;
  table_name: string;
  operation_name: string;
  progress_percentage: number | null;
  eta_seconds: number | null;
}

interface DeploymentActor {
  display_name: string;
}

interface Deployment {
  id: string;
  state: string;
  deploy_request_number: number;
  into_branch: string;
  deployable: boolean;
  auto_cutover: boolean;
  auto_delete_branch: boolean;
  actor: DeploymentActor | null;
  deploy_operations: DeployOperationRaw[];
  html_url?: string;
  created_at: string;
  queued_at: string | null;
  started_at: string | null;
  finished_at: string | null;
}

interface PaginatedList<T> {
  data: T[];
  current_page: number;
  next_page: number | null;
  prev_page: number | null;
}

function filterDeployment(d: Deployment) {
  return {
    state: d.state,
    deploy_request_number: d.deploy_request_number,
    into_branch: d.into_branch,
    deployable: d.deployable,
    auto_cutover: d.auto_cutover,
    auto_delete_branch: d.auto_delete_branch,
    actor: d.actor?.display_name ?? null,
    ...(d.html_url ? { html_url: d.html_url } : {}),
    created_at: d.created_at,
    queued_at: d.queued_at,
    started_at: d.started_at,
    finished_at: d.finished_at,
    deploy_operations: (d.deploy_operations || []).map((op) => ({
      state: op.state,
      table_name: op.table_name,
      operation_name: op.operation_name,
      progress_percentage: op.progress_percentage,
      eta_seconds: op.eta_seconds,
    })),
  };
}

export const getDeployQueueGram = new Gram().tool({
  name: "get_deploy_queue",
  description:
    "Vitess/MySQL databases only. Get the deploy queue for a PlanetScale database, showing deployments that are currently queued or in progress. Useful for checking if there are pending deployments that may block or delay a new deploy request. Use get_deploy_request with the deploy_request_number to get full details of a queued deployment.",
  inputSchema: {
    organization: z.string().describe("PlanetScale organization name"),
    database: z.string().describe("Database name"),
    page: z.number().optional().describe("Page number (default: 1)"),
    per_page: z
      .number()
      .optional()
      .describe("Results per page (default: 25, max: 50)"),
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

      const { organization, database } = input;
      if (!organization || !database) {
        return ctx.text("Error: organization and database are required.");
      }

      const authHeader = getAuthHeader(env);
      const page = input.page ?? 1;
      const perPage = Math.min(input.per_page ?? 25, 50);

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", String(perPage));

      const url = `${API_BASE}/organizations/${encodeURIComponent(organization)}/databases/${encodeURIComponent(database)}/deploy-queue?${params}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        let details: unknown;
        try {
          details = await response.json();
        } catch {
          details = await response.text();
        }
        throw new PlanetScaleAPIError(
          `Failed to fetch deploy queue: ${response.statusText}`,
          response.status,
          details,
        );
      }

      const result = (await response.json()) as PaginatedList<Deployment>;
      const filtered = (result.data || []).map(filterDeployment);

      return ctx.json({
        organization,
        database,
        page: result.current_page,
        next_page: result.next_page,
        total: filtered.length,
        deployments: filtered,
      });
    } catch (error) {
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
