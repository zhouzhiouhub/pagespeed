import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import {
  refreshGoogleAccessToken,
  saveGoogleTokens,
} from "@/server/google/tokens";

applyProxyDispatcher();

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: `openid email profile ${GSC_SCOPE} ${GA4_SCOPE}`,
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token ?? token.refreshToken;
        token.expiresAt = account.expires_at;
        token.scope = account.scope;
        // Persist for cron / offline jobs (single-user V1)
        await saveGoogleTokens({
          email:
            typeof profile?.email === "string"
              ? profile.email
              : typeof token.email === "string"
                ? token.email
                : null,
          refreshToken: account.refresh_token ?? null,
          accessToken: account.access_token ?? null,
          expiresAt: account.expires_at ?? null,
          scope: account.scope ?? null,
        });
      }

      const expiresAt = typeof token.expiresAt === "number" ? token.expiresAt : 0;
      const stillValid = Date.now() < expiresAt * 1000 - 60_000;
      if (stillValid && token.accessToken) return token;

      if (!token.refreshToken) return token;

      try {
        const refreshed = await refreshGoogleAccessToken(String(token.refreshToken));
        token.accessToken = refreshed.access_token;
        token.expiresAt = Math.floor(Date.now() / 1000 + refreshed.expires_in);
        if (refreshed.refresh_token) {
          token.refreshToken = refreshed.refresh_token;
        }
        await saveGoogleTokens({
          accessToken: refreshed.access_token,
          expiresAt: token.expiresAt,
          refreshToken: refreshed.refresh_token ?? String(token.refreshToken),
          scope: typeof token.scope === "string" ? token.scope : null,
        });
        delete token.error;
      } catch {
        token.error = "RefreshAccessTokenError";
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken =
        typeof token.accessToken === "string" ? token.accessToken : undefined;
      session.error = typeof token.error === "string" ? token.error : undefined;
      const scope = typeof token.scope === "string" ? token.scope : "";
      session.hasGscScope = /webmasters|searchconsole/i.test(scope);
      session.hasGa4Scope = /analytics/i.test(scope);
      return session;
    },
  },
  trustHost: true,
});

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: string;
    hasGscScope?: boolean;
    hasGa4Scope?: boolean;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    scope?: string;
    error?: string;
  }
}
