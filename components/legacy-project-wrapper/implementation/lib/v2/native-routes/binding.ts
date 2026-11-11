// Typed caller bindings for admitted native HTTP route libraries.
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Params = Record<string, string | string[] | undefined>;
type Route = (request: Request, context: { params: Promise<Params> }) => Promise<Response>;
export type Routes = Record<string, Partial<Record<Method, Route>>>;
export function bindRoute<P extends Params>(routes: Routes, path: string, method: Method): (request: Request, context: { params: Promise<P> }) => Promise<Response> {
  const handler = routes[path]?.[method];
  if (typeof handler !== "function") throw new Error("Native route missing: " + method + " " + path);
  return handler;
}
