import type { ATXPAccount } from "@atxp/client";

/**
 * ATXP utility functions for handling connection strings and account validation
 */

/**
 * Get ATXP connection string from environment variable or provided string
 * Priority: provided connectionString > ATXP_CONNECTION_STRING env var
 */
export function getATXPConnectionString(connectionString?: string): string {
  // First try the provided connection string
  if (connectionString && connectionString.trim() !== "") {
    return connectionString.trim();
  }

  // Fall back to environment variable
  const envConnectionString = process.env.ATXP_CONNECTION_STRING;
  if (envConnectionString && envConnectionString.trim() !== "") {
    return envConnectionString.trim();
  }

  throw new Error(
    "ATXP connection string is required. Provide it as a parameter or set ATXP_CONNECTION_STRING environment variable."
  );
}

/**
 * Parse and validate ATXP connection string to extract account information
 * Supports both URL format (https://accounts.atxp.ai?connection_token=ABC123)
 * and legacy JSON format for backwards compatibility
 */
export function findATXPAccount(connectionString: string): ATXPAccount {
  if (!connectionString || connectionString.trim() === "") {
    throw new Error("ATXP connection string cannot be empty");
  }

  try {
    // Check if it's a URL format (https://accounts.atxp.ai?connection_token=...)
    if (connectionString.startsWith("https://accounts.atxp.ai")) {
      const url = new URL(connectionString);
      const connectionToken = url.searchParams.get("connection_token");

      if (!connectionToken) {
        throw new Error(
          "ATXP connection URL must contain connection_token parameter"
        );
      }

      return {
        connectionToken: connectionToken,
        // Default values for URL-based connections
        network: "mainnet",
        currency: "ETH",
        paymentMakers: []
      } as ATXPAccount;
    }

    // Legacy JSON format support
    const parsed = JSON.parse(connectionString);

    // Validate required fields for JSON format
    if (!parsed.accountId && !parsed.connectionToken) {
      throw new Error(
        "ATXP connection string must contain either accountId or connectionToken"
      );
    }

    if (!parsed.connectionToken && !parsed.privateKey) {
      throw new Error(
        "ATXP connection string must contain privateKey when using accountId format"
      );
    }

    return {
      accountId: parsed.accountId,
      privateKey: parsed.privateKey,
      connectionToken: parsed.connectionToken,
      // Optional fields
      network: parsed.network || "mainnet",
      currency: parsed.currency || "ETH",
      // Add required field with empty array as default
      paymentMakers: parsed.paymentMakers || []
    } as ATXPAccount;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        "ATXP connection string must be either a valid URL (https://accounts.atxp.ai?connection_token=...) or valid JSON"
      );
    }
    throw error;
  }
}

/**
 * Validate ATXP connection string format and content
 */
export function validateATXPConnectionString(connectionString?: string): {
  isValid: boolean;
  error?: string;
} {
  try {
    const cs = getATXPConnectionString(connectionString);
    findATXPAccount(cs);
    return { isValid: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown validation error";
    return { isValid: false, error: errorMessage };
  }
}

/**
 * Helper config object for the ATXP Image MCP Server
 */
export const imageService = {
  mcpServer: "https://image.mcp.atxp.ai",
  createImageAsyncToolName: "image_create_image_async",
  getImageAsyncToolName: "image_get_image_async",
  description: "ATXP Image MCP server",
  getArguments: (prompt: string) => ({ prompt }),
  getAsyncCreateResult: (result: any) => {
    const jsonString = result.content[0].text;
    const parsed = JSON.parse(jsonString);
    return { taskId: parsed.taskId };
  },
  getAsyncStatusResult: (result: any) => {
    const jsonString = result.content[0].text;
    const parsed = JSON.parse(jsonString);
    return { status: parsed.status, url: parsed.url };
  }
};

/**
 * Helper config object for the ATXP Filestore MCP Server
 */
export const filestoreService = {
  mcpServer: "https://filestore.mcp.atxp.ai",
  toolName: "filestore_write",
  description: "ATXP Filestore MCP server",
  getArguments: (sourceUrl: string) => ({ sourceUrl, makePublic: true }),
  getResult: (result: any) => {
    // Parse the JSON string from the result
    const jsonString = result.content[0].text;
    return JSON.parse(jsonString);
  }
};
