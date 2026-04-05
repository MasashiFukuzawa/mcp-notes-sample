interface Env {
  // Google OAuth
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  COOKIE_ENCRYPTION_KEY: string;

  // ユーザー制限
  // JSON配列文字列: '["alice@example.com","bob@example.com"]'
  // KVに "ALLOWED_EMAILS" キーで保存してもよい
  ALLOWED_EMAILS: string;

  // Cloudflare Bindings
  OAUTH_KV: KVNamespace; // OAuthProvider が内部で使用 + 許可リスト保存
  NOTES_DB: D1Database; // メモデータ

  MCP_OBJECT: DurableObjectNamespace; // McpAgent 用 Durable Object
}
