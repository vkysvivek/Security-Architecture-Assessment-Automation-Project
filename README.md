# Security Architecture Review Agent

A web app that performs **Step 1 of a Security Architecture Review** — *review of
submitted materials* — built to the **SAR Agentic AI MVP**: eight reusable agents
running a chain of thirty use cases (UC-01 … UC-30), each producing a named
artifact that the next use case consumes.

It reads the architecture package you submit, reconstructs what the solution
appears to be, and does three jobs with it:

1. **Assesses the architecture** across eight control domains against good
   security architecture practice, and raises a **candidate finding** for every
   weakness the material actually evidences — an unencrypted internal hop, a data
   store reachable from an untrusted network, a third-party dependency with no
   stated review, production and non-production sharing an identity store.
2. **Records what the package is missing or leaves unclear**, so that each of the
   six requested inputs is accounted for.
3. **Hands the review back to a human** at a defined boundary, with the decisions
   the Security Architect must take set out explicitly.

### Candidate, not final

Everything the agent produces is a **candidate**. It proposes a priority; it does
not set severity. It offers treatment options; it does not choose one. Evidence
validation, security judgement, finding approval, severity and risk
determination, risk acceptance and final disposition **all remain the Security
Architect's**. This is structural, not just wording — the schema has
`candidate_findings` with a `proposed_priority`, a list of `treatment_options`
with no preferred one, and a `human_review_gate` section. There is nowhere in the
output to record an approved finding or an accepted risk.

### The ceiling

Findings sit at the level of *"this flow is unencrypted"*, never *"TLS 1.0 is
enabled on the listener"*. The test the agent applies is: **would this still be
true, and still matter, if the team rebuilt the system tomorrow with the same
design but every setting freshly chosen?** If it would evaporate with a
configuration change, it is out of scope. So are threat models,
control-effectiveness ratings, CVEs, CWEs and OWASP categories — those belong to
later steps of the review.

## Run it

```bash
export ANTHROPIC_API_KEY=sk-ant-...
./run.sh
```

Then open **http://127.0.0.1:8420**.

`run.sh` creates `.venv` and installs the `anthropic` SDK on first run. If you'd
rather not set the environment variable, start the server without it and paste a
key into **Settings** in the UI — it's held in `sessionStorage` and sent only to
your local server, never to a third party.

## The single-file build

For sharing — email, USB stick, a machine with no Python — build the whole agent
into one portable HTML file:

```bash
./.venv/bin/python build_standalone.py     # -> secarch-agent.html (~296 KB)
```

Open that file by double-clicking it. No server, no install. It asks for an API
key in **Settings** and calls the Anthropic API straight from the browser using
the `anthropic-dangerous-direct-browser-access` header. The API allows this from
a `file://` origin.

The tradeoff is where the key lives. In the served build the key stays in the
Python process; in the single-file build it sits in the browser's
`sessionStorage` and travels from the recipient's machine to Anthropic. Each
person opening the file uses **their own** key — never ship the file with a key
baked in, and don't host it on a public URL.

Both builds send a byte-identical request: `build_user_content()` in `server.py`
and `buildUserContent()` in `public/app.js` are deliberate mirrors of each other.
Change one and change the other.

`secarch-agent.html` is generated, not hand-edited. Edit `public/`,
`sar_prompt.py` or `sar_schema.py` and re-run the build.

## Demoing it without an API key

**View sample report** on the setup screen renders a built-in example review —
ten candidate findings across all three types, all eight domain assessments, the
evidence source register, the intake determination, the human review gate, the
full thirty-row use-case coverage record, both PDFs and all. It makes no API call
and costs nothing, so it's the way to show the tool, check the file works on a
new machine, or hand it to someone who hasn't got a key yet.

The sample's fictional package deliberately contains real, evidenced weaknesses —
a load balancer hop drawn as plain HTTP, card details routed through the
application, invoices served straight out of object storage — so the demo shows
the agent finding problems rather than only listing absences. It also
deliberately submits the **hosting model as a SharePoint link rather than a
file**, so the demo shows exactly what that costs the review.

The report and its PDF are both stamped as sample data so nobody mistakes it for
a real review.

## The six minimum requested inputs

The setup screen has one zone per input, and each zone takes **either an uploaded
file or a document link**:

1. Architecture diagram
2. Data flow diagram (or transaction flow / equivalent)
3. Hosting or deployment model
4. Integrations and third-party dependencies
5. Environment scope
6. Identity and access approach

**None of them is mandatory.** You can run a review with one file, or with none
at all. Anything you don't supply is not silently ignored — the request states
explicitly, per input, that nothing was submitted, and the report records it as
*Not provided* with a corresponding candidate finding explaining what that costs
the review. A run with zero inputs produces a valid report saying no architecture
understanding could be constructed.

