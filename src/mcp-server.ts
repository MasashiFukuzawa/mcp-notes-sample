import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { NOTES_UI_HTML } from "./generated/notes-ui-html";

const RESOURCE_URI = "ui://mcp-notes/index.html";

// completeAuthorization() の props で渡した型
type AuthProps = {
  email: string;
  name: string;
};

export class MyMCP extends McpAgent<Env, unknown, AuthProps> {
  server = new McpServer({
    name: "mcp-notes",
    version: "1.0.0",
  });

  async init() {
    const userEmail = this.props.email;
    const userName = this.props.name;
    const db = this.env.NOTES_DB;

    // --- Tool: whoami ---
    this.server.tool(
      "whoami",
      "現在ログイン中のユーザー情報を返す",
      {},
      async () => ({
        content: [
          { type: "text", text: `${userName} (${userEmail})` },
        ],
      })
    );

    // --- Tool: create_note ---
    this.server.tool(
      "create_note",
      "新しいメモを作成する",
      {
        title: z.string().describe("メモのタイトル"),
        body: z.string().describe("メモの本文"),
      },
      async ({ title, body }) => {
        const id = crypto.randomUUID();
        await db
          .prepare(
            "INSERT INTO notes (id, user_email, title, body, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
          )
          .bind(id, userEmail, title, body)
          .run();
        return {
          content: [
            { type: "text", text: `メモを作成しました (id: ${id})` },
          ],
        };
      }
    );

    // --- Tool: list_notes ---
    this.server.tool(
      "list_notes",
      "自分のメモ一覧を取得する",
      {
        limit: z.number().optional().default(20).describe("取得件数（デフォルト20）"),
      },
      async ({ limit }) => {
        const result = await db
          .prepare(
            "SELECT id, title, body, created_at FROM notes WHERE user_email = ? ORDER BY created_at DESC LIMIT ?"
          )
          .bind(userEmail, limit)
          .all();
        if (!result.results.length) {
          return {
            content: [{ type: "text", text: "メモがありません。" }],
          };
        }
        const text = result.results
          .map(
            (r: any) =>
              `- [${r.id}] ${r.title} (${r.created_at})\n  ${r.body}`
          )
          .join("\n\n");
        return { content: [{ type: "text", text }] };
      }
    );

    // --- Tool: search_notes ---
    this.server.tool(
      "search_notes",
      "メモをキーワード検索する",
      {
        query: z.string().describe("検索キーワード"),
      },
      async ({ query }) => {
        const result = await db
          .prepare(
            "SELECT id, title, body, created_at FROM notes WHERE user_email = ? AND (title LIKE ? OR body LIKE ?) ORDER BY created_at DESC"
          )
          .bind(userEmail, `%${query}%`, `%${query}%`)
          .all();
        if (!result.results.length) {
          return {
            content: [
              {
                type: "text",
                text: `「${query}」に一致するメモはありません。`,
              },
            ],
          };
        }
        const text = result.results
          .map(
            (r: any) =>
              `- [${r.id}] ${r.title} (${r.created_at})\n  ${r.body}`
          )
          .join("\n\n");
        return { content: [{ type: "text", text }] };
      }
    );

    // --- Tool: delete_note ---
    this.server.tool(
      "delete_note",
      "メモを削除する（自分のメモのみ）",
      {
        note_id: z.string().describe("削除するメモのID"),
      },
      async ({ note_id }) => {
        const result = await db
          .prepare("DELETE FROM notes WHERE id = ? AND user_email = ?")
          .bind(note_id, userEmail)
          .run();
        if (result.meta.changes === 0) {
          return {
            content: [
              {
                type: "text",
                text: `メモが見つかりません（id: ${note_id}）。自分のメモのみ削除できます。`,
              },
            ],
          };
        }
        return {
          content: [
            { type: "text", text: `メモを削除しました (id: ${note_id})` },
          ],
        };
      }
    );

    // --- Tool: show_notes_ui (MCP Apps) ---
    registerAppTool(
      this.server,
      "show_notes_ui",
      {
        title: "メモ一覧UIを表示",
        description:
          "メモの一覧をインタラクティブなHTML UIで表示します。" +
          "タイトル・本文・作成日を一覧表示し、検索フィルタ機能を使えます。",
        inputSchema: {
          limit: z
            .number()
            .optional()
            .describe("取得件数（デフォルト50）"),
        },
        outputSchema: {
          message: z.string(),
          noteCount: z.number(),
          notes: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              body: z.string(),
              created_at: z.string(),
            })
          ),
          userName: z.string(),
        },
        _meta: { ui: { resourceUri: RESOURCE_URI } },
      },
      async (input): Promise<CallToolResult> => {
        const limit = input.limit ?? 50;
        const result = await db
          .prepare(
            "SELECT id, title, body, created_at FROM notes WHERE user_email = ? ORDER BY created_at DESC LIMIT ?"
          )
          .bind(userEmail, limit)
          .all();

        const notes = result.results.map((r: any) => ({
          id: r.id as string,
          title: r.title as string,
          body: r.body as string,
          created_at: r.created_at as string,
        }));

        return {
          content: [
            {
              type: "text",
              text: `${userName}のメモ一覧を表示します（${notes.length}件）。`,
            },
          ],
          structuredContent: {
            message: `${notes.length}件のメモを表示中`,
            noteCount: notes.length,
            notes,
            userName: `${userName} (${userEmail})`,
          },
        };
      }
    );

    // --- Resource: メモ一覧 UI HTML ---
    registerAppResource(
      this.server,
      RESOURCE_URI,
      RESOURCE_URI,
      { mimeType: RESOURCE_MIME_TYPE },
      async (): Promise<ReadResourceResult> => ({
        contents: [
          {
            uri: RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: NOTES_UI_HTML,
          },
        ],
      })
    );
  }
}
