import type { NextRequest } from "next/server";
import { proxy } from "./src/proxy";

// Turbopack requires the config object to be defined here (no re-exports)
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|images|favicon.ico).*)"],
};

export function middleware(request: NextRequest) {
  return proxy(request);
}
