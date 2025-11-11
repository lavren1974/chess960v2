import { redirect } from "next/navigation";

// Legacy route kept to preserve old links. Now immediately redirects to All Results.
export const dynamic = "force-dynamic";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = await params;
  redirect(`/${lng}/results/all`);
}
