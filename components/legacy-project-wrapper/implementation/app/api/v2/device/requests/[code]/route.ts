// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/identity-routes";

export const GET = bindRoute<{ code: string }>(routes, "device/requests/[code]", "GET");
