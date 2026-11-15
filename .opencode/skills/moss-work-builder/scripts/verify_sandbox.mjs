#!/usr/bin/env node
// Use an explicitly supplied trusted SDK; never execute or import work code.
import { createHash } from "node:crypto";
import { readdir, readFile, lstat, realpath } from "node:fs/promises";
import { resolve, relative, sep, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
  const [directory, flag, sdkPath, ...extra] = process.argv.slice(2);
  if (!directory || flag !== "--sdk" || !sdkPath || extra.length) {
    throw new Error("Usage: node verify_sandbox.mjs <build-directory> --sdk <trusted-sdk-dist/index.js>");
  }
  if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Node 24+ is required");
  const root = await realpath(resolve(directory));
  if (!(await lstat(root)).isDirectory()) throw new Error("Expected a build directory");
  const sdkFile = await realpath(resolve(sdkPath));
  const sdkRelative = relative(root, sdkFile);
  if (sdkRelative === "" || (!sdkRelative.startsWith(`..${sep}`) && sdkRelative !== ".." && !isAbsolute(sdkRelative))) {
    // Only the trusted SDK outside the uploaded artifact may be imported.
    throw new Error("SDK must be outside the untrusted build directory");
  }
  const sdk = await import(pathToFileURL(sdkFile).href);
  if (typeof sdk.prepareSandboxPackage !== "function") throw new Error("SDK has no package preparation API");
  const limits = sdk.SANDBOX_PACKAGE_LIMITS;
  const files = Object.create(null);
  const manifestFiles = Object.create(null);
  let total = 0;
  async function walk(folder) {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const full = join(folder, item.name);
      const info = await lstat(full);
      if (info.isSymbolicLink()) throw new Error("Symlinks are not supported");
      if (info.isDirectory()) { await walk(full); continue; }
      if (!info.isFile()) throw new Error("Expected ordinary files");
      const name = relative(root, full).split(sep).join("/");
      if (Object.keys(files).length >= limits.files || info.size > limits.fileBytes || total + info.size > limits.totalBytes) {
        throw new Error("Package size/count budget exceeded");
      }
      const bytes = await readFile(full);
      if (bytes.length !== info.size) throw new Error("File changed while reading");
      total += bytes.length;
      files[name] = bytes;
      manifestFiles[name] = { sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
    }
  }
  await walk(root);
  const prepared = await sdk.prepareSandboxPackage({
    manifest: { formatVersion: 1, entrypoint: "index.html", files: manifestFiles }, files,
  });
  console.log(JSON.stringify({ status: "sdk-prepare-pass", runtimeVersion: prepared.runtimeVersion,
    totalBytes: prepared.totalBytes, files: Object.keys(files).length,
    validation: { sdkPrepare: "passed", runtimeExecution: "not-run", mossPreview: "not-run", pickcatPlayback: "not-run" } }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({ status: "error", code: error.code ?? "VERIFY_FAILED", error: error.message }));
  process.exitCode = 1;
});
