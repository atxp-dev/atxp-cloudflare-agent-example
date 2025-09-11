import { tool } from "ai";
import { z } from "zod/v3";
import {
  getATXPConnectionString,
  findATXPAccount,
  imageService,
  type MCPToolResult
} from "../utils/atxp";
import { atxpClient } from "@atxp/client";

/**
 * Generate an image from a text prompt using ATXP Image MCP server
 * This tool returns task information for the agent to handle
 */
export const generateImage = tool({
  description:
    "Generate an image from a text prompt using ATXP's AI image generation service",
  inputSchema: z.object({
    prompt: z
      .string()
      .describe("The text prompt describing the image to generate"),
    connectionString: z
      .string()
      .optional()
      .describe(
        "ATXP connection string - either URL format (https://accounts.atxp.ai?connection_token=...) or JSON format (if not set in environment)"
      )
  }),
  execute: async ({ prompt, connectionString }) => {
    if (!prompt || prompt.trim() === "") {
      return "Error: Image prompt cannot be empty";
    }

    const atxpConnectionString = getATXPConnectionString(connectionString);
    const account = findATXPAccount(
      atxpConnectionString, globalThis.fetch
    );
    const imageClient = await atxpClient({
      mcpServer: imageService.mcpServer,
      account: account,
      fetchFn: globalThis.fetch, // Use our custom fetch function
      oAuthChannelFetch: globalThis.fetch, // Explicitly set OAuth channel fetch
    });

    const asyncResult = await imageClient.callTool({
      name: imageService.createImageAsyncToolName,
      arguments: imageService.getArguments(prompt)
    });

    const taskId = imageService.getAsyncCreateResult(
      asyncResult as MCPToolResult
    ).taskId;

    // Return task information for the agent to handle
    const result = {
      type: "image_generation_started",
      taskId,
      prompt: prompt.trim(),
      atxpConnectionString,
      message: `🎨 Image generation started successfully! 

**ATXP Task ID:** ${taskId}
**Prompt:** "${prompt}"
**Status:** running

I'll keep you updated on the progress. This usually takes 1-2 minutes to complete.`
    };

    return result;
  }
});

/**
 * Get the status of an image generation task
 */
export const getImageGenerationStatus = tool({
  description: "Get the status of a previously started image generation task",
  inputSchema: z.object({
    taskId: z.string().describe("The ATXP task ID returned from generateImage"),
    connectionString: z
      .string()
      .optional()
      .describe("ATXP connection string (if not set in environment)")
  }),
  execute: async ({ taskId, connectionString }) => {

    try {
      const atxpConnectionString = getATXPConnectionString(connectionString);
      const account = findATXPAccount(
        atxpConnectionString,
        globalThis.fetch
      );

      const imageClient = await atxpClient({
        mcpServer: imageService.mcpServer,
        account: account,
        fetchFn: globalThis.fetch,
        oAuthChannelFetch: globalThis.fetch
      });

      // Call the MCP server to get image status
      const statusResult = await imageClient.callTool({
        name: imageService.getImageAsyncToolName,
        arguments: { taskId }
      });

      // Parse the status result
      const { status, url } = imageService.getAsyncStatusResult(
        statusResult as MCPToolResult
      );

      return {
        type: "image_generation_status",
        taskId,
        status,
        url,
        message:
          status === "completed" && url
            ? `🎉 Image generation completed! Download: ${url}`
            : `📊 Image generation status: ${status}`
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        type: "image_generation_error",
        taskId,
        error: errorMessage,
        message: `❌ Failed to get image status: ${errorMessage}`
      };
    }
  }
});

/**
 * List all image generation tasks for this agent
 */
export const listImageGenerationTasks = tool({
  description:
    "List all image generation tasks (completed, in progress, and failed)",
  inputSchema: z.object({}),
  execute: async () => {
    // This tool returns a request for the agent to handle
    // since it needs access to the agent's storage
    return {
      type: "list_image_tasks",
      message: "Retrieving all image generation tasks from storage..."
    };
  }
});
