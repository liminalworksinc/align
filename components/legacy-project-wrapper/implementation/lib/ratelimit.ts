import { config } from "./config";
import * as native from "./native/.bindings/server_client_keys.js";

interface ClientKeys {
  clientNet(ip: string): string;
  clientOf(req: Request): string;
}

const tools = native.create_client_keys({ config }) as ClientKeys;

export const clientNet = tools.clientNet;
export const clientOf = tools.clientOf;
