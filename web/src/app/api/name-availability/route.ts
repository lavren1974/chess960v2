import { evaluateDisplayNameAvailability } from "@/lib/services/name-availability";
import { NextResponse } from "next/server";

const MIN_NAME_LENGTH = 6;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = (body?.name as string | undefined)?.trim();

    if (!name) {
      return NextResponse.json(
        { available: false, reason: "invalid_name" },
        { status: 400 },
      );
    }

    if (name.length < MIN_NAME_LENGTH) {
      return NextResponse.json(
        { available: false, reason: "too_short" },
        { status: 200 },
      );
    }

    const result = await evaluateDisplayNameAvailability(name);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Name availability API error:", error);
    return NextResponse.json({ available: null, reason: "unexpected" }, { status: 200 });
  }
}
