import { buildSearchIndex } from "@/lib/docs/search-index";
import { getDocsSite } from "@/lib/docs/site";

// Emitted at build time as out/search-index.json.
export const dynamic = "force-static";

export function GET() {
  return Response.json(buildSearchIndex(getDocsSite()));
}
