# MCP Notes Sample

Cloudflare Workers 上で動く、Google OAuth 認証付きリモート MCP サーバーのサンプルアプリケーションです。

claude.ai の Custom Connector から接続し、Google アカウント（個人 Gmail）で認証したユーザーだけが利用できます。MCP ツールによるメモの CRUD に加えて、MCP Apps UI でメモ一覧をインタラクティブに表示できます。

## 技術スタック

| レイヤー | 技術 |
|---|---|
| MCP Server / OAuth Provider | Cloudflare Workers + `@cloudflare/workers-oauth-provider` |
| MCP プロトコル | `@modelcontextprotocol/sdk` |
| Agent Framework | `agents` (Cloudflare Agents SDK) |
| Router | `hono` |
| DB | Cloudflare D1 (SQLite) |
| Auth | Google OAuth 2.0 |
| KV | Cloudflare KV（OAuthProvider 内部使用） |

## MCP ツール一覧

| ツール名 | 説明 |
|---|---|
| `whoami` | 現在ログイン中のユーザー情報を返す |
| `create_note` | 新しいメモを作成する |
| `list_notes` | 自分のメモ一覧を取得する |
| `search_notes` | メモをキーワード検索する |
| `delete_note` | メモを削除する（自分のメモのみ） |
| `show_notes_ui` | MCP Apps UI でメモ一覧を表示する |

## MCP Apps UI

`show_notes_ui` は Vite でビルドした single-file HTML を Worker に埋め込み、MCP Apps 対応クライアント上で一覧 UI を表示します。

- タイトル・本文・作成日時の一覧表示
- クライアント側でのインクリメンタル検索
- `npm run build:ui` で UI を再生成し、`src/generated/notes-ui-html.ts` に埋め込み

## セットアップ手順

### 前提条件

- Cloudflare アカウント（無料プランでOK）
- Node.js 18+
- Google Cloud Console へのアクセス（OAuth クライアント ID 作成用）

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. KV ネームスペース作成

```bash
npx wrangler kv namespace create "OAUTH_KV"
# → 出力される ID を wrangler.jsonc の kv_namespaces[0].id に設定
```

### 3. D1 データベース作成

```bash
npx wrangler d1 create mcp-notes-db
# → 出力される ID を wrangler.jsonc の d1_databases[0].database_id に設定
```

### 4. D1 にスキーマ適用

```bash
npx wrangler d1 execute mcp-notes-db --remote --file=schema.sql
```

### 5. Google Cloud Console で OAuth 2.0 クライアント ID を作成

1. Google Cloud Console → APIとサービス → 認証情報 → OAuth 2.0 クライアント ID 作成
2. アプリケーションの種類: **ウェブアプリケーション**
3. 承認済みリダイレクト URI:
   - ローカル開発用: `http://localhost:8787/callback`
   - 本番用: `https://mcp-notes.<your-subdomain>.workers.dev/callback`
4. OAuth 同意画面の設定:
   - ユーザーの種類: 「外部」（個人Gmailの場合はこれのみ選択可）
   - 公開ステータス: 「テスト」のままでOK
   - テストユーザー: 自分のGmailアドレスを追加（最大100人）

### 6. Secrets 設定（本番デプロイ用）

```bash
npx wrangler secret put GOOGLE_CLIENT_ID      # Google Console で取得した Client ID
npx wrangler secret put GOOGLE_CLIENT_SECRET   # Google Console で取得した Client Secret
npx wrangler secret put COOKIE_ENCRYPTION_KEY  # openssl rand -hex 32 で生成
```

### 7. 許可ユーザーを KV に登録

```bash
npx wrangler kv key put "ALLOWED_EMAILS" \
  '["your-email@gmail.com"]' \
  --binding="OAUTH_KV"
```

### 8. ローカル開発

`.dev.vars` ファイルを作成（`.gitignore` に含まれています）:

```
GOOGLE_CLIENT_ID=<your-dev-client-id>
GOOGLE_CLIENT_SECRET=<your-dev-client-secret>
COOKIE_ENCRYPTION_KEY=<random-hex-string>
ALLOWED_EMAILS=["your-email@gmail.com"]
```

```bash
npm run dev
```

### 9. MCP Inspector で動作確認

```bash
npx @modelcontextprotocol/inspector@latest
# → http://localhost:5173 で Inspector を開く
# → Server URL に http://localhost:8787/mcp を入力
# → OAuth Settings → Quick OAuth Flow でGoogle認証
# → Connect → List Tools でツール一覧が表示されれば成功
```

### 10. デプロイ

```bash
npm run deploy
```

### 11. claude.ai で接続

1. Settings → Connectors → Add Custom Connector
2. URL: `https://mcp-notes.<your-subdomain>.workers.dev/mcp`

### 12. MCP Apps UI の確認

MCP Apps 対応クライアントで `show_notes_ui` を呼び出すと、メモ一覧 UI が表示されます。

- タイトルと本文での検索
- 作成日時の確認
- ユーザーごとのメモ一覧の閲覧

## 注意事項

- **state パラメータの CSRF 対策**: 本実装は簡略版です。本番では公式テンプレートの `workers-oauth-utils.ts` にある暗号化 Cookie + nonce 検証を使うこと
- **D1 の制限**: 1DB あたり 10GB（無料枠 500MB）
- **Durable Objects の料金**: リクエストあたり課金。開発中は無料枠内に収まるが大量アクセス時は注意
- **ローカル開発時の D1**: `wrangler dev` ではローカル SQLite が使われる。`--remote` フラグで本番 D1 に接続可能
- **Google OAuth 同意画面**: 個人 Gmail では「外部」+「テストモード」で運用
