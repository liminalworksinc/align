import { config } from "../config";
import { getAuth } from "./auth";
import { localOwnerEmail } from "./config";
import { get } from "./db";
import { create_local_owner_bootstrap } from "../native/.bindings/server_local_owner_bootstrap.js";

interface LocalOwnerRuntime {
  ensureLocalOwner(): Promise<void>;
}

const localOwner = create_local_owner_bootstrap({
  config, get, localOwnerEmail, getAuth,
  getHeadersConstructor: () => Headers,
  readPort: () => process.env.PORT,
  getConsole: () => console,
}) as unknown as LocalOwnerRuntime;

export const ensureLocalOwner = localOwner.ensureLocalOwner;
