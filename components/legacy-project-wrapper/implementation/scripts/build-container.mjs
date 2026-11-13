// Keep the acceptance digest outside the Docker context and supply it as a build input.
import assert from "node:assert/strict";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {prepareContainer} from "./prepare-container.mjs";
import {testPreparedInputs} from "./test-container-inputs.mjs";

assert(process.argv.length === 3 && /^[A-Za-z0-9][A-Za-z0-9._/:\-]{0,255}$/.test(process.argv[2]), "Expected one local image tag");
const implementation = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const accepted = prepareContainer(implementation);
const controls = testPreparedInputs(implementation, accepted.digest);
process.stderr.write(JSON.stringify({native_preparation: accepted, transport_controls: controls}) + "\n");
const result = spawnSync("docker", ["build", "--build-arg", "ALIGN_NATIVE_PREPARED_SHA256=" + accepted.digest,
  "-q", "-t", process.argv[2], "."], {cwd: implementation, stdio: "inherit"});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
