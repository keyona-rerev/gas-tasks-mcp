import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import fetch from "node-fetch";
import http from "http";

const GAS_URL   = process.env.TASKS_GAS_URL;
const GAS_TOKEN = process.env.TASKS_GAS_TOKEN;
const PORT      = process.env.PORT || 3000;

async function callGAS(action, params = {}) {
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: GAS_TOKEN, action, ...params }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

function buildServer() {
  const server = new McpServer({ name: "google-tasks", version: "1.0.0" });

  server.tool("tasks_list_tasklists", "List all Google Task lists. Call this first to get tasklistId values.", {}, async () => {
    const data = await callGAS("listTasklists");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("tasks_list", "List tasks in a Google Tasks list.", {
    tasklistId:    z.string().describe("ID of the task list"),
    showCompleted: z.boolean().optional().describe("Include completed tasks"),
  }, async (params) => {
    const data = await callGAS("listTasks", params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("tasks_create", "Create a new task in a Google Tasks list.", {
    tasklistId: z.string().describe("ID of the task list"),
    title:      z.string().describe("Title of the task"),
    notes:      z.string().optional().describe("Notes or description"),
    due:        z.string().optional().describe("Due date as RFC 3339 e.g. 2026-03-15T00:00:00.000Z"),
  }, async (params) => {
    const data = await callGAS("createTask", params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("tasks_update", "Update an existing task.", {
    tasklistId: z.string().describe("ID of the task list"),
    taskId:     z.string().describe("ID of the task to update"),
    title:      z.string().optional(),
    notes:      z.string().optional(),
    due:        z.string().optional(),
    status:     z.enum(["needsAction", "completed"]).optional(),
  }, async (params) => {
    const data = await callGAS("updateTask", params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("tasks_complete", "Mark a Google Task as completed.", {
    tasklistId: z.string().describe("ID of the task list"),
    taskId:     z.string().describe("ID of the task to complete"),
  }, async (params) => {
    const data = await callGAS("completeTask", params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("tasks_delete", "Permanently delete a task.", {
    tasklistId: z.string().describe("ID of the task list"),
    taskId:     z.string().describe("ID of the task to delete"),
  }, async (params) => {
    const data = await callGAS("deleteTask", params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  return server;
}

const httpServer = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
    });
    res.end();
    return;
  }

  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "google-tasks-mcp" }));
    return;
  }

  // MCP endpoint — create a fresh server + transport per request
  if (req.url === "/mcp") {
    res.setHeader("Access-Control-Allow-Origin", "*");

    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => Math.random().toString(36).slice(2),
      enableJsonResponse: true,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

httpServer.listen(PORT, () => {
  console.log(`Google Tasks MCP running on port ${PORT}`);
});
