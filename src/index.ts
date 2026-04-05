import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import GoogleHandler from "./google-handler";
import { MyMCP } from "./mcp-server";

export { MyMCP };

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: MyMCP.serve("/mcp"),
  defaultHandler: GoogleHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
