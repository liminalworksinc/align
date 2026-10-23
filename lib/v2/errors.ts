/** A v2 error: `{ "error": "<code>", "message": "<human text>" }` with this HTTP status (docs/v2/WIRE.md). */
export class V2Error extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const notFound = () => new V2Error(404, "not_found", "Not found");
export const badRequest = (message: string, code = "bad_request") => new V2Error(400, code, message);
export const forbidden = (code: string, message: string) => new V2Error(403, code, message);
export const conflict = (code: string, message: string) => new V2Error(409, code, message);
