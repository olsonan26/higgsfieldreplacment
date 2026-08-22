import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const next =
    requestedNext && /^\/[a-zA-Z0-9/_-]*$/.test(requestedNext)
      ? requestedNext
      : "/studio";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  const failure = new URL("/login", url.origin);
  failure.searchParams.set("error", "expired-link");
  return NextResponse.redirect(failure);
}
