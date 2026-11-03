import { Suspense } from "react";
import Link from "next/link";
import LoginForm from "@/components/auth/login-form";
import { portiaEnabled } from "@/lib/config";
export const dynamic = "force-dynamic";
export default function LoginPage() {
  if (!portiaEnabled()) return <main className="grid min-h-screen place-content-center gap-4 px-6"><h1>Sign-in is not available yet</h1><p>Account setup is still in progress.</p><Link href="/">Back to home</Link></main>;
  return <Suspense><LoginForm basicSignup={process.env.PORTIA_AUTH_MODE === "basic"} /></Suspense>;
}
