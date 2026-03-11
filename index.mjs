import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import fetch from "node-fetch";
import http from "http";

const GAS_URL   = process.env.TASKS_GAS_URL;
const GAS_TOKEN = process.env.TASKS_GAS_TOKEN;
const PORT      = process.env.PORT || 3000;

// ── Shared GAS caller ─────────────────────────────────────────
async function callGAS(action, params = {}) {
  if (!GAS_URL)   throw new Error("TASKS_GAS_URL env var not set");
  if (!GAS_TOKEN) throw new Error("TASKS_GAS_TOKEN env var not set");

  const res = await fetch(GAS_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ token: GAS_TOKEN, action, ...params }),
  });

  if (!res.ok) throw new Error(`GAS HTTP error: ${res.status}`);

  const json = await res.json();
  if (!json.success) throw new Error(json.error || "GAS returned failure");

  return json.data;
}

// ── MCP Server ────────────────────────────────────────────────
const server = new McpServer({
  name:    "google-tasks",
  version: "1.0.0",
});

// 1. List all task lists
server.tool(
  "tasks_list_tasklists",
  "List all Google Task lists. Call this first to get tasklistId values.",
  {},
  async () => {
    const data = await callGAS("listTasklists");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// 2. List tasks in a list
server.tool(
  "tasks_list",
  "List tasks in a Google Tasks list.",
  {
    tasklistId:    z.string().describe("ID of the task list"),
    showCompleted: z.boolean().optional().describe("Include completed tasks. Default: false"),
    dueMin:        z.string().optional().describe("Only tasks due after this date (RFC 3339)"),
    dueMax:        z.string().optional().describe("Only tasks due before this date (RFC 3339)"),
  },
  async (params) => {
    const data = await callGAS("listTasks", params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// 3. Create a task
server.tool(
  "tasks_create",
  "Create a new task in a Google Tasks list.",
  {
    tasklistId: z.string().describe("ID of the task list"),
    title:      z.string().describe("Title of the task"),
    notes:      z.string().optional().describe("Notes or description"),
    due:        z.string().optional().describe("Due date as RFC 3339 timestamp e.g. '2026-03-15T00:00:00.000Z'"),
  },
  async (params) => {
    const data = await callGAS("createTask", params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// 4. Update a task
server.tool(
  "tasks_update",
  "Update an existing task's title, notes, due date, or status.",
  {
    tasklistId: z.string().describe("ID of the task list"),
    taskId:     z.string().describe("ID of the task to update"),
    title:      z.string().optional().describe("New title"),
    notes:      z.string().optional().describe("New notes"),
    due:        z.string().optional().describe("New due date as RFC 3339 timestamp"),
    status:     z.enum(["needsAction", "completed"]).optional().describe("Task status"),
  },
  async (params) => {
    const data = await callGAS("updateTask", params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// 5. Complete a task
server.tool(
  "tasks_complete",
  "Mark a Google Task as completed.",
  {
    tasklistId: z.string().describe("ID of the task list"),
    taskId:     z.string().describe("ID of the task to complete"),
  },
  async (params) => {
    const data = await callGAS("completeTask", params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// 6. Delete a task
server.tool(
  "tasks_delete",
  "Permanently delete a task.",
  {
    tasklistId: z.string().describe("ID of the task list"),
    taskId:     z.string().describe("ID of the task to delete"),
  },
  async (params) => {
    const data = await callGAS("deleteTask", params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ── HTTP Server ───────────────────────────────────────────────
const httpServer = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok", service: "google-tasks-mcp" }));
    return;
  }

  if (req.method === "POST" && req.url === "/mcp") {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => Math.random().toString(36).slice(2) });
    await server.connect(transport);
    await transport.handleRequest(req, res);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

httpServer.listen(PORT, () => {
  console.log(`Google Tasks MCP server running on port ${PORT}`);
});
