/**
 * Auth skeleton (single-user / Google OAuth via Auth.js in M0–M2).
 * V1 may run without login for local Kinolin experiments.
 */
export type SessionUser = {
  id: string;
  email: string;
  name?: string;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  // Replace with Auth.js session when NEXTAUTH_* + Google OAuth are configured.
  if (process.env.DEV_BYPASS_AUTH === "true") {
    return {
      id: "local-dev",
      email: "dev@localhost",
      name: "Local Dev",
    };
  }
  return null;
}
