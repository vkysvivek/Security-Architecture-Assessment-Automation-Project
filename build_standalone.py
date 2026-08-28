#!/usr/bin/env python3
"""Assemble the whole agent into one portable HTML file.

    python3 build_standalone.py            # -> secarch-agent.html

The output has no server behind it: the browser calls the Anthropic API
directly using the key the user pastes into Settings. Everything except the
jsPDF library is inlined, so the file can be emailed and opened by
double-clicking it.

Run this after editing anything in public/, sar_prompt.py, or sar_schema.py —
the single-file build is generated, never hand-edited.
"""

import json
import sys
from pathlib import Path

from sar_prompt import SYSTEM_PROMPT
from sar_schema import REPORT_SCHEMA

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
OUTPUT = ROOT / "secarch-agent.html"

JSPDF_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"


def js_string(value) -> str:
    """JSON-encode for safe embedding inside a <script> block.

    json.dumps handles quoting and escapes; the </script> guard stops a literal
    closing tag inside the data from terminating the script element early.
    """
    return json.dumps(value, ensure_ascii=False).replace("</", "<\\/")


def main() -> int:
    html = (PUBLIC / "index.html").read_text(encoding="utf-8")
    css = (PUBLIC / "styles.css").read_text(encoding="utf-8")
    app = (PUBLIC / "app.js").read_text(encoding="utf-8")

    if "SECARCH_STANDALONE" not in app:
        print("error: public/app.js has no standalone branch — rebuild aborted.", file=sys.stderr)
        return 1

    html = html.replace(
        '<link rel="stylesheet" href="styles.css">',
        f"<style>\n{css}\n</style>",
    )

    payload = (
        "<script>\n"
        "window.SECARCH_STANDALONE = true;\n"
        f"window.SECARCH_SYSTEM_PROMPT = {js_string(SYSTEM_PROMPT)};\n"
        f"window.SECARCH_REPORT_SCHEMA = {js_string(REPORT_SCHEMA)};\n"
        "</script>\n"
        f'<script src="{JSPDF_CDN}"></script>\n'
        f"<script>\n{app}\n</script>"
    )
    html = html.replace(
        f'<script src="{JSPDF_CDN}"></script>\n<script src="app.js"></script>',
        payload,
    )

    if 'src="app.js"' in html or 'href="styles.css"' in html:
        print("error: an external reference survived inlining — rebuild aborted.", file=sys.stderr)
        return 1

    OUTPUT.write_text(html, encoding="utf-8")
    size = OUTPUT.stat().st_size
    print(f"Wrote {OUTPUT.name}  ({size / 1024:.0f} KB)")
    print(f"  system prompt : {len(SYSTEM_PROMPT):,} chars")
    print(f"  report schema : {len(REPORT_SCHEMA['properties']):,} top-level properties")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
