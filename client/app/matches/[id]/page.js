"use client";

import MatchDetailPage from "@/components/match/MatchDetailPage";

export default function MatchDetail({ params }) {
  return <MatchDetailPage matchId={params.id} />;
}
