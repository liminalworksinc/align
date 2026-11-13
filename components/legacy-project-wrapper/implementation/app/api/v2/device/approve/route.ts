// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/identity-routes";

export const POST = bindRoute<Record<string, string | string[] | undefined>>(routes, "device/approve", "POST");
