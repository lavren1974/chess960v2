import { redirect } from "next/navigation";

export default async function OldPgnRedirect({
  params,
}: {
  params: Promise<{ lng: string; matchId: string }>;
}) {
  const { lng, matchId } = await params;
  redirect(`/${lng}/results/game/${matchId}`);
}
