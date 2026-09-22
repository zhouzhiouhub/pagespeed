import { signIn } from "@/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const callbackUrl = url.searchParams.get("callbackUrl") || "/audit";
  return signIn("google", { redirectTo: callbackUrl });
}
