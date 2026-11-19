import { setDeviceSharingConsent } from "@/lib/v2/data-sharing";
import { deviceAuth, readJson, route } from "@/lib/v2/http";

export const PUT = route((req) => {
  const dev = deviceAuth(req);
  return readJson(req, 1024).then((body) => setDeviceSharingConsent(dev, body));
});
