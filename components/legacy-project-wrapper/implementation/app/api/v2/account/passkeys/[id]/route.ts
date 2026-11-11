// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/identity-routes";

export const PATCH = bindRoute<{ id: string }>(routes, "account/passkeys/[id]", "PATCH");
export const DELETE = bindRoute<{ id: string }>(routes, "account/passkeys/[id]", "DELETE");
