import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Aperture } from "lucide-react";
import { LoginForm } from "@/app/login/login-form";
import { getAuthenticatedUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  if (await getAuthenticatedUser()) redirect("/studio");

  return (
    <main className="login-page">
      <section className="login-story" aria-labelledby="login-title">
        <div className="brand-lockup">
          <span>
            <Aperture aria-hidden="true" />
          </span>
          <strong>VesperFrame</strong>
        </div>
        <p className="login-eyebrow">CINEMATIC GENERATION WORKSPACE</p>
        <h1 id="login-title">Direct the impossible.</h1>
        <p>
          Build image and video work with exact model controls, private assets,
          durable projects, and an accountable generation ledger.
        </p>
      </section>
      <section className="login-panel" aria-label="Sign in to VesperFrame">
        <div>
          <p>WELCOME BACK</p>
          <h2>Enter your studio</h2>
          <span>We’ll email a one-time secure sign-in link.</span>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
