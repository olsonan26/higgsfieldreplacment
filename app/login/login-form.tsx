"use client";

import { useActionState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { requestMagicLink, type LoginState } from "@/app/login/actions";

const initialState: LoginState = { status: "idle", message: "" };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    requestMagicLink,
    initialState,
  );

  return (
    <form action={formAction} className="login-form" data-testid="auth-sign-in">
      <label htmlFor="email">Work email</label>
      <input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        maxLength={254}
        disabled={pending}
      />
      <button type="submit" disabled={pending}>
        <span>{pending ? "Sending secure link…" : "Continue with email"}</span>
        <ArrowRight aria-hidden="true" />
      </button>
      <p
        className={`login-status ${state.status}`}
        role={state.status === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        {state.message}
      </p>
      <small>
        <LockKeyhole aria-hidden="true" /> Private workspaces are protected by
        authenticated membership.
      </small>
    </form>
  );
}
