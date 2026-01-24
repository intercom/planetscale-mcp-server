export interface ValidationResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
}

/**
 * Validates a write query for safety.
 * - Blocks TRUNCATE entirely
 * - Blocks DELETE/UPDATE without WHERE clause entirely (even with confirmation)
 * - Requires confirmation for DELETE queries with WHERE clause
 */
export function validateWriteQuery(
  query: string,
  confirmed: boolean
): ValidationResult {
  const normalized = query.trim().toUpperCase();

  // Block TRUNCATE entirely
  if (normalized.startsWith("TRUNCATE")) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: "TRUNCATE is not allowed. This operation cannot be undone.",
    };
  }

  // DELETE validation
  if (normalized.startsWith("DELETE")) {
    const hasWhere = /\bWHERE\b/i.test(query);
    
    // Block DELETE without WHERE entirely
    if (!hasWhere) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: "DELETE without a WHERE clause is not allowed. This would affect the entire table.",
      };
    }
    
    // DELETE with WHERE requires confirmation
    if (!confirmed) {
      return {
        allowed: false,
        requiresConfirmation: true,
        reason: "DELETE queries require confirmation. Set confirm_destructive: true to proceed.",
      };
    }
  }

  // UPDATE validation
  if (normalized.startsWith("UPDATE")) {
    const hasWhere = /\bWHERE\b/i.test(query);
    
    // Block UPDATE without WHERE entirely
    if (!hasWhere) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: "UPDATE without a WHERE clause is not allowed. This would affect the entire table.",
      };
    }
  }

  return { allowed: true, requiresConfirmation: false };
}

/**
 * Validates that a query is read-only (SELECT, SHOW, DESCRIBE, EXPLAIN)
 */
export function validateReadQuery(query: string): ValidationResult {
  const normalized = query.trim().toUpperCase();

  // Allow read-only operations
  const readOnlyPrefixes = ["SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"];
  const isReadOnly = readOnlyPrefixes.some((prefix) =>
    normalized.startsWith(prefix)
  );

  if (!isReadOnly) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason:
        "Only SELECT, SHOW, DESCRIBE, and EXPLAIN queries are allowed with execute_read_query. Use execute_write_query for INSERT, UPDATE, or DELETE operations.",
    };
  }

  return { allowed: true, requiresConfirmation: false };
}
