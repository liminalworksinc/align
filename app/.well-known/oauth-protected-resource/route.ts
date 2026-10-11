import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";

// RFC 9728 metadata that the MCP endpoint's 401 challenge points at. Align uses a static
// bearer token (ALIGN_MCP_TOKEN), so no OAuth authorization server is advertised.
const handler = protectedResourceHandler({ authServerUrls: [], resourceUrl: "http://localhost:3100/api/mcp" });
const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
