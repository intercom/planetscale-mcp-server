import { Gram } from "@gram-ai/functions";
import { z } from "zod";
import { PlanetScaleAPIError } from "../lib/planetscale-api.ts";
import { getAuthToken, getAuthHeader } from "../lib/auth.ts";

const API_BASE = "https://api.planetscale.com/v1";

interface DeployRequestActor {
  display_name: string;
}

interface ShardOperation {
  id: string;
  shard: string;
  state: string;
  progress_percentage: number | null;
  eta_seconds: number | null;
}

interface DeployOperationSummary {
  id: string;
  state: string;
  keyspace_name: string;
  table_name: string;
  operation_name: string;
  ddl_statement: string;
  eta_seconds: number | null;
  progress_percentage: number | null;
  can_drop_data: boolean;
  deploy_errors: unknown[];
  sharded: boolean;
  shard_count: number | null;
  shard_names: string[] | null;
  table_recently_used: boolean;
  throttled_at: string | null;
  created_at: string;
  operations: ShardOperation[];
}

interface ThrottlerConfigurationEntry {
  id: string;
  keyspace_name: string;
  ratio: number;
}

interface ThrottlerConfigurations {
  keyspaces: string[];
  configurations: ThrottlerConfigurationEntry[];
}

interface DeploymentRevertRequest {
  actor: DeployRequestActor | null;
  state: string;
  created_at: string;
}

interface Deployment {
  state: string;
  auto_cutover: boolean;
  auto_delete_branch: boolean;
  deployable: boolean;
  instant_ddl: boolean;
  instant_ddl_eligible: boolean;
  table_locked: boolean;
  locked_table_name: string | null;
  submitted_at: string | null;
  queued_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  ready_to_cutover_at: string | null;
  cutover_at: string | null;
  lint_errors: unknown[];
  deploy_check_errors: unknown[] | null;
  deployment_revert_request: DeploymentRevertRequest | null;
  deploy_operation_summaries: DeployOperationSummary[];
  throttler_configurations: ThrottlerConfigurations | null;
}

interface DeployRequest {
  number: number;
  state: string;
  deployment_state: string;
  branch: string;
  into_branch: string;
  into_branch_sharded: boolean;
  into_branch_shard_count: number;
  branch_deleted: boolean;
  approved: boolean;
  actor: DeployRequestActor;
  closed_by: DeployRequestActor | null;
  notes: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  deployed_at: string | null;
  deployment: Deployment | null;
}

function filterShardOperation(op: ShardOperation) {
  return {
    shard: op.shard,
    state: op.state,
    progress_percentage: op.progress_percentage,
    eta_seconds: op.eta_seconds,
  };
}

function filterOperationSummary(summary: DeployOperationSummary) {
  return {
    state: summary.state,
    keyspace_name: summary.keyspace_name,
    table_name: summary.table_name,
    operation_name: summary.operation_name,
    ddl_statement: summary.ddl_statement,
    eta_seconds: summary.eta_seconds,
    progress_percentage: summary.progress_percentage,
    can_drop_data: summary.can_drop_data,
    sharded: summary.sharded,
    shard_count: summary.shard_count,
    shard_names: summary.shard_names,
    table_recently_used: summary.table_recently_used,
    ...(summary.deploy_errors && summary.deploy_errors.length > 0
      ? { deploy_errors: summary.deploy_errors }
      : {}),
    ...(summary.throttled_at ? { throttled_at: summary.throttled_at } : {}),
    ...(summary.operations && summary.operations.length > 0
      ? { operations: summary.operations.map(filterShardOperation) }
      : {}),
  };
}

function filterDeployRequest(dr: DeployRequest) {
  return {
    number: dr.number,
    state: dr.state,
    deployment_state: dr.deployment_state,
    branch: dr.branch,
    into_branch: dr.into_branch,
    into_branch_sharded: dr.into_branch_sharded,
    into_branch_shard_count: dr.into_branch_shard_count,
    branch_deleted: dr.branch_deleted,
    approved: dr.approved,
    actor: dr.actor.display_name,
    closed_by: dr.closed_by?.display_name ?? null,
    notes: dr.notes,
    html_url: dr.html_url,
    created_at: dr.created_at,
    updated_at: dr.updated_at,
    closed_at: dr.closed_at,
    deployed_at: dr.deployed_at,
    ...(dr.deployment
      ? {
          deployment: {
            state: dr.deployment.state,
            auto_cutover: dr.deployment.auto_cutover,
            auto_delete_branch: dr.deployment.auto_delete_branch,
            deployable: dr.deployment.deployable,
            instant_ddl: dr.deployment.instant_ddl,
            instant_ddl_eligible: dr.deployment.instant_ddl_eligible,
            table_locked: dr.deployment.table_locked,
            locked_table_name: dr.deployment.locked_table_name,
            submitted_at: dr.deployment.submitted_at,
            queued_at: dr.deployment.queued_at,
            started_at: dr.deployment.started_at,
            finished_at: dr.deployment.finished_at,
            ready_to_cutover_at: dr.deployment.ready_to_cutover_at,
            cutover_at: dr.deployment.cutover_at,
            ...(dr.deployment.lint_errors && dr.deployment.lint_errors.length > 0
              ? { lint_errors: dr.deployment.lint_errors }
              : {}),
            ...(dr.deployment.deploy_check_errors && dr.deployment.deploy_check_errors.length > 0
              ? { deploy_check_errors: dr.deployment.deploy_check_errors }
              : {}),
            ...(dr.deployment.deployment_revert_request
              ? {
                  revert_requested_by:
                    dr.deployment.deployment_revert_request.actor?.display_name ?? null,
                  revert_state: dr.deployment.deployment_revert_request.state,
                  revert_requested_at:
                    dr.deployment.deployment_revert_request.created_at,
                }
              : {}),
            deploy_operation_summaries: (
              dr.deployment.deploy_operation_summaries || []
            ).map(filterOperationSummary),
            ...(dr.deployment.throttler_configurations
              ? {
                  throttler_configurations: {
                    keyspaces: dr.deployment.throttler_configurations.keyspaces,
                    configurations: (
                      dr.deployment.throttler_configurations.configurations || []
                    ).map((c) => ({
                      keyspace_name: c.keyspace_name,
                      ratio: c.ratio,
                    })),
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}

export const getDeployRequestGram = new Gram().tool({
  name: "get_deploy_request",
  description:
    "Vitess/MySQL databases only. Get details of a specific deploy request by number, including deployment status, schema change operations with per-shard progress, and approval state. Use list_deploy_requests to find deploy request numbers.",
  inputSchema: {
    organization: z.string().describe("PlanetScale organization name"),
    database: z.string().describe("Database name"),
    number: z.number().describe("Deploy request number"),
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

      const { organization, database, number } = input;
      if (!organization || !database || number == null) {
        return ctx.text("Error: organization, database, and number are required.");
      }

      const authHeader = getAuthHeader(env);
      const url = `${API_BASE}/organizations/${encodeURIComponent(organization)}/databases/${encodeURIComponent(database)}/deploy-requests/${encodeURIComponent(String(number))}`;

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
          `Failed to fetch deploy request: ${response.statusText}`,
          response.status,
          details,
        );
      }

      const dr = (await response.json()) as DeployRequest;
      return ctx.json(filterDeployRequest(dr));
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
