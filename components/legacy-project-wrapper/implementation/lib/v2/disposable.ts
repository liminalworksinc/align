import { forbidden } from "./errors";
import { create_disposable } from "../native/.bindings/server_workspace_admission.js";

interface DisposableRuntime {
  isDisposable(email: string): boolean;
  refuseDisposable(email: string): void;
}

const disposable = create_disposable({ forbidden }) as unknown as DisposableRuntime;

export const isDisposable = disposable.isDisposable;
export const refuseDisposable = disposable.refuseDisposable;
