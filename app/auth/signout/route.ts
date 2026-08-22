import { NextResponse } from "next/server";
import { assertTrustedOrigin } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(new URL("/login", request.url), {
      status: 303,
    });
  } catch {
    return NextResponse.json(
      { error: "Sign out request rejected" },
      { status: 403 },
    );
  }
}
