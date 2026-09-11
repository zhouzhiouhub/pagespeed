import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: `openid email profile ${GSC_SCOPE}`,
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token ?? token.refreshToken;
        token.expiresAt = account.expires_at;
        token.scope = account.scope;
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
      } catch {
        token.error = "RefreshAccessTokenError";
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = typeof token.accessToken === "string" ? token.accessToken : undefined;
      session.error = typeof token.error === "string" ? token.error : undefined;
      session.hasGscScope =
        typeof token.scope === "string"
          ? token.scope.includes("webmasters")
          : Boolean(token.accessToken);
      return session;
    },
  },
  trustHost: true,
});

async function refreshGoogleAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
  };
  if (!res.ok || !data.access_token || !data.expires_in) {
    throw new Error(data.error ?? "Failed to refresh Google token");
  }
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    refresh_token: data.refresh_token,
  };
}

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: string;
    hasGscScope?: boolean;
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
