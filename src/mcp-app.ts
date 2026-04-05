/**
 * MCP App クライアント — メモ一覧UIのエントリポイント
 * Vite でバンドルされ、mcp-app.html に埋め込まれます。
 */
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import "./mcp-app.css";

// ── 型定義 ──────────────────────────────────────────────────────────────
interface NoteItem {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

// ── 状態 ────────────────────────────────────────────────────────────────
let allNotes: NoteItem[] = [];
let searchQuery = "";

// ── DOM ヘルパー ────────────────────────────────────────────────────────
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function highlightText(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const escapedQuery = escapeHtml(query);
  const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  return escaped.replace(regex, '<span class="highlight">$1</span>');
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function createNoteElement(note: NoteItem, query: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "note-item";

  const header = document.createElement("div");
  header.className = "note-header";

  const title = document.createElement("div");
  title.className = "note-title";
  title.innerHTML = highlightText(note.title, query);

  const date = document.createElement("div");
  date.className = "note-date";
  date.textContent = formatDate(note.created_at);

  header.appendChild(title);
  header.appendChild(date);

  const body = document.createElement("div");
  body.className = "note-body";
  body.innerHTML = highlightText(note.body, query);

  const idEl = document.createElement("div");
  idEl.className = "note-id";
  idEl.textContent = `ID: ${note.id}`;

  el.appendChild(header);
  el.appendChild(body);
  el.appendChild(idEl);

  return el;
}

function render() {
  const list = document.getElementById("notes-list")!;
  list.replaceChildren();

  const filtered = searchQuery
    ? allNotes.filter(
        (n) =>
          n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.body.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allNotes;

  document.getElementById("notes-count")!.textContent = String(allNotes.length);

  const filteredInfo = document.getElementById("filtered-info")!;
  if (searchQuery && filtered.length !== allNotes.length) {
    filteredInfo.textContent = `（${filtered.length}件表示中）`;
  } else {
    filteredInfo.textContent = "";
  }

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = searchQuery
      ? `「${searchQuery}」に一致するメモはありません。`
      : "メモがありません。";
    list.appendChild(empty);
    return;
  }

  filtered.forEach((note) => {
    list.appendChild(createNoteElement(note, searchQuery));
  });
}

// ── イベント ────────────────────────────────────────────────────────────
const searchInput = document.getElementById("search-input") as HTMLInputElement;
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim();
  render();
});

// 初期描画
render();

// ── MCP App SDK 初期化 ──────────────────────────────────────────────────
function handleHostContextChanged(ctx: McpUiHostContext) {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
  }
  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }
  if (ctx.styles?.css?.fonts) {
    applyHostFonts(ctx.styles.css.fonts);
  }
}

const app = new App({ name: "MCP Notes App", version: "1.0.0" });

app.onteardown = async () => {
  return {};
};

app.ontoolinput = (params) => {
  // ツール入力パラメータは使わない（サーバー側でDBからデータ取得するため）
};

app.ontoolresult = (result: CallToolResult) => {
  const sc = result.structuredContent as Record<string, unknown> | undefined;
  if (sc?.notes && Array.isArray(sc.notes)) {
    allNotes = sc.notes as NoteItem[];
    render();
  }
  if (sc?.userName && typeof sc.userName === "string") {
    const userInfo = document.getElementById("user-info")!;
    userInfo.textContent = sc.userName as string;
  }
};

app.onerror = console.error;
app.onhostcontextchanged = handleHostContextChanged;

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) handleHostContextChanged(ctx);
});
