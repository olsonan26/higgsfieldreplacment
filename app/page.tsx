import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";

export default async function Home() {
  const context = await getAuthenticatedUser();
  redirect(context ? "/studio" : "/login");
}