What you *do* upload gets assessed, not just inventoried. A single well-labelled
data flow diagram is enough to produce weakness findings on its own.

Accepted formats: PNG, JPEG, WebP, GIF, PDF, and text formats (Markdown, JSON,
YAML, XML, `.drawio`, PlantUML, Mermaid, Terraform). Word/Excel/PowerPoint aren't
readable — export to PDF.

### Links are recorded, never opened

A SharePoint or document URL pasted into a zone is **logged verbatim and never
fetched**. The agent runs in your browser with no server-side fetcher and no
SharePoint session, so it has no way to retrieve the contents — and giving it one
would mean building a URL fetcher that follows arbitrary links, which is not
something this tool is going to do.

The consequence is deliberate and consistent:

| | Uploaded file | Link only | Nothing |
| --- | --- | --- | --- |
| Recorded in the Evidence Source Register | yes | yes, verbatim | yes, as absent |
| Contents read | yes | **no** | no |
| Counts toward completeness | yes | **no** | no |
| Assessed as | Provided | **Not provided** | Not provided |

A link-only input is written up as *"referenced but contents unavailable to this
review"* — it names the retrieval limit, not the team. Upload the file itself if
you want it assessed. Links remain worth pasting: they tell the reviewer where
the document lives.

## Using it

1. **Upload or link whatever you have** into the six zones.
2. **Fill in the intake record** (all optional) — application name, change type,
   delivery model, whether it's **internet facing**, purpose, hosting,
   environments, integrations, identity approach, users, data sensitivity,
   criticality, regulatory context, notes. Blank fields are reported as *not
   stated* rather than guessed at.
3. **Run the review.** Progress streams live, labelled by the agent currently
   running, including the model's reasoning.
4. **Read and export.** The screen shows the findings pack — filter candidate
   findings by proposed priority. The working record behind them is a download:
   the review pack PDF, or the raw JSON.

## Two documents, not one

The review splits in two, because the delivery team and the Security Architect
need different things. **The screen is the findings pack**; the review pack is
download-only and never rendered on screen.

**Findings PDF** — `…-findings.pdf`. What goes to the team, and what the screen
shows. Three sections and nothing else:

- the **candidate findings**, SAR-01 … SAR-*n*, in full
- the **open questions those findings depend on**
- the **next steps** that follow from them

**Review pack PDF** — `…-review-pack.pdf`. The working record behind it:
findings index, evidence sufficiency, executive and technical summaries, control
assessment by domain, candidate gaps, the six requested inputs, evidence source
register, intake determination, solution profile, the architecture as understood
from the submission, what it was assessed against, conflicts between sources, the
full question set, the human review gate, assumptions and the full next-step
list, and use-case coverage.

The split is **traced, not guessed at**. A question reaches the findings pack
only if its `related_artifact` names a finding — or names a gap whose
`becomes_finding` does. A next step reaches it only if its `depends_on` names one
of those findings or one of those questions. Anything that doesn't trace stays in
the review pack, and the findings pack says how many items that was, so nothing
disappears silently. In the sample: all 9 questions carry over, and 8 of the 10
next steps — the 2 that serve evidence conflicts rather than findings stay
behind.

Both documents draw through the same page engine, so they cannot drift apart in
look.

## The eight agents

| | Agent | Role |
| --- | --- | --- |
| ORCH | Orchestrator | Sequences the chain and enforces the hand-off rule |
| INTK | Intake | Applicability, review depth, solution classification |
| EXTR | Extraction | Builds the evidence base and the normalized fact base |
| VALD | Validation | Sufficiency, gaps, conflicts, clarification requests |
| CTRL | Control assessment | The eight domain assessments |
| KNOW | Knowledge | Requirements basis and reference patterns |
| GAPF | Gap formulation | Candidate gaps, then candidate findings |
| RPTS | Reporting | Technical summary, executive summary, next steps |

The MVP's **hand-off rule** — no use case may depend on an unnamed output — is
enforced in the schema: every candidate finding traces back to a `source_gap` and
carries a `linkage` block naming its evidence basis, its requirement basis and
its confidence.

## The eight control domains

Identity and access management · data protection and encryption · network and
trust boundary · logging, monitoring and detection · resilience, recovery and
availability · cloud, SaaS and platform · secrets, keys and credential management
· secure development and vulnerability management.

Each domain gets its own assessment carrying what is **sound by design**, the
**concerns**, the **evidence considered**, and a status — including *Not
assessable from the submitted evidence*, which is what stops a thin package
reading as a clean bill of health. Proposed priority is weighted by context, so
the same weakness ranks higher on an internet-facing, regulated,
business-critical solution — which is why the intake record's **Internet facing**
field matters.

## What the screen shows

- **Header** — completeness score, evidence sufficiency, and counts of proposed
  High / Medium / Low, stamped *candidate output, pending Security Architect
  review*, plus what must be resolved before the review proceeds and concerns
  about the quality of the evidence itself
