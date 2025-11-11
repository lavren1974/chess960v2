import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[]>;

export default async function RoundIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ lng: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { lng } = await params;
  const sp = (searchParams ? await searchParams : {}) as SearchParams;
  const scope = (Array.isArray(sp.scope) ? sp.scope[0] : sp.scope) === "all" ? "all" : null;

  const q = new URLSearchParams();
  if (scope === "all") q.set("scope", "all");
  const query = q.toString();

  redirect(`/${lng}/results/round/1${query ? `?${query}` : ""}`);
}

