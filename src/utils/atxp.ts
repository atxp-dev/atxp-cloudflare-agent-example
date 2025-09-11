import { ATXPAccount } from "@atxp/client";

/**
 * ATXP utility functions for handling connection strings and account validation
 */

/**
 * Get ATXP connection string from environment variable or provided string
 * Priority: provided connectionString > ATXP_CONNECTION_STRING env var
 */
export function getATXPConnectionString(
  connectionString?: string,
  env?: Env
): string {
  // First try the provided connection string
  if (connectionString && connectionString.trim() !== "") {
    return connectionString.trim();
  }

  // Fall back to Cloudflare Workers environment variable
  const envConnectionString =
    env?.ATXP_CONNECTION_STRING || process.env.ATXP_CONNECTION_STRING;

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
export function findATXPAccount(
  connectionString: string,
  fetchFn: typeof fetch
): ATXPAccount {
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

      // Create a proper ATXPAccount instance with the connection string
      return new ATXPAccount(connectionString, { fetchFn });
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

    // Create a proper ATXPAccount instance with the connection string
    return new ATXPAccount(connectionString, { fetchFn });
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
 * MCP Tool Result interface - flexible to handle different content types
 */
export interface MCPToolResult {
  // biome-ignore lint/suspicious/noExplicitAny: MCP content can be flexible types
  content: Array<{ text?: string; type?: string; [key: string]: any }>;
}
type ImageGenerationStatus = "pending" | "running" | "completed" | "failed";
/**
 * Image generation task interface for state management
 */
export interface ImageGenerationTask {
  id: string;
  prompt: string;
  status: ImageGenerationStatus;
  taskId?: string;
  imageUrl?: string;
  fileName?: string;
  fileId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Type guard for ImageGenerationTask
 */
export function isImageGenerationTask(
  obj: unknown
): obj is ImageGenerationTask {
  return (
    obj != null &&
    typeof obj === "object" &&
    "id" in obj &&
    "prompt" in obj &&
    "status" in obj
  );
}

/**
 * ATXP Payment information from @atxp/client
 */
export interface ATXPPayment {
  accountId: string;
  resourceUrl: string;
  resourceName: string;
  network: string;
  currency: string;
  // biome-ignore lint/suspicious/noExplicitAny: BigNumber type from @atxp/client
  amount: any; // BigNumber from @atxp/client
  iss: string;
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
  getAsyncCreateResult: (result: MCPToolResult): { taskId: string } => {
    const jsonString = result.content[0].text || "";
    const parsed = JSON.parse(jsonString);
    return { taskId: parsed.taskId };
  },
  getAsyncStatusResult: (
    result: MCPToolResult
  ): { status: ImageGenerationStatus; url?: string } => {
    const jsonString = result.content[0].text || "";
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
  getResult: (
    result: MCPToolResult
  ): { filename: string; url: string; fileId?: string } => {
    // Parse the JSON string from the result
    const jsonString = result.content[0].text || "";
    return JSON.parse(jsonString);
  }
};
