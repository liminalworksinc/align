import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { originOf, protectedResourceMetadata } from "@/lib/oauth/server";

// RFC 9728 metadata for the MCP endpoint. The 401 challenge points at the path-suffixed copy
// (api/mcp/route.ts next to this file); some clients look here at the root first, so both answer the same.
export function GET(req: Request) {
  return Response.json(protectedResourceMetadata(originOf(req)), { headers: { "access-control-allow-origin": "*" } });
}

const corsHandler = metadataCorsOptionsRequestHandler();
export { corsHandler as OPTIONS };
