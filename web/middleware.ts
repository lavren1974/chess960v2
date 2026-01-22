import type { NextRequest } from "next/server";
import { proxy } from "./src/proxy";

export async function middleware(request: NextRequest) {
  return proxy(request);
}

// Next.js requires the config object to be statically analyzable in this file
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|images|favicon.ico).*)"],
};
