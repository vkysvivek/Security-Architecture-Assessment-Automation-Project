#!/usr/bin/env python3
"""Security Architecture Review Agent — local web server.

Serves the UI from public/ and exposes POST /api/analyze, which streams the
review back to the browser as Server-Sent Events. The Anthropic API key stays
in this process; it is never sent to the browser.

    export ANTHROPIC_API_KEY=sk-ant-...
    python3 server.py            # http://localhost:8420
"""

import base64
import json
import mimetypes
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from anthropic import Anthropic

from sar_prompt import SYSTEM_PROMPT
from sar_schema import REPORT_SCHEMA

ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"

HOST = os.environ.get("SECARCH_HOST", "127.0.0.1")
PORT = int(os.environ.get("SECARCH_PORT", "8420"))

DEFAULT_MODEL = "claude-opus-4-6"
ALLOWED_MODELS = {"claude-opus-4-6", "claude-sonnet-4-6"}
MAX_TOKENS = 64000
MAX_REQUEST_BYTES = 48 * 1024 * 1024

IMAGE_MEDIA_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
TEXT_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".json", ".yaml", ".yml", ".csv", ".tsv",
    ".xml", ".drawio", ".puml", ".plantuml", ".mmd", ".mermaid", ".dot",
    ".tf", ".hcl", ".sql", ".log", ".env", ".ini", ".toml", ".conf",
}
UNPARSEABLE_EXTENSIONS = {".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".pages", ".key"}

# The six minimum requested inputs, in the order section 9.1 lists them. These
# keys are the `data-category` values on the upload zones in public/index.html,
# and this dict is mirrored verbatim by CATEGORY_LABELS in public/app.js so the
# served and single-file builds produce identical wire payloads.
INPUT_ZONES = [
    ("architecture", "Architecture diagram"),
    ("dfd", "Data flow diagram"),
    ("hosting", "Hosting or deployment model"),
    ("integrations", "Integrations and third-party dependencies"),
    ("environments", "Environment scope"),
    ("identity", "Identity and access approach"),
]

CATEGORY_LABELS = {
    "architecture": "REQUESTED INPUT 1 — ARCHITECTURE DIAGRAM",
    "dfd": "REQUESTED INPUT 2 — DATA FLOW DIAGRAM",
    "hosting": "REQUESTED INPUT 3 — HOSTING OR DEPLOYMENT MODEL",
    "integrations": "REQUESTED INPUT 4 — INTEGRATIONS AND THIRD-PARTY DEPENDENCIES",
    "environments": "REQUESTED INPUT 5 — ENVIRONMENT SCOPE",
    "identity": "REQUESTED INPUT 6 — IDENTITY AND ACCESS APPROACH",
}


class InputError(Exception):
    """A problem with what the user supplied — reported back, not a crash."""


# --------------------------------------------------------------------------
# Turning uploads into content blocks
# --------------------------------------------------------------------------

def _media_type(name: str, declared: str) -> str:
    if declared and declared != "application/octet-stream":
        return declared
    guessed, _ = mimetypes.guess_type(name)
    return guessed or "application/octet-stream"


def build_file_block(upload: dict) -> tuple[dict, str]:
    """Return (content_block, human_description) for one uploaded file."""
    name = (upload.get("name") or "unnamed").strip()
    data = upload.get("data") or ""
    suffix = Path(name).suffix.lower()
    media_type = _media_type(name, (upload.get("type") or "").strip())

    if suffix in UNPARSEABLE_EXTENSIONS:
        raise InputError(
            f"'{name}' is an Office document, which cannot be read directly. "
            f"Export it as PDF and upload that instead."
        )

    try:
        raw = base64.b64decode(data, validate=True)
    except Exception:
        raise InputError(f"'{name}' could not be decoded — try re-uploading it.")

    if not raw:
        raise InputError(f"'{name}' is empty.")

    if media_type in IMAGE_MEDIA_TYPES:
        block = {
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": data},
        }
        return block, f"image ({media_type})"

    if media_type == "application/pdf" or suffix == ".pdf":
        block = {
            "type": "document",
            "source": {"type": "base64", "media_type": "application/pdf", "data": data},
            "title": name,
        }
        return block, "PDF document"

    if media_type.startswith("text/") or suffix in TEXT_EXTENSIONS:
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("utf-8", errors="replace")
        block = {"type": "text", "text": f"--- FILE: {name} ---\n{text}\n--- END FILE: {name} ---"}
        return block, "text file"

    raise InputError(
        f"'{name}' has an unsupported type ({media_type}). "
        f"Supported: PNG, JPEG, GIF, WebP, PDF, and plain-text formats."
    )


def build_user_content(payload: dict) -> list[dict]:
    """Assemble the per-request user turn: intake record, then the material.

    Nothing here is mandatory. A run with no files at all is legitimate: it
    produces a report in which all six requested inputs are Not provided.
    Mirrors buildUserContent() in public/app.js — keep the two in step.
    """
    files = payload.get("files") or []
    context = payload.get("context") or {}
    links = payload.get("links") or {}

    lines = ["## SRC-01 / SRC-02 — SAR INTAKE RECORD AND SOLUTION METADATA", ""]

    fields = [
        ("Application / solution name", context.get("name")),
        ("What triggered this review", context.get("change_type")),
        ("Delivery model", context.get("delivery_model")),
        ("Internet facing", context.get("internet_facing")),
        ("What the solution does", context.get("purpose")),
        ("Hosting / deployment model", context.get("hosting")),
        ("Environment scope for this review", context.get("environments")),
        ("Integrations and third-party dependencies", context.get("integrations")),
        ("Identity and access approach", context.get("identity")),
        ("Actors and user population", context.get("users")),
        ("Data sensitivity", context.get("data_sensitivity")),
        ("Business criticality", context.get("criticality")),
        ("Regulatory / policy context", context.get("regulatory")),
        ("Other notes from the team", context.get("notes")),
    ]

    def stated(value) -> bool:
        return bool(value and str(value).strip())

    for label, value in fields:
        if stated(value):
            lines.append(f"- **{label}:** {str(value).strip()}")

    # Free-text notes are not a fact about the solution, so their absence is
    # not something to report on. Every other blank field is.
    omitted = [label for label, value in fields[:-1] if not stated(value)]
    if omitted:
        lines += [
            "",
            f"The team left these intake fields blank: {'; '.join(omitted)}. "
            "Treat each as not stated. Do not invent a value, and reflect the "
            "absence in your findings where it matters.",
        ]

    # UC-05-OUT-02, assembled here so the source register is a record of fact
    # rather than something the model has to reconstruct. The link/file
    # distinction is load-bearing: a link is a location, not evidence.
    lines += ["", "## SRC-03 — EVIDENCE SOURCE REGISTER FOR THE SIX MINIMUM REQUESTED INPUTS", ""]
    link_count = 0
    for category, label in INPUT_ZONES:
        mine = [f for f in files if f.get("category") == category]
        link = str(links.get(category) or "").strip()
        if mine:
            names = ", ".join((f.get("name") or "unnamed").strip() for f in mine)
            also = f" (also referenced at {link})" if link else ""
            lines.append(f"- **{label}:** ATTACHED — {len(mine)} file(s): {names}{also}")
        elif link:
            link_count += 1
            lines.append(f"- **{label}:** REFERENCED LINK ONLY, CONTENTS NOT RETRIEVED — {link}")
        else:
            lines.append(f"- **{label}:** NOT SUBMITTED — nothing was provided for this requested input.")

    if link_count:
        lines += [
            "",
            "One or more inputs were given as a link rather than a file. You cannot open "
            "links: the location is known, the contents are not. Record each in the source "
            "register verbatim with source_type 'Referenced link — not retrieved', and "
            "assess the input as Not provided — no completeness credit, and a corresponding "
            "finding. State in that finding that the artifact was referenced but its "
            "contents were unavailable to this review, not that the team failed to produce it.",
        ]

    lines += ["", "## ATTACHED MATERIAL", ""]
    if files:
        lines += [
            "The files below are attached in order, each labelled with the requested "
            "input it was submitted against. Read every one before you begin. A file "
            "submitted under one input may of course inform another; judge each input "
            "on the substance available to you, not on the label alone.",
            "",
        ]
    else:
        lines += [
            "No files were attached. Every one of the six minimum requested inputs is "
            "therefore not provided. Produce the report from the intake record alone, "
            "record each input as Not provided, and say plainly that no architecture "
            "understanding could be constructed.",
            "",
        ]

    content: list[dict] = [{"type": "text", "text": "\n".join(lines)}]

    for index, upload in enumerate(files, start=1):
        block, description = build_file_block(upload)
        label = CATEGORY_LABELS.get(upload.get("category"), "SUPPORTING DOCUMENT")
        name = (upload.get("name") or "unnamed").strip()
        content.append({
            "type": "text",
            "text": f"### Attachment {index} — {label}: {name} ({description})",
        })
        content.append(block)

    content.append({
        "type": "text",
        "text": (
            "Now run the SAR Step 1 agent chain over this material, in the order your "
            "instructions set out: INTK for applicability, review path, classification and "
            "the evidence checklist; EXTR for the source register, component inventory, flow "
            "register, stated control register and normalized fact set; VALD for gaps, "
            "conflicts, sufficiency and clarification requests; KNOW for the requirement and "
            "guidance basis; CTRL for all eight domain assessment records; GAPF for candidate "
            "gaps, candidate findings and treatment options; VALD again for finding linkage; "
            "RPTS for the technical summary, the ordered next steps and the executive summary. "
            "Close with the human review gate and the thirty-row use-case coverage record. "
            "Every finding must trace back to a normalized fact and a candidate gap. Stay "
            "inside scope — architecture-level findings only, no configuration findings, no "
            "threat modelling, no control-effectiveness ratings and no CVE, CWE or OWASP "
            "references. Everything you produce is candidate output for a human Security "
            "Architect. Return only the JSON report."
        ),
    })
    return content


# --------------------------------------------------------------------------
# The model call
# --------------------------------------------------------------------------

def run_analysis(payload: dict, api_key: str, emit) -> dict:
    """Stream the review from the API, pushing progress through `emit`."""
    model = payload.get("model") or DEFAULT_MODEL
    if model not in ALLOWED_MODELS:
        model = DEFAULT_MODEL
    effort = payload.get("effort") if payload.get("effort") in {"low", "medium", "high", "max"} else "high"

    emit("status", {"phase": "preparing", "message": "Reading the submitted material…"})
    user_content = build_user_content(payload)
    attachment_count = len(payload.get("files") or [])

    client = Anthropic(api_key=api_key)

    request = {
        "model": model,
        "max_tokens": MAX_TOKENS,
        # One cached system block. SYSTEM_PROMPT is static, so every request
        # after the first reads it from cache at ~10% of input cost.
        "system": [{
            "type": "text",
            "text": SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        "messages": [{"role": "user", "content": user_content}],
        "thinking": {"type": "adaptive"},
        "output_config": {
            "effort": effort,
            "format": {"type": "json_schema", "schema": REPORT_SCHEMA},
        },
    }

    emit("status", {
        "phase": "analyzing",
        "message": (
            f"{model} is reconstructing the architecture from {attachment_count} attachment(s)…"
            if attachment_count
            else f"{model} is reviewing the intake record — no files were submitted…"
        ),
    })

    try:
        final = _stream(client, request, emit)
    except Exception as exc:
        # If this build of the API rejects the structured-output constraint, fall
        # back to an unconstrained call — SYSTEM_PROMPT already demands raw JSON,
        # so we still get a report, just without schema enforcement.
        if not _is_output_config_rejection(exc):
            raise
        print(f"  output_config rejected ({exc}); retrying without schema enforcement", file=sys.stderr)
        request["output_config"] = {"effort": effort}
        emit("status", {"phase": "analyzing", "message": "Retrying without schema enforcement…"})
        final = _stream(client, request, emit)

    usage = getattr(final, "usage", None)
    emit("status", {"phase": "assembling", "message": "Assembling the report…"})

    report = _extract_report(final)
    return {
        "report": report,
        "meta": {
            "model": model,
            "effort": effort,
            "input_tokens": getattr(usage, "input_tokens", None),
            "output_tokens": getattr(usage, "output_tokens", None),
            "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", None),
            "cache_creation_input_tokens": getattr(usage, "cache_creation_input_tokens", None),
        },
    }


def _is_output_config_rejection(exc: Exception) -> bool:
    """True when the API refused the request over output_config, not over content."""
    if getattr(exc, "status_code", None) not in (400, 422) and not isinstance(exc, TypeError):
        return False
    text = str(exc).lower()
    return any(token in text for token in ("output_config", "json_schema", "output_format", "schema"))


def _stream(client: Anthropic, request: dict, emit):
    """Run the streaming request, relaying thinking as it arrives."""
    thinking_chars = 0
    output_chars = 0
    with client.messages.stream(**request) as stream:
        for event in stream:
            if event.type != "content_block_delta":
                continue
            delta = event.delta
            kind = getattr(delta, "type", "")
            if kind == "thinking_delta":
                text = getattr(delta, "thinking", "") or ""
                thinking_chars += len(text)
                emit("thinking", {"text": text, "total": thinking_chars})
            elif kind == "text_delta":
                output_chars += len(getattr(delta, "text", "") or "")
                if output_chars % 2000 < 64:
                    emit("status", {
                        "phase": "writing",
                        "message": f"Writing the report… {output_chars:,} characters so far",
                    })
    return stream.get_final_message()


def _extract_report(message) -> dict:
    """Pull the JSON report out of the final message."""
    chunks = [
        block.text for block in message.content
        if getattr(block, "type", "") == "text" and getattr(block, "text", "")
    ]
    text = "".join(chunks).strip()
    if not text:
        raise RuntimeError("The model returned no report content.")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Belt and braces: strip a stray markdown fence if one slipped through.
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise RuntimeError("The model's response was not valid JSON.")


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    server_version = "SecArchAgent/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write(f"  {self.address_string()} — {fmt % args}\n")

    # -- static files ------------------------------------------------------

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            path = "/index.html"
        if path == "/health":
            return self._send_json(200, {"ok": True, "key_configured": bool(_env_key())})

        target = (PUBLIC_DIR / path.lstrip("/")).resolve()
        if not target.is_relative_to(PUBLIC_DIR) or not target.is_file():
            return self._send_bytes(404, b"Not found", "text/plain; charset=utf-8")

        content_type, _ = mimetypes.guess_type(str(target))
        if content_type and content_type.startswith("text/"):
            content_type += "; charset=utf-8"
        # Local tool: never cache, so editing a file and reloading actually reloads it.
        self._send_bytes(200, target.read_bytes(), content_type or "application/octet-stream",
                         extra_headers={"Cache-Control": "no-store, must-revalidate"})

    # -- analysis ----------------------------------------------------------

    def do_POST(self):
        if urlparse(self.path).path != "/api/analyze":
            return self._send_json(404, {"error": "Unknown endpoint."})

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return self._send_json(400, {"error": "Empty request."})
        if length > MAX_REQUEST_BYTES:
            return self._send_json(413, {
                "error": f"Uploads total more than {MAX_REQUEST_BYTES // (1024 * 1024)} MB. "
                         f"Remove a file or use lower-resolution images."
            })

        try:
            payload = json.loads(self._read_exactly(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return self._send_json(400, {"error": "Request body was not valid JSON."})

        api_key = (payload.get("api_key") or "").strip() or _env_key()
        if not api_key:
            return self._send_json(400, {
                "error": "No Anthropic API key. Set ANTHROPIC_API_KEY before starting the "
                         "server, or paste a key into the field in the UI."
            })

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-store")
        self.send_header("Connection", "close")
        self.end_headers()

        def emit(event: str, data: dict):
            try:
                frame = f"event: {event}\ndata: {json.dumps(data)}\n\n"
                self.wfile.write(frame.encode("utf-8"))
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                raise ClientGone()

        try:
            result = run_analysis(payload, api_key, emit)
            emit("complete", result)
        except ClientGone:
            self.log_message("client disconnected mid-analysis")
        except InputError as exc:
            self._safe_emit(emit, "failed", {"error": str(exc)})
        except Exception as exc:
            traceback.print_exc()
            self._safe_emit(emit, "failed", {"error": _friendly_error(exc)})
        finally:
            self.close_connection = True

    # -- helpers -----------------------------------------------------------

    def _read_exactly(self, length: int) -> bytes:
        chunks, remaining = [], length
        while remaining > 0:
            chunk = self.rfile.read(min(remaining, 1 << 20))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

    def _safe_emit(self, emit, event: str, data: dict):
        try:
            emit(event, data)
        except ClientGone:
            pass

    def _send_json(self, status: int, body: dict):
        self._send_bytes(status, json.dumps(body).encode("utf-8"), "application/json; charset=utf-8")

    def _send_bytes(self, status: int, body: bytes, content_type: str, extra_headers: dict | None = None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)


class ClientGone(Exception):
    """The browser hung up."""


def _env_key() -> str:
    return (os.environ.get("ANTHROPIC_API_KEY") or "").strip()


def _friendly_error(exc: Exception) -> str:
    text = str(exc)
    lowered = text.lower()
    if "authentication" in lowered or "401" in text or "invalid x-api-key" in lowered:
        return "The API key was rejected. Check ANTHROPIC_API_KEY or the key entered in the UI."
    if "rate_limit" in lowered or "429" in text:
        return "Rate limited by the Anthropic API. Wait a moment and try again."
    if "credit" in lowered or "billing" in lowered:
        return "The Anthropic account has insufficient credit for this request."
    if "overloaded" in lowered or "529" in text:
        return "The API is overloaded right now. Retry in a few seconds."
    return f"Analysis failed: {text}"


def main():
    if not PUBLIC_DIR.is_dir():
        sys.exit(f"Missing UI directory: {PUBLIC_DIR}")

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True

    key_state = "found in environment" if _env_key() else "NOT set — you can paste one in the UI"
    print("\n  Security Architecture Review Agent")
    print(f"  URL              http://{HOST}:{PORT}")
    print(f"  Model            {DEFAULT_MODEL}")
    print(f"  ANTHROPIC_API_KEY  {key_state}")
    print("  Ctrl-C to stop\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
