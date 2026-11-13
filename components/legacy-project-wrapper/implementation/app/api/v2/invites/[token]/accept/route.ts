// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/identity-routes";

export const POST = bindRoute<{ token: string }>(routes, "invites/[token]/accept", "POST");
