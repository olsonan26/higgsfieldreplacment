import type { Metadata } from "next";
import { StudioShell } from "@/components/studio/studio-shell";
import { loadStudioInitialData } from "@/server/studio/initial-data";

export const metadata: Metadata = {
  title: "Studio",
  robots: { index: false, follow: false },
};

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; project?: string }>;
}) {
  const query = await searchParams;
  const initial = await loadStudioInitialData(query.workspace, query.project);
  return <StudioShell initial={initial} />;
}
