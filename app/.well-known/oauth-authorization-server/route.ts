import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { authServerMetadata, originOf } from "@/lib/oauth/server";

// RFC 8414 metadata for the in-app authorization server (lib/oauth/server.ts).
export function GET(req: Request) {
  return Response.json(authServerMetadata(originOf(req)), { headers: { "access-control-allow-origin": "*" } });
}

const corsHandler = metadataCorsOptionsRequestHandler();
export { corsHandler as OPTIONS };
