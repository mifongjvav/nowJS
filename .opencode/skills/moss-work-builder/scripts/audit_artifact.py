#!/usr/bin/env python3
"""Audit a MOSS build directory/ZIP without extracting or executing content."""

import argparse
import hashlib
import json
import re
import stat
import sys
import zipfile
from pathlib import Path

LIMITS = {"files": 2000, "fileBytes": 25 * 1024**2,
          "totalBytes": 50 * 1024**2, "pathBytes": 512}
PERMISSIONS = ("worker", "wasm", "pointerLock", "eval", "clipboardRead")
TEXT = {".html", ".css", ".js", ".mjs", ".svg"}
HINTS = (
    (r"https?://|(?<!:)//[A-Za-z0-9-]+\.", "URL_REVIEW",
     "Review remote references; namespaces, comments and inert hints may be harmless."),
    (r"\b(?:XMLHttpRequest|SharedWorker|importScripts)\b", "API_REVIEW",
     "Review unsupported direct APIs, including bundled inactive branches."),
    (r"\b(?:eval\s*\(|new\s+Function\b)", "EVAL_REVIEW", "Review eval/wasm permissions."),
    (r"\b(?:new\s+Worker\b|WebAssembly\b|requestPointerLock\b|clipboardReadText\b)",
     "PERMISSION_REVIEW", "Review required work permissions; scanning does not grant them."),
)


def check_path(name):
    if (not name or len(name.encode("utf-8")) > LIMITS["pathBytes"]
            or re.search(r"[\\:%?#\x00-\x20\x7f]", name)
            or name.startswith("/")
            or any(p in ("", ".", "..") for p in name.split("/"))):
        raise ValueError(f"INVALID_PATH: {name!r}")
    segments = name.split("/")
    if (any(p in {".git", "node_modules", "__MACOSX", "__pycache__"} for p in segments)
            or segments[-1] in {".DS_Store", "Thumbs.db", ".env"}
            or segments[-1].startswith(".env.")):
        raise ValueError(f"PACKAGING_HYGIENE: exclude development/cache/secret file {name!r}")


def read_artifact(source):
    """Bound admission before decompression; ZIP contents are never extracted."""
    files = {}
    total = 0

    def admit(name, size):
        nonlocal total
        check_path(name)
        if name in files:
            raise ValueError(f"DUPLICATE_PATH: {name!r}")
        total += size
        if len(files) >= LIMITS["files"] or size > LIMITS["fileBytes"] or total > LIMITS["totalBytes"]:
            raise ValueError("LIMIT_EXCEEDED: file count, file size or total raw bytes")

    if source.is_dir():
        for item in sorted(source.rglob("*")):
            if item.is_symlink() or getattr(item, "is_junction", lambda: False)():
                raise ValueError(f"SYMLINK: {item}")
            if not item.is_file():
                continue
            name = item.relative_to(source).as_posix()
            size = item.stat().st_size
            admit(name, size)
            with item.open("rb") as stream:
                data = stream.read(LIMITS["fileBytes"] + 1)
            if len(data) != size:
                raise ValueError(f"SIZE_CHANGED: {name}")
            files[name] = data
    else:
        with zipfile.ZipFile(source) as archive:
            for info in archive.infolist():
                # Inspect original names too: ZipInfo.filename truncates NULs.
                if info.orig_filename != info.filename:
                    raise ValueError("INVALID_PATH: NUL in ZIP entry")
                if info.is_dir():
                    check_path(info.filename.rstrip("/"))
                    continue
                admit(info.filename, info.file_size)
                if (info.flag_bits & 1 or info.compress_type not in (0, 8)
                        or stat.S_ISLNK(info.external_attr >> 16)):
                    raise ValueError(f"UNSUPPORTED_ZIP: {info.filename}")
                with archive.open(info) as stream:
                    data = stream.read(info.file_size + 1)
                if len(data) != info.file_size:
                    raise ValueError(f"INVALID_ZIP_SIZE: {info.filename}")
                files[info.filename] = data
    if "index.html" not in files:
        raise ValueError("INVALID_ENTRYPOINT: root index.html is required")
    return files


def audit(source, permissions=()):
    required = set(permissions)
    if required - set(PERMISSIONS):
        raise ValueError("UNKNOWN_PERMISSION")
    if "eval" in required:
        required.add("wasm")
    files = read_artifact(source)
    warnings = []
    for name, data in files.items():
        suffix = Path(name).suffix.lower()
        if suffix not in TEXT:
            continue
        text = data.decode("utf-8", errors="strict")
        # Secondary HTML is passive data, not a compiled executable document.
        if suffix == ".html" and name != "index.html":
            continue
        for pattern, code, message in HINTS:
            if re.search(pattern, text):
                warnings.append({"code": code, "file": name, "message": message})
    manifest = {name: {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}
                for name, data in sorted(files.items())}
    return files, {
        "status": "structure-pass", "sandboxRuntimeBaseline": "0.4.1",
        "fileCount": len(files), "totalBytes": sum(map(len, files.values())),
        "permissionsToDeclare": [p for p in PERMISSIONS if p in required],
        "warnings": warnings, "manifest": manifest,
        "validation": {"structure": "passed", "sdkPrepare": "not-run",
                       "mossPreview": "not-run", "pickcatPlayback": "not-run"},
    }


def write_zip(files, output):
    # Exclusive mode: never replace an author's existing deliverable.
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--permissions", nargs="*", choices=PERMISSIONS, default=[])
    parser.add_argument("--output", type=Path, help="Create a new ZIP after structure checks")
    args = parser.parse_args()
    try:
        source = args.artifact.resolve(strict=True)
        if args.output:
            output = args.output.resolve()
            if source.is_dir() and output.is_relative_to(source):
                raise ValueError("OUTPUT_INSIDE_INPUT: place the ZIP outside the build directory")
            if output.suffix.lower() != ".zip":
                raise ValueError("OUTPUT_EXTENSION: expected .zip")
        files, report = audit(source, args.permissions)
        if args.output:
            write_zip(files, output)
            _, check = audit(output, args.permissions)
            if check["manifest"] != report["manifest"]:
                raise ValueError("ZIP_ROUNDTRIP: contents changed")
            report["output"] = str(output)
            report["zipSha256"] = hashlib.sha256(output.read_bytes()).hexdigest()
        elif source.is_file():
            report["zipSha256"] = hashlib.sha256(source.read_bytes()).hexdigest()
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, RuntimeError, zipfile.BadZipFile, NotImplementedError) as error:
        print(json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
