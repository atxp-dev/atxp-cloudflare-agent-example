import { tool, generateId } from "ai";
import { z } from "zod/v3";
import {
  getATXPConnectionString,
  findATXPAccount,
  imageService,
  type MCPToolResult,
  type ImageGenerationTask,
  type ATXPPayment
} from "../utils/atxp";
import { atxpClient } from "@atxp/client";
import { getCurrentAgent } from "agents";
import type { Chat } from "../server";

export const cloudflareWorkersFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit
) => {
  return await globalThis.fetch(input, init);
};

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
        "ATXP connection string - either URL format (https://accounts.atxp.ai?connection_token=...). This is optional and ONLY if the user wants to override the default setting"
      )
  }),
  execute: async ({ prompt, connectionString }) => {
    try {
      if (!prompt || prompt.trim() === "") {
        return "Error: Image prompt cannot be empty";
      }

      // Get agent to access environment variables
      const { agent } = getCurrentAgent<Chat>();

      const atxpConnectionString = getATXPConnectionString(
        connectionString
        // Note: agent.env is protected, so we fall back to process.env in getATXPConnectionString
      );

      const account = findATXPAccount(
        atxpConnectionString,
        cloudflareWorkersFetch
      );

      const imageClient = await atxpClient({
        mcpServer: imageService.mcpServer,
        account: account,
        fetchFn: cloudflareWorkersFetch, // Use our custom fetch function
        oAuthChannelFetch: cloudflareWorkersFetch, // Explicitly set OAuth channel fetch
        onPayment: async ({ payment }: { payment: ATXPPayment }) => {
          // Add payment notification message to chat
          if (agent) {
            try {
              await agent.saveMessages([
                ...agent.messages,
                {
                  id: generateId(),
                  role: "assistant",
                  parts: [
                    {
                      type: "text",
                      text: `💳 **Payment Processed for Image Generation**

A payment has been processed for your image generation request:
- **Amount:** ${payment.amount.toString()} ${payment.currency}
- **Network:** ${payment.network}
- **Service:** ${payment.resourceName}

Your image generation is now in progress!`
                    }
                  ],
                  metadata: {
                    createdAt: new Date()
                  }
                }
              ]);
            } catch (_messageError) {
              // Continue if message saving fails
            }
          }
        }
      });

      const asyncResult = await imageClient.callTool({
        name: imageService.createImageAsyncToolName,
        arguments: imageService.getArguments(prompt)
      });

      const taskId = imageService.getAsyncCreateResult(
        asyncResult as MCPToolResult
      ).taskId;

      // Store task in agent storage and start polling
      if (agent) {
        try {
          const task: ImageGenerationTask = {
            id: generateId(),
            prompt: prompt.trim(),
            status: "running",
            taskId,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          // Store task data
          try {
            // @ts-expect-error - Durable Objects storage type assertion
            await agent.state.storage.put(`imageTask:${taskId}`, task);
          } catch (_storageError) {
            console.log(
              `[IMAGE-GEN] Storage failed, continuing without storage`
            );
            // Continue without storage - polling can still work
          }

          // Start polling for completion
          const scheduledTime = new Date(Date.now() + 10000); // Check in 10 seconds
          const scheduleParams = {
            requestId: generateId(),
            taskId,
            atxpConnectionString
          };

          agent.schedule(
            scheduledTime,
            "pollImageGenerationTask",
            scheduleParams
          );
        } catch (scheduleError) {
          console.error(
            `[IMAGE-GEN] Error in storage/scheduling:`,
            scheduleError
          );
          // Continue without scheduling - the image was created successfully
        }
      }

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

The system will automatically check the progress and notify you when it's complete. This usually takes 1-2 minutes.`
      };

      return result;
    } catch (error) {
      console.error(`[IMAGE-GEN] Error in generateImage:`, error);
      return `Error generating image: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
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
      const atxpConnectionString = getATXPConnectionString(
        connectionString
        // Note: agent.env is protected, so we fall back to process.env in getATXPConnectionString
      );
      const account = findATXPAccount(
        atxpConnectionString,
        cloudflareWorkersFetch
      );

      const imageClient = await atxpClient({
        mcpServer: imageService.mcpServer,
        account: account,
        fetchFn: cloudflareWorkersFetch,
        oAuthChannelFetch: cloudflareWorkersFetch,
        onPayment: async ({ payment }: { payment: ATXPPayment }) => {
          // Add payment notification message to chat for status checks
          const { agent } = getCurrentAgent<Chat>();
          if (agent) {
            try {
              await agent.saveMessages([
                ...agent.messages,
                {
                  id: generateId(),
                  role: "assistant",
                  parts: [
                    {
                      type: "text",
                      text: `💳 **Payment Processed for Image Status Check**

A payment has been processed while checking image status (Task ID: ${taskId}):
- **Amount:** ${payment.amount.toString()} ${payment.currency}
- **Network:** ${payment.network}
- **Service:** ${payment.resourceName}

Status check complete.`
                    }
                  ],
                  metadata: {
                    createdAt: new Date()
                  }
                }
              ]);
            } catch (_messageError) {
              // Continue if message saving fails
            }
          }
        }
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
            ? `🎉 Image generation completed!

![Generated Image](${url})

**Download URL:** ${url}`
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
    try {
      const { agent } = getCurrentAgent<Chat>();
      if (!agent) {
        return {
          type: "list_image_tasks_error",
          message: "Unable to access agent storage"
        };
      }

      // Get all storage keys that start with "imageTask:"
      // @ts-expect-error - Durable Objects storage list method
      const allKeys = await agent.state.storage.list({ prefix: "imageTask:" });
      const tasks = [];

      for (const [, taskData] of allKeys.entries()) {
        const task = taskData as ImageGenerationTask;
        tasks.push({
          taskId: task.taskId,
          prompt: task.prompt,
          status: task.status,
          imageUrl: task.imageUrl,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt
        });
      }

      if (tasks.length === 0) {
        return {
          type: "list_image_tasks",
          tasks: [],
          message: "No image generation tasks found."
        };
      }

      // Sort by creation date, most recent first
      tasks.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return {
        type: "list_image_tasks",
        tasks,
        message: `Found ${tasks.length} image generation task${tasks.length === 1 ? "" : "s"}:`
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        type: "list_image_tasks_error",
        error: errorMessage,
        message: `Failed to list image generation tasks: ${errorMessage}`
      };
    }
  }
});
