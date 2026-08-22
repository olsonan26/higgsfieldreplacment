"use server";

import { getPublicEnvironment } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { status: "idle" | "sent" | "error"; message: string };

export async function requestMagicLink(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const emailValue = formData.get("email");
  const email =
    typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const environment = getPublicEnvironment();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${environment.NEXT_PUBLIC_APP_URL}/auth/callback`,
      shouldCreateUser: true,
    },
  });

  if (error)
    return {
      status: "error",
      message:
        "We could not send the sign-in link. Wait a moment and try again.",
    };
  return {
    status: "sent",
    message: "Check your email for a secure VesperFrame sign-in link.",
  };
}
