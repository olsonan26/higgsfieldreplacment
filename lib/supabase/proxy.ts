import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

const PROTECTED_PAGE_PREFIXES = [
  "/studio",
  "/assets",
  "/favorites",
  "/queue",
  "/ledger",
  "/settings",
];

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headersToSet) {
        for (const { name, value } of cookiesToSet)
          request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, options);
        for (const [header, value] of Object.entries(headersToSet))
          response.headers.set(header, value);
      },
    },
  });

  // Do not place logic between client creation and getClaims: this is the
  // supported SSR refresh sequence and cryptographically validates the JWT.
  const { data } = await supabase.auth.getClaims();
  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix),
  );

  if (!data?.claims && isProtectedPage) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/login";
    destination.searchParams.set("next", request.nextUrl.pathname);
    const redirect = NextResponse.redirect(destination);
    for (const cookie of response.cookies.getAll())
      redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}