- **Candidate findings**, each tagged with one of three types:
  - **Architecture weakness** — the design departs from good practice, and the
    material shows it
  - **Missing or incomplete input** — one of the six wasn't supplied, or arrived
    too thin to work with (including link-only inputs)
  - **Unverifiable from the material** — a security-relevant property the package
    left undecidable. Recorded as open, never assumed sound.

  Each carries a proposed priority, the domain, the evidence, why it matters, a
  set of **treatment options** with none preferred, and the linkage block.
- **Open questions these findings depend on** — only the questions that trace to
  a finding
- **Next steps** — only the steps that serve a finding or one of those questions
- **The rest of the review** — a card listing what the review pack holds, with
  the two download buttons. Anything that didn't trace is counted here, so
  nothing disappears silently.

## What the review pack holds

Download-only. Never rendered on screen.

- **Executive summary** — headline, narrative, key points, the decision required
  and a recommended disposition
- **Technical summary** — the narrative assessment plus sound-by-design, areas of
  concern, and what could not be assessed
- **Control assessment by domain** — the eight domain assessments
- **Candidate gaps** — the expected-versus-observed register the findings derive
  from
- **The six minimum requested inputs** — Provided / Partially provided / Not
  provided, what arrived, what's missing, the effect on the review
- **Evidence source register** — every file and every link, with its retrieval
  status
- **Intake determination** — does a review apply, how deep, what kind of
  solution, and the evidence that solution type calls for
- **Solution profile** and **the architecture as understood** — components, data
  flows, trust boundaries, identity by actor class, integrations, the controls
  the material claims, and the normalized fact base
- **What this was assessed against** — requirements taken to apply and reference
  patterns considered
- **Conflicts between sources** and the **full clarification-request set**
- **Human review gate** — the decisions the architect must take, the evidence
  worth validating first, and what this review did not do
- **Assumptions, the full next-step list and the reviewer note**
- **Use-case coverage** — all thirty use cases with executed / partially executed
  / not executed and the reason

## How it works

```
public/index.html + app.js   UI, SSE client, jsPDF report generation
server.py                    stdlib HTTP server, /api/analyze SSE endpoint
sar_prompt.py                the static, cached review methodology
sar_schema.py                JSON Schema constraining the model's output
build_standalone.py          inlines public/ + prompt + schema into one HTML file
```

Analysis runs on `claude-opus-4-6` with adaptive thinking and structured outputs.
`sar_prompt.py` is sent as a cached system block, so every review after the first
reads the ~11k-token methodology from cache at a fraction of the input cost —
check the badge on the report header for cached-token counts.

The scope is enforced structurally as well as in the prompt. `sar_schema.py`
makes weakness findings first-class and every finding traceable, while leaving
nowhere to put a CVE, a CWE, an OWASP category, a STRIDE row, a
control-effectiveness rating, an approved finding or an accepted risk. A report
that overshoots the step can't be produced, and one that under-shoots it into
pure box-ticking has eight `domain_assessments` and a `technical_summary` it must
fill in.

Switch to `claude-sonnet-4-6` or lower the effort level in **Settings** for
faster, cheaper passes.

## Cost

A run is materially more expensive than a simple prompt. The ~11k-token system
prompt caches; the ~11.5k-token JSON schema travels in `output_config` and so
sits outside the tools → system → messages cache chain, meaning it is billed as
uncached input on **every** run. Output is the larger cost: a full report against
this schema is long. Budget for well above a single-digit-cent call, and use
**Settings** to drop the effort level or switch to Sonnet when a lighter pass
will do.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | API key. Falls back to the key entered in the UI. |
| `SECARCH_HOST` | `127.0.0.1` | Bind address. |
| `SECARCH_PORT` | `8420` | Port. |

## Limits and caveats

- This is an **AI-assisted first pass over a document package**, and its output
  is **candidate material for a Security Architect**, not a completed review. It
  reasons about what your diagrams and documents show — it does not read your
  code, scan your dependencies, or test a running system.
- **Links are not retrieved.** See the table above. A package submitted entirely
  as links produces a report that correctly says almost nothing could be
  assessed.
- The quality of the output tracks the quality of the inputs. A diagram with
  unlabelled arrows produces a report full of assumptions — which the agent
  states out loud in the "Assumptions" and "Candidate gaps" sections.
- **The absence of a finding is not a clean bill of health.** The agent only
  raises what the material evidences. An unlabelled arrow is recorded as
  *unverifiable*, never as sound — read the "Could not be assessed" column and
  the *Not assessable* domain statuses before taking silence for approval.
- Uploads are capped at 24 MB per file and 40 MB per review.
- The server binds to localhost and has no authentication. Don't expose it on a
  network you don't control.
