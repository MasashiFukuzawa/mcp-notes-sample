import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";

const app = new Hono<{
  Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers };
}>();

// 許可リスト取得
async function isUserAllowed(
  env: Env,
  email: string,
  hd?: string
): Promise<boolean> {
  // 方法1: Google Workspace ドメインで制限（Workspace利用時のみ有効、個人Gmailではhdが存在しない）
  // if (hd === "yourcompany.com") return true;

  // 方法2: KVの許可リストで制限（個人Gmail運用ではこちらを推奨）
  const raw = await env.OAUTH_KV.get("ALLOWED_EMAILS");
  if (raw) {
    const allowed: string[] = JSON.parse(raw);
    return allowed.includes(email);
  }

  // 方法3: 環境変数から
  try {
    const allowed: string[] = JSON.parse(env.ALLOWED_EMAILS || "[]");
    return allowed.includes(email);
  } catch {
    return false;
  }
}

// === /authorize: Google OAuth 開始 ===
app.get("/authorize", async (c) => {
  // OAuthProvider から MCP クライアントの認可リクエスト情報をパース
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  if (!oauthReqInfo.clientId) {
    return c.text("Invalid request", 400);
  }

  // Google の認可エンドポイントへリダイレクト
  const googleAuthUrl = new URL(
    "https://accounts.google.com/o/oauth2/v2/auth"
  );
  googleAuthUrl.searchParams.set("client_id", c.env.GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set(
    "redirect_uri",
    `${new URL(c.req.url).origin}/callback`
  );
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("access_type", "offline");
  googleAuthUrl.searchParams.set("prompt", "consent");

  // MCP の認可リクエスト情報を state に埋め込む（コールバックで復元するため）
  const state = btoa(JSON.stringify({ oauthReqInfo }));
  googleAuthUrl.searchParams.set("state", state);

  return c.redirect(googleAuthUrl.toString());
});

// === /callback: Google OAuth コールバック ===
app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  if (!code || !stateParam) {
    return c.text("Missing code or state", 400);
  }

  // 1. Google の認可コードをアクセストークンに交換
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${new URL(c.req.url).origin}/callback`,
      grant_type: "authorization_code",
    }),
  });
  const tokens = await tokenRes.json<{
    access_token: string;
    id_token: string;
  }>();
  if (!tokens.access_token) {
    return c.text("Failed to exchange token with Google", 500);
  }

  // 2. Google のユーザー情報を取得
  const userRes = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }
  );
  const googleUser = await userRes.json<{
    email: string;
    name: string;
    picture: string;
    hd?: string; // Google Workspace の hosted domain
  }>();

  // 3. ★ ユーザー制限 ★
  const allowed = await isUserAllowed(c.env, googleUser.email, googleUser.hd);
  if (!allowed) {
    return c.text(
      `Access denied: ${googleUser.email} is not authorized.`,
      403
    );
  }

  // 4. state から MCP の認可リクエスト情報を復元
  const { oauthReqInfo } = JSON.parse(atob(stateParam));

  // 5. OAuthProvider に認可完了を通知 → MCP 用アクセストークンが生成される
  // props は McpAgent 内で this.props としてアクセス可能
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: googleUser.email,
    metadata: { label: googleUser.name },
    scope: oauthReqInfo.scope,
    props: {
      email: googleUser.email,
      name: googleUser.name,
    },
  });

  // 6. claude.ai のコールバック URL へリダイレクト（認可コード付き）
  return c.redirect(redirectTo);
});

export default app;
