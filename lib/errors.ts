export class HttpError extends Error {
  /** `code` is sent in the JSON body only when set, so every existing error body stays exactly as it was. */
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}
