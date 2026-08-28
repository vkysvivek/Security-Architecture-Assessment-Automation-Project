/* SAR Agentic AI — browser client.
   Step 1: review of submitted materials, run as the eight-agent use-case chain
   of SAR_Agentic_MVP_v0.3. Section names and artifact identifiers below track
   the export register in sar_schema.py. */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const PRIORITIES = ["High", "Medium", "Low"];

  // The six minimum requested inputs, in the order they appear on screen.
  // The key is the dropzone's data-category; the label must match the
  // input_name enum in sar_schema.py exactly, or the completeness table
  // cannot be reconciled with the upload zones.
  const INPUT_ZONES = [
    ["architecture", "Architecture diagram"],
    ["dfd", "Data flow diagram"],
    ["hosting", "Hosting or deployment model"],
    ["integrations", "Integrations and third-party dependencies"],
    ["environments", "Environment scope"],
    ["identity", "Identity and access approach"],
  ];

  // Standalone build: the single-file HTML has no server behind it, so the
  // browser calls the Anthropic API itself. The build script defines
  // SECARCH_STANDALONE and inlines the prompt and schema alongside it.
  const STANDALONE = typeof window.SECARCH_STANDALONE !== "undefined";

  // The eight reusable agent capabilities of SAR_Agentic_MVP_v0.3 §3. Used to
  // name the producing agent on each use-case row in the review-pack PDF.
  const AGENTS = {
    ORCH: "Orchestrator",
    INTK: "Intake / Classification",
    EXTR: "Evidence Extraction",
    VALD: "Evidence Validation",
    CTRL: "Control Assessment",
    KNOW: "Knowledge Retrieval",
    GAPF: "Gap / Finding",
    RPTS: "Reporting / Synthesis",
  };

  // §7 use case -> agent -> export artifact. Static reference data straight
  // from the document: the model supplies only status and a note per row, so
  // there is nothing here for it to get wrong or to spend tokens restating.
  const USE_CASES = [
    ["UC-01", "Determine whether SAR is required", "INTK", "UC-01-OUT-01"],
    ["UC-02", "Determine SAR review path / depth", "INTK", "UC-02-OUT-01"],
    ["UC-03", "Classify solution / technology type", "INTK", "UC-03-OUT-01"],
    ["UC-04", "Identify required SAR evidence and artifacts", "INTK", "UC-04-OUT-01"],
    ["UC-05", "Ingest submitted SAR documentation", "EXTR", "UC-05-OUT-01/02"],
    ["UC-06", "Extract architecture components and technologies", "EXTR", "UC-06-OUT-01"],
    ["UC-07", "Extract data flows, interfaces, trust relationships", "EXTR", "UC-07-OUT-01"],
    ["UC-08", "Extract stated security controls and safeguards", "EXTR", "UC-08-OUT-01"],
    ["UC-09", "Normalize evidence into assessment-ready facts", "EXTR", "UC-09-OUT-01"],
    ["UC-10", "Identify missing required evidence", "VALD", "UC-10-OUT-01"],
    ["UC-11", "Detect conflicting / contradictory evidence", "VALD", "UC-11-OUT-01"],
    ["UC-12", "Evaluate evidence sufficiency / quality", "VALD", "UC-12-OUT-01"],
    ["UC-13", "Generate targeted evidence follow-up questions", "VALD", "UC-13-OUT-01"],
    ["UC-14", "Assess identity and access management controls", "CTRL", "UC-14-OUT-01"],
    ["UC-15", "Assess data protection and encryption controls", "CTRL", "UC-15-OUT-01"],
    ["UC-16", "Assess network and trust-boundary controls", "CTRL", "UC-16-OUT-01"],
    ["UC-17", "Assess logging, monitoring, detection controls", "CTRL", "UC-17-OUT-01"],
    ["UC-18", "Assess resilience, recovery, availability controls", "CTRL", "UC-18-OUT-01"],
    ["UC-19", "Assess cloud / SaaS / platform control posture", "CTRL", "UC-19-OUT-01"],
    ["UC-20", "Assess secrets, keys, credential-management controls", "CTRL", "UC-20-OUT-01"],
    ["UC-21", "Assess secure development / vuln-management controls", "CTRL", "UC-21-OUT-01"],
    ["UC-22", "Retrieve applicable internal policy / standards requirements", "KNOW", "UC-22-OUT-01"],
    ["UC-23", "Retrieve approved reference architecture / guidance", "KNOW", "UC-23-OUT-01"],
    ["UC-24", "Identify candidate control or architecture gaps", "GAPF", "UC-24-OUT-01"],
    ["UC-25", "Generate candidate SAR finding", "GAPF", "UC-25-OUT-01"],
    ["UC-26", "Generate candidate remediation / treatment options", "GAPF", "UC-26-OUT-01"],
    ["UC-27", "Validate finding-to-evidence and requirement linkage", "VALD", "UC-27-OUT-01"],
    ["UC-28", "Generate SAR technical assessment summary", "RPTS", "UC-28-OUT-01"],
    ["UC-29", "Generate draft findings / remediation package", "RPTS", "UC-29-OUT-01"],
    ["UC-30", "Generate executive / approval-ready SAR summary", "RPTS", "UC-30-OUT-01"],
  ];

  // The eight control-assessment domains of UC-14..21, in schema enum order.
  const CONTROL_DOMAINS = [
    "Identity and access management",
    "Data protection and encryption",
    "Network and trust boundary",
    "Logging, monitoring and detection",
    "Resilience, recovery and availability",
    "Cloud, SaaS and platform",
    "Secrets, keys and credential management",
    "Secure development and vulnerability management",
  ];

  const state = {
    files: [],          // { id, name, size, type, category, data(base64) }
    links: {},          // category -> URL string, recorded but never fetched
    report: null,
    meta: null,
    controller: null,
    priorityFilter: new Set(),
  };

  // ======================================================================
  // Settings
  // ======================================================================

  const settings = {
    get apiKey() { return sessionStorage.getItem("secarch.key") || ""; },
    set apiKey(v) { v ? sessionStorage.setItem("secarch.key", v) : sessionStorage.removeItem("secarch.key"); },
    get model() { return localStorage.getItem("secarch.model") || "claude-opus-4-6"; },
    set model(v) { localStorage.setItem("secarch.model", v); },
    get effort() { return localStorage.getItem("secarch.effort") || "high"; },
    set effort(v) { localStorage.setItem("secarch.effort", v); },
  };

  let envKeyPresent = false;

  async function checkKey() {
    if (STANDALONE) {
      // No server, so no environment key — the key must come from Settings.
      envKeyPresent = false;
      paintKeyBadge();
      return;
    }
    try {
      const res = await fetch("/health");
      const body = await res.json();
      envKeyPresent = !!body.key_configured;
    } catch { envKeyPresent = false; }
    paintKeyBadge();
  }

  function paintKeyBadge() {
    const badge = $("keyBadge");
    if (envKeyPresent) {
      badge.textContent = "API key: environment";
      badge.className = "badge badge-ok";
    } else if (settings.apiKey) {
      badge.textContent = "API key: this session";
      badge.className = "badge badge-ok";
    } else {
      badge.textContent = "No API key — open Settings";
      badge.className = "badge badge-warn";
    }
    refreshRunbar();
  }

  $("settingsBtn").addEventListener("click", () => {
    $("apiKeyInput").value = settings.apiKey;
    $("modelSelect").value = settings.model;
    $("effortSelect").value = settings.effort;
    $("settingsDialog").showModal();
  });

  $("settingsDialog").addEventListener("close", () => {
    settings.apiKey = $("apiKeyInput").value.trim();
    settings.model = $("modelSelect").value;
    settings.effort = $("effortSelect").value;
    paintKeyBadge();
  });

  // ======================================================================
  // File intake
  // ======================================================================

  const MAX_TOTAL = 40 * 1024 * 1024;
  const BLOCKED = /\.(docx?|xlsx?|pptx?|pages|key|zip|tar|gz)$/i;

  document.querySelectorAll(".dropzone").forEach((zone) => {
    const input = zone.querySelector("input[type=file]");
    const linkInput = zone.querySelector(".dz-link-input");
    const category = zone.dataset.category;

    // The whole tile opens the file picker, so the link field has to opt out —
    // otherwise clicking into it to type would fire the picker underneath.
    zone.addEventListener("click", (e) => {
      if (e.target.closest(".dz-link") || e.target.tagName === "BUTTON") return;
      input.click();
    });
    input.addEventListener("change", () => { addFiles([...input.files], category); input.value = ""; });

    linkInput.addEventListener("input", () => {
      const url = linkInput.value.trim();
      if (url) state.links[category] = url;
      else delete state.links[category];
      zone.classList.toggle("linked", !!url);
      refreshRunbar();
    });

    ["dragenter", "dragover"].forEach((ev) =>
      zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("dragover"); }));
    ["dragleave", "drop"].forEach((ev) =>
      zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("dragover"); }));
    zone.addEventListener("drop", (e) => addFiles([...e.dataTransfer.files], category));
  });

  async function addFiles(files, category) {
    const problems = [];
    for (const file of files) {
      if (BLOCKED.test(file.name)) {
        problems.push(`${file.name} — Office/archive files can't be read. Export as PDF first.`);
        continue;
      }
      if (file.size > 24 * 1024 * 1024) {
        problems.push(`${file.name} — larger than 24 MB.`);
        continue;
      }
      try {
        const data = await toBase64(file);
        state.files.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          type: file.type,
          category,
          data,
        });
      } catch {
        problems.push(`${file.name} — could not be read.`);
      }
    }
    showUploadError(problems.join("\n"));
    renderFileLists();
  }

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.readAsDataURL(file);
    });
  }

  function showUploadError(message) {
    const el = $("uploadError");
    el.textContent = message;
    el.hidden = !message;
  }

  function renderFileLists() {
    document.querySelectorAll(".dropzone").forEach((zone) => {
      const list = zone.querySelector(".dz-files");
      const mine = state.files.filter((f) => f.category === zone.dataset.category);
      zone.classList.toggle("filled", mine.length > 0);
      list.innerHTML = "";
      for (const f of mine) {
        const li = document.createElement("li");
        li.innerHTML = `<span class="fname"></span><span class="fsize">${fmtSize(f.size)}</span>
                        <button class="fdel" type="button" title="Remove">×</button>`;
        li.querySelector(".fname").textContent = f.name;
        li.querySelector(".fdel").addEventListener("click", (e) => {
          e.stopPropagation();
          state.files = state.files.filter((x) => x.id !== f.id);
          renderFileLists();
        });
        list.appendChild(li);
      }
    });
    refreshRunbar();
  }

  function refreshRunbar() {
    const n = state.files.length;
    const bytes = state.files.reduce((s, f) => s + f.size, 0);
    const hasKey = envKeyPresent || !!settings.apiKey;
    const tooBig = bytes > MAX_TOTAL;
    const zonesFilled = INPUT_ZONES.filter(([cat]) => state.files.some((f) => f.category === cat)).length;
    // A zone holding only a link is not counted as supplied. The agent cannot
    // open it, so counting it would overstate what the review has to work with.
    const linkOnly = INPUT_ZONES.filter(
      ([cat]) => state.links[cat] && !state.files.some((f) => f.category === cat)
    ).length;

    // No input is mandatory: an empty zone is reported as a missing input
    // rather than blocking the run. The counter says how many of the six
    // arrived so the reader knows what the report will be working from.
    const linkNote = linkOnly ? ` · ${linkOnly} link-only (recorded, not read)` : "";
    $("fileCount").textContent = n === 0
      ? (linkOnly
          ? `No readable inputs — ${linkOnly} link${linkOnly > 1 ? "s" : ""} recorded, all six will report as not provided`
          : "No inputs submitted — the review will report all six as not provided")
      : `${n} file${n > 1 ? "s" : ""} · ${fmtSize(bytes)} · ${zonesFilled} of 6 requested inputs supplied` +
        linkNote + (tooBig ? " — over the 40 MB limit" : "");

    const btn = $("analyzeBtn");
    btn.disabled = !hasKey || tooBig;
    btn.textContent = !hasKey ? "Add an API key in Settings" : "Run architecture review";
  }

  const fmtSize = (b) =>
    b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  // ======================================================================
  // Run the review
  // ======================================================================

  $("analyzeBtn").addEventListener("click", analyze);
  $("cancelBtn").addEventListener("click", () => {
    state.controller?.abort();
    showView("setupView");
  });
  $("backBtn").addEventListener("click", () => showView("setupView"));

  function showView(id) {
    ["setupView", "progressView", "reportView"].forEach((v) => { $(v).hidden = v !== id; });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function setPhase(phase, message) {
    const order = ["preparing", "analyzing", "writing", "assembling"];
    const idx = order.indexOf(phase);
    document.querySelectorAll(".phases li").forEach((li) => {
      const i = order.indexOf(li.dataset.phase);
      li.classList.toggle("active", i === idx);
      li.classList.toggle("done", idx > -1 && i < idx);
    });
    if (message) $("progressMessage").textContent = message;
  }

  function collectContext() {
    return {
      name: $("ctxName").value,
      change_type: $("ctxChangeType").value,
      delivery_model: $("ctxDeliveryModel").value,
      internet_facing: $("ctxInternetFacing").value,
      purpose: $("ctxPurpose").value,
      hosting: $("ctxHosting").value,
      environments: $("ctxEnvironments").value,
      integrations: $("ctxIntegrations").value,
      identity: $("ctxIdentity").value,
      users: $("ctxUsers").value,
      data_sensitivity: $("ctxDataSensitivity").value,
      criticality: $("ctxCriticality").value,
      regulatory: $("ctxRegulatory").value,
      notes: $("ctxNotes").value,
    };
  }

  async function analyze() {
    showUploadError("");
    showView("progressView");
    document.querySelector(".spinner").style.display = "";
    $("progressTitle").textContent = "Reviewing the submitted materials";
    $("cancelBtn").textContent = "Cancel";
    $("thinkingText").textContent = "";
    $("thinkingCount").textContent = "";
    setPhase("preparing", "Uploading the material…");

    const payload = {
      api_key: settings.apiKey || undefined,
      model: settings.model,
      effort: settings.effort,
      context: collectContext(),
      links: { ...state.links },
      files: state.files.map(({ name, type, category, data }) => ({ name, type, category, data })),
    };

    state.controller = new AbortController();

    if (STANDALONE) {
      try {
        await analyzeDirect(payload);
      } catch (err) {
        if (err.name === "AbortError") return;
        failWith(err.message || String(err));
      }
      return;
    }

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: state.controller.signal,
      });

      if (!res.ok && res.headers.get("Content-Type")?.includes("json")) {
        const body = await res.json();
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      if (!res.body) throw new Error("The server sent no response stream.");

      await readEvents(res.body, handleEvent);
    } catch (err) {
      if (err.name === "AbortError") return;
      failWith(err.message || String(err));
    }
  }

  function handleEvent(event, data) {
    if (event === "status") {
      setPhase(data.phase, data.message);
    } else if (event === "thinking") {
      const pre = $("thinkingText");
      pre.textContent += data.text;
      if (pre.textContent.length > 40000) pre.textContent = pre.textContent.slice(-40000);
      pre.scrollTop = pre.scrollHeight;
      $("thinkingCount").textContent = `(${data.total.toLocaleString()} chars)`;
    } else if (event === "complete") {
      state.report = data.report;
      state.meta = data.meta;
      state.priorityFilter = new Set();
      renderReport();
      showView("reportView");
    } else if (event === "failed") {
      failWith(data.error);
    }
  }

  function failWith(message) {
    showView("progressView");
    document.querySelector(".spinner").style.display = "none";
    $("progressTitle").textContent = "Review failed";
    $("progressMessage").textContent = message;
    $("cancelBtn").textContent = "Back";
  }

  async function readEvents(stream, onEvent) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let split;
      while ((split = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);

        let name = "message";
        const dataLines = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) name = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) continue;
        try { onEvent(name, JSON.parse(dataLines.join("\n"))); }
        catch { /* ignore malformed frame */ }
      }
    }
  }

  // ======================================================================
  // Standalone mode — the browser calls the Anthropic API directly
  //
  // Mirrors server.py's build_user_content / run_analysis / _stream so the
  // single-file build produces byte-identical requests to the served build.
  // ======================================================================

  const API_URL = "https://api.anthropic.com/v1/messages";
  const MAX_TOKENS = 64000;
  const IMAGE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
  const TEXT_EXTENSIONS = new Set([
    ".txt", ".md", ".markdown", ".json", ".yaml", ".yml", ".csv", ".tsv",
    ".xml", ".drawio", ".puml", ".plantuml", ".mmd", ".mermaid", ".dot",
    ".tf", ".hcl", ".sql", ".log", ".env", ".ini", ".toml", ".conf",
  ]);
  const UNPARSEABLE_EXTENSIONS = new Set([".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".pages", ".key"]);
  const CATEGORY_LABELS = {
    architecture: "REQUESTED INPUT 1 — ARCHITECTURE DIAGRAM",
    dfd: "REQUESTED INPUT 2 — DATA FLOW DIAGRAM",
    hosting: "REQUESTED INPUT 3 — HOSTING OR DEPLOYMENT MODEL",
    integrations: "REQUESTED INPUT 4 — INTEGRATIONS AND THIRD-PARTY DEPENDENCIES",
    environments: "REQUESTED INPUT 5 — ENVIRONMENT SCOPE",
    identity: "REQUESTED INPUT 6 — IDENTITY AND ACCESS APPROACH",
  };

  const suffixOf = (name) => {
    const dot = String(name || "").lastIndexOf(".");
    return dot === -1 ? "" : name.slice(dot).toLowerCase();
  };

  function buildFileBlock(upload) {
    const name = (upload.name || "unnamed").trim();
    const data = upload.data || "";
    const suffix = suffixOf(name);
    const mediaType = (upload.type || "").trim() || "application/octet-stream";

    if (UNPARSEABLE_EXTENSIONS.has(suffix)) {
      throw new Error(`'${name}' is an Office document, which cannot be read directly. Export it as PDF and upload that instead.`);
    }

    let raw;
    try { raw = Uint8Array.from(atob(data), (c) => c.charCodeAt(0)); }
    catch { throw new Error(`'${name}' could not be decoded — try re-uploading it.`); }
    if (!raw.length) throw new Error(`'${name}' is empty.`);

    if (IMAGE_MEDIA_TYPES.has(mediaType)) {
      return [{ type: "image", source: { type: "base64", media_type: mediaType, data } },
              `image (${mediaType})`];
    }
    if (mediaType === "application/pdf" || suffix === ".pdf") {
      return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: name },
              "PDF document"];
    }
    if (mediaType.startsWith("text/") || TEXT_EXTENSIONS.has(suffix)) {
      const text = new TextDecoder("utf-8").decode(raw);
      return [{ type: "text", text: `--- FILE: ${name} ---\n${text}\n--- END FILE: ${name} ---` },
              "text file"];
    }
    throw new Error(`'${name}' has an unsupported type (${mediaType}). Supported: PNG, JPEG, GIF, WebP, PDF, and plain-text formats.`);
  }

  function buildUserContent(payload) {
    const files = payload.files || [];
    const c = payload.context || {};
    const links = payload.links || {};

    const lines = ["## SRC-01 / SRC-02 — SAR INTAKE RECORD AND SOLUTION METADATA", ""];
    const INTAKE_FIELDS = [
      ["Application / solution name", c.name],
      ["What triggered this review", c.change_type],
      ["Delivery model", c.delivery_model],
      ["Internet facing", c.internet_facing],
      ["What the solution does", c.purpose],
      ["Hosting / deployment model", c.hosting],
      ["Environment scope for this review", c.environments],
      ["Integrations and third-party dependencies", c.integrations],
      ["Identity and access approach", c.identity],
      ["Actors and user population", c.users],
      ["Data sensitivity", c.data_sensitivity],
      ["Business criticality", c.criticality],
      ["Regulatory / policy context", c.regulatory],
    ];

    const fields = INTAKE_FIELDS.concat([["Other notes from the team", c.notes]])
      .filter(([, v]) => v && String(v).trim());

    if (fields.length) {
      for (const [label, value] of fields) lines.push(`- **${label}:** ${String(value).trim()}`);
    }

    const omitted = INTAKE_FIELDS
      .filter(([, v]) => !(v && String(v).trim())).map(([label]) => label);

    if (omitted.length) {
      lines.push("", `The team left these intake fields blank: ${omitted.join("; ")}. ` +
        "Treat each as not stated. Do not invent a value, and reflect the absence in your findings where it matters.");
    }

    // UC-05-OUT-02, assembled on the client so the source register is a record
    // of fact rather than something the model has to reconstruct. The link/file
    // distinction is load-bearing: a link is a location, not evidence.
    lines.push("", "## SRC-03 — EVIDENCE SOURCE REGISTER FOR THE SIX MINIMUM REQUESTED INPUTS", "");
    let linkCount = 0;
    for (const [category, label] of INPUT_ZONES) {
      const mine = files.filter((f) => f.category === category);
      const link = String(links[category] || "").trim();
      if (mine.length) {
        const names = mine.map((f) => (f.name || "unnamed").trim()).join(", ");
        lines.push(`- **${label}:** ATTACHED — ${mine.length} file(s): ${names}` +
          (link ? ` (also referenced at ${link})` : ""));
      } else if (link) {
        linkCount += 1;
        lines.push(`- **${label}:** REFERENCED LINK ONLY, CONTENTS NOT RETRIEVED — ${link}`);
      } else {
        lines.push(`- **${label}:** NOT SUBMITTED — nothing was provided for this requested input.`);
      }
    }

    if (linkCount) {
      lines.push("", "One or more inputs were given as a link rather than a file. You cannot open links: " +
        "the location is known, the contents are not. Record each in the source register verbatim with " +
        "source_type 'Referenced link — not retrieved', and assess the input as Not provided — no completeness " +
        "credit, and a corresponding finding. State in that finding that the artifact was referenced but its " +
        "contents were unavailable to this review, not that the team failed to produce it.");
    }

    if (files.length) {
      lines.push("", "## ATTACHED MATERIAL", "",
        "The files below are attached in order, each labelled with the requested input it was submitted against. " +
        "Read every one before you begin. A file submitted under one input may of course inform another; " +
        "judge each input on the substance available to you, not on the label alone.", "");
    } else {
      lines.push("", "## ATTACHED MATERIAL", "",
        "No files were attached. Every one of the six minimum requested inputs is therefore not provided. " +
        "Produce the report from the intake record alone, record each input as Not provided, and say plainly " +
        "that no architecture understanding could be constructed.", "");
    }

    const content = [{ type: "text", text: lines.join("\n") }];
    files.forEach((upload, i) => {
      const [block, description] = buildFileBlock(upload);
      const label = CATEGORY_LABELS[upload.category] || "SUPPORTING DOCUMENT";
      const name = (upload.name || "unnamed").trim();
      content.push({ type: "text", text: `### Attachment ${i + 1} — ${label}: ${name} (${description})` });
      content.push(block);
    });

    content.push({ type: "text", text:
      "Now run the SAR Step 1 agent chain over this material, in the order your instructions set out: " +
      "INTK for applicability, review path, classification and the evidence checklist; EXTR for the source " +
      "register, component inventory, flow register, stated control register and normalized fact set; " +
      "VALD for gaps, conflicts, sufficiency and clarification requests; KNOW for the requirement and " +
      "guidance basis; CTRL for all eight domain assessment records; GAPF for candidate gaps, candidate " +
      "findings and treatment options; VALD again for finding linkage; RPTS for the technical summary, " +
      "the ordered next steps and the executive summary. Close with the human review gate and the " +
      "thirty-row use-case coverage record. Every finding must trace back to a normalized fact and a " +
      "candidate gap. Stay inside scope — architecture-level findings only, no configuration findings, " +
      "no threat modelling, no control-effectiveness ratings and no CVE, CWE or OWASP references. " +
      "Everything you produce is candidate output for a human Security Architect. " +
      "Return only the JSON report." });
    return content;
  }

  async function analyzeDirect(payload) {
    const key = (settings.apiKey || "").trim();
    if (!key) throw new Error("No API key. Open Settings and paste your Anthropic API key.");

    handleEvent("status", { phase: "preparing", message: "Reading the submitted material…" });
    const userContent = buildUserContent(payload);

    const body = {
      model: payload.model,
      max_tokens: MAX_TOKENS,
      // One cached system block. SECARCH_SYSTEM_PROMPT is static, so every
      // request after the first reads it at ~10% of input cost.
      system: [{ type: "text", text: window.SECARCH_SYSTEM_PROMPT,
                 cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userContent }],
      thinking: { type: "adaptive" },
      output_config: {
        effort: payload.effort,
        format: { type: "json_schema", schema: window.SECARCH_REPORT_SCHEMA },
      },
      stream: true,
    };

    handleEvent("status", { phase: "analyzing",
      message: `${payload.model} is reviewing ${payload.files.length} attachment(s)…` });

    let result;
    try {
      result = await streamFromApi(body, key);
    } catch (err) {
      // If this build of the API rejects the structured-output constraint,
      // retry unconstrained — the system prompt already demands raw JSON.
      if (!isOutputConfigRejection(err)) throw err;
      body.output_config = { effort: payload.effort };
      handleEvent("status", { phase: "analyzing", message: "Retrying without schema enforcement…" });
      result = await streamFromApi(body, key);
    }

    handleEvent("status", { phase: "assembling", message: "Assembling the report…" });
    handleEvent("complete", {
      report: extractReport(result.text),
      meta: Object.assign({ model: payload.model, effort: payload.effort }, result.usage),
    });
  }

  async function streamFromApi(body, key) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
      signal: state.controller.signal,
    });

    if (!res.ok) {
      let detail = `The API returned HTTP ${res.status}.`;
      try {
        const j = await res.json();
        if (j && j.error && j.error.message) detail = j.error.message;
      } catch { /* error body was not JSON */ }
      const err = new Error(detail);
      err.status = res.status;
      throw err;
    }
    if (!res.body) throw new Error("The API sent no response stream.");

    let text = "";
    let thinkingChars = 0;
    let outputChars = 0;
    let apiError = null;
    const usage = {};

    await readEvents(res.body, (name, data) => {
      if (name === "error") {
        apiError = (data && data.error && data.error.message) || "The API reported an error.";
      } else if (name === "message_start") {
        const u = (data.message && data.message.usage) || {};
        usage.input_tokens = u.input_tokens;
        usage.cache_read_input_tokens = u.cache_read_input_tokens;
        usage.cache_creation_input_tokens = u.cache_creation_input_tokens;
      } else if (name === "content_block_delta") {
        const d = data.delta || {};
        if (d.type === "thinking_delta") {
          const t = d.thinking || "";
          thinkingChars += t.length;
          handleEvent("thinking", { text: t, total: thinkingChars });
        } else if (d.type === "text_delta") {
          const t = d.text || "";
          text += t;
          outputChars += t.length;
          if (outputChars % 2000 < 64) {
            handleEvent("status", { phase: "writing",
              message: `Writing the report… ${outputChars.toLocaleString()} characters so far` });
          }
        }
      } else if (name === "message_delta") {
        if (data.usage && data.usage.output_tokens != null) usage.output_tokens = data.usage.output_tokens;
      }
    });

    if (apiError) throw new Error(apiError);
    return { text, usage };
  }

  function isOutputConfigRejection(err) {
    if (err.status !== 400 && err.status !== 422) return false;
    const t = String(err.message || "").toLowerCase();
    return ["output_config", "json_schema", "output_format", "schema"].some((k) => t.includes(k));
  }

  function extractReport(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) throw new Error("The model returned no report content.");
    try { return JSON.parse(trimmed); }
    catch {
      // Belt and braces: strip a stray markdown fence if one slipped through.
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      if (start !== -1 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
      throw new Error("The model's response was not valid JSON.");
    }
  }

  // ======================================================================
  // Sample report — lets someone exercise the whole UI, including the PDF,
  // without an API key or a cent of spend. Every screen it touches is the
  // real renderer; only the data is canned.
  // ======================================================================

  const SAMPLE_REPORT = {
    application_profile: {
      name: "Northwind Customer Portal (sample)",
      purpose: "Self-service portal where retail customers view orders, update payment methods and download invoices. The submitted material describes the customer-facing journey; internal operational use of the same system is mentioned but not drawn.",
      application_type: "Internet-facing customer web portal with a REST backend",
      internet_facing: "Yes",
      hosting_summary: "The architecture diagram carries AWS iconography and names an Application Load Balancer, ECS and RDS. A hosting document was referenced by SharePoint link, but a link cannot be opened by this review, so regions, account structure and the runtime substrate for each component remain unestablished.",
      environment_scope: "Not stated in the submitted material. No document identifies which environments are in scope, whether non-production environments exist, or what data they hold.",
      data_sensitivity: "The intake record states names, addresses, order history, partial card numbers and email addresses. The diagrams do not indicate which components hold which of these.",
      business_criticality: "Stated as High in the intake record. No supporting rationale or availability requirement was supplied.",
      regulatory_context: "PCI DSS and GDPR named in the intake record. No scoping document or cardholder-data-environment boundary was submitted.",
    },

    // INTK — UC-01 to UC-04.
    intake_determination: {
      sar_applicability: {
        artifact_id: "UC-01-OUT-01",
        determination: "SAR required",
        rationale: "An internet-facing solution that authenticates external customers and handles personal and payment data meets the threshold on every count. Nothing in the intake record suggests an exemption.",
        drivers: [
          "Internet-facing and reachable by unauthenticated users before sign-in.",
          "Handles personal data and partial card numbers, with PCI DSS and GDPR named by the team.",
          "New build rather than a periodic re-review, so no prior approved design exists to fall back on.",
          "Business criticality stated as High.",
        ],
      },
      review_path: {
        artifact_id: "UC-02-OUT-01",
        path: "Full review",
        rationale: "Internet exposure combined with regulated data and a custom build places this on the deepest path. A lighter path would be defensible only for an internal, low-criticality solution or a re-review of an already approved design.",
        depth_drivers: [
          "Regulated data in a custom-built, internet-facing solution.",
          "Payment data traverses components the organisation itself operates.",
          "No previously approved architecture exists for this solution.",
        ],
      },
      solution_classification: {
        artifact_id: "UC-03-OUT-01",
        solution_type: "Customer-facing web application with a REST API and a relational system of record",
        delivery_model: "Custom build",
        hosting_class: "Public cloud",
        technology_profile: [
          "Browser-based single-page application",
          "Application Load Balancer terminating TLS",
          "Container-hosted REST API (ECS, per the diagram)",
          "Managed PostgreSQL database",
          "Object storage for generated invoice documents",
          "Third-party payment provider",
        ],
        classification_note: "The hosting class is taken from AWS iconography on the architecture diagram rather than from a submitted hosting document, so it is an inference and is recorded as one.",
      },
      required_evidence: [
        { artifact: "Architecture diagram", is_minimum_input: "Minimum input", why_required: "Establishes the component set and how the solution is zoned.", priority: "High" },
        { artifact: "Data flow diagram", is_minimum_input: "Minimum input", why_required: "Establishes what crosses each boundary, under what protocol and with what authentication.", priority: "High" },
        { artifact: "Hosting or deployment model", is_minimum_input: "Minimum input", why_required: "Establishes the shared-responsibility boundary and the jurisdictions the data sits in.", priority: "High" },
        { artifact: "Integrations and third-party dependencies", is_minimum_input: "Minimum input", why_required: "Establishes the solution's external exposure and who else holds its data.", priority: "High" },
        { artifact: "Environment scope", is_minimum_input: "Minimum input", why_required: "Establishes what this review actually covers.", priority: "High" },
        { artifact: "Identity and access approach", is_minimum_input: "Minimum input", why_required: "Establishes who can reach what, across all four actor classes.", priority: "High" },
        { artifact: "Cardholder data environment boundary", is_minimum_input: "Additional for this review path", why_required: "The team names PCI DSS as applicable, so the scope boundary is needed to corroborate the design against it.", priority: "Medium" },
        { artifact: "Data classification mapped to components", is_minimum_input: "Additional for this review path", why_required: "A full review on regulated data needs to know which component holds which class of data.", priority: "Medium" },
      ],
    },

    // EXTR — UC-05 to UC-09.
    evidence_base: {
      summary: "As far as the submitted material establishes it: customers reach a browser-based portal over the public internet. Requests arrive at an Application Load Balancer which routes to an Orders API running on ECS. That API reads and writes a PostgreSQL database and generates invoice PDFs which are stored in an S3 bucket and retrieved by the browser. A payment provider appears on the diagram but its interaction with the API is not described. Beyond the load balancer the picture becomes inferential: the internal hops carry no protocol or authentication labels, the hosting document was referenced by link rather than submitted, and nothing describes which environments exist.",
      source_register: [
        { input_name: "Architecture diagram", source_type: "Uploaded file", source_location: "northwind-architecture-v3.pdf", retrieval_status: "Retrieved and read", what_it_establishes: "The component set, the public / DMZ / private zoning, and the direct browser-to-bucket path for invoices." },
        { input_name: "Data flow diagram", source_type: "Uploaded file", source_location: "northwind-flows.png", retrieval_status: "Retrieved and read", what_it_establishes: "The two inbound hops and their protocols, including the plain-HTTP hop behind the load balancer. Stops at the application tier." },
        { input_name: "Hosting or deployment model", source_type: "Referenced link — not retrieved", source_location: "https://contoso.sharepoint.com/sites/northwind/Shared%20Documents/hosting-model.docx", retrieval_status: "Referenced only — contents not available to this review", what_it_establishes: "Nothing. The link was recorded as submitted but its contents could not be opened by this review, so it carries no evidential weight." },
        { input_name: "Integrations and third-party dependencies", source_type: "Intake record statement", source_location: "Intake record, integrations field", retrieval_status: "Retrieved and read", what_it_establishes: "That a payment provider and an internal ledger API are believed to be in scope. Contradicted by the architecture diagram." },
        { input_name: "Environment scope", source_type: "Not supplied", source_location: "—", retrieval_status: "Nothing supplied", what_it_establishes: "Nothing." },
        { input_name: "Identity and access approach", source_type: "Uploaded file", source_location: "northwind-identity.md", retrieval_status: "Retrieved and read", what_it_establishes: "Customer sign-in through a managed identity provider. Silent on the other three actor classes." },
      ],
      component_inventory: [
        { name: "Browser client", purpose: "Customer-facing single-page application", technology: "Not stated", zone: "Public internet", handles_sensitive_data: "Yes", notes: "What the client stores locally is not described." },
        { name: "Application Load Balancer", purpose: "Entry point and request routing", technology: "AWS Application Load Balancer, per the diagram", zone: "DMZ", handles_sensitive_data: "Yes", notes: "TLS terminates here; the onward hop to the Orders API is labelled HTTP." },
        { name: "Orders API", purpose: "Business logic and data access", technology: "Container on ECS, per the diagram", zone: "Private", handles_sensitive_data: "Yes", notes: "Runtime shown on the diagram only; not confirmed by any submitted document." },
        { name: "PostgreSQL database", purpose: "System of record for customers and orders", technology: "PostgreSQL, managed or self-hosted not stated", zone: "Private", handles_sensitive_data: "Yes", notes: "Managed or self-hosted is not stated." },
        { name: "S3 invoice bucket", purpose: "Storage for generated invoice PDFs", technology: "Object storage", zone: "Not stated", handles_sensitive_data: "Yes", notes: "Retention and access model are not described." },
        { name: "Payment provider", purpose: "Not stated", technology: "Not stated", zone: "Third party", handles_sensitive_data: "Not stated", notes: "Drawn as a box with an unlabelled connector. Named as Stripe in the intake record but not in any artifact." },
      ],
      flow_register: [
        { source: "Browser client", destination: "Application Load Balancer", data_description: "Sign-in requests, order requests and card details entered at checkout", protocol: "HTTPS", authentication: "Session token issued by the identity provider", crosses_trust_boundary: "Yes", notes: "The only fully labelled inbound flow in the package." },
        { source: "Application Load Balancer", destination: "Orders API", data_description: "Forwarded request payloads, including checkout payloads", protocol: "HTTP", authentication: "Not stated", crosses_trust_boundary: "Yes", notes: "The arrow is labelled 'HTTP :8080' on the flow diagram." },
        { source: "Orders API", destination: "PostgreSQL database", data_description: "Not stated", protocol: "Not stated", authentication: "Not stated", crosses_trust_boundary: "Not stated", notes: "The flow diagram stops before this hop; it appears only on the architecture diagram." },
        { source: "Browser client", destination: "S3 invoice bucket", data_description: "Invoice PDFs containing names, addresses and order history", protocol: "HTTPS", authentication: "Not stated", crosses_trust_boundary: "Yes", notes: "Drawn as a direct arrow from the browser to the bucket, bypassing the Orders API. How the browser is authorised to retrieve a given object is not described." },
        { source: "Orders API", destination: "Payment provider", data_description: "Card details forwarded from the checkout payload", protocol: "Not stated", authentication: "Not stated", crosses_trust_boundary: "Yes", notes: "Direction of initiation is not indicated. The flow diagram shows card data reaching the API before this hop." },
      ],
      trust_boundaries: [
        { name: "Public internet | DMZ", description: "Customer traffic entering at the load balancer.", how_established: "Drawn explicitly" },
        { name: "DMZ | Private", description: "Requests passing from the load balancer to the application tier. Nothing describes what changes at this crossing.", how_established: "Drawn explicitly" },
        { name: "Organisation | Payment provider", description: "An external party appears on the diagram; what crosses the boundary is not stated.", how_established: "Inferred" },
        { name: "Organisation | Object storage", description: "The browser retrieves objects directly, which places a boundary crossing outside the application path.", how_established: "Inferred" },
      ],
      stated_controls: [
        { control: "TLS on the public entry point, terminated at the load balancer.", domain: "Data protection and encryption", stated_in: "Data flow diagram, browser-to-load-balancer hop", evidence_strength: "Explicitly stated" },
        { control: "Customer authentication delegated to a managed identity provider issuing session tokens.", domain: "Identity and access management", stated_in: "Identity and access approach document", evidence_strength: "Explicitly stated" },
        { control: "Three-zone segmentation: public, DMZ and private.", domain: "Network and trust boundary", stated_in: "Architecture diagram", evidence_strength: "Explicitly stated" },
        { control: "The application tier is not itself published to the internet; a load balancer fronts it.", domain: "Network and trust boundary", stated_in: "Architecture diagram", evidence_strength: "Implied" },
        { control: "Managed cloud services used for the database and object storage.", domain: "Cloud, SaaS and platform", stated_in: "Architecture diagram iconography", evidence_strength: "Implied" },
      ],
      normalized_facts: [
        { fact_id: "F-01", fact: "The hop from the load balancer to the Orders API is carried over plain HTTP on port 8080.", domain: "Data protection and encryption", source: "Data flow diagram, arrow label", certainty: "Stated" },
        { fact_id: "F-02", fact: "The same hop carries session tokens and, at checkout, card details.", domain: "Data protection and encryption", source: "Data flow diagram, payload annotation", certainty: "Stated" },
        { fact_id: "F-03", fact: "Card details are posted to the Orders API before reaching the payment provider.", domain: "Data protection and encryption", source: "Data flow diagram, checkout path", certainty: "Stated" },
        { fact_id: "F-04", fact: "The browser retrieves invoice objects directly from the S3 bucket without passing through the Orders API.", domain: "Network and trust boundary", source: "Architecture diagram, browser-to-bucket arrow", certainty: "Stated" },
        { fact_id: "F-05", fact: "Invoice objects contain customer names, addresses and order history.", domain: "Data protection and encryption", source: "Intake record, data types field", certainty: "Stated" },
        { fact_id: "F-06", fact: "End-user authentication is delegated to a managed identity provider.", domain: "Identity and access management", source: "Identity and access approach document", certainty: "Stated" },
        { fact_id: "F-07", fact: "No service, administrative or third-party identity is described anywhere in the package.", domain: "Identity and access management", source: "Absence across all submitted material", certainty: "Stated" },
        { fact_id: "F-08", fact: "The protocol and authentication for the Orders API to PostgreSQL hop are not stated.", domain: "Data protection and encryption", source: "Architecture diagram, unlabelled arrow", certainty: "Stated" },
        { fact_id: "F-09", fact: "No logging component, log destination or retention period appears anywhere in the package.", domain: "Logging, monitoring and detection", source: "Absence across all submitted material", certainty: "Stated" },
        { fact_id: "F-10", fact: "No secret store, key management service or credential handling is described.", domain: "Secrets, keys and credential management", source: "Absence across all submitted material", certainty: "Stated" },
        { fact_id: "F-11", fact: "The solution is deployed to a public cloud provider.", domain: "Cloud, SaaS and platform", source: "AWS iconography on the architecture diagram", certainty: "Inferred" },
        { fact_id: "F-12", fact: "The architecture diagram describes the production environment.", domain: "Cloud, SaaS and platform", source: "No environment label appears on any diagram", certainty: "Assumed" },
        { fact_id: "F-13", fact: "The intake record and the architecture diagram disagree on the set of external dependencies.", domain: "Secure development and vulnerability management", source: "Intake record versus architecture diagram", certainty: "Stated" },
        { fact_id: "F-14", fact: "No availability target, redundancy design or recovery arrangement is described.", domain: "Resilience, recovery and availability", source: "Absence across all submitted material", certainty: "Stated" },
      ],
      hosting_and_deployment: "Not established. AWS iconography on the architecture diagram suggests a cloud deployment using managed services, and a hosting document was referenced by SharePoint link — but a link cannot be opened by this review, so regions, account structure, network topology, the runtime for each component and the deployment path to production all remain undetermined.",
      identity_and_access: [
        { actor_class: "End users", approach: "Customers sign in through a managed identity provider and receive a session token, which the browser presents to the load balancer.", status: "Described" },
        { actor_class: "Service and machine identities", approach: "Not described in the submitted material. How the API proves its identity to the database, or to the payment provider, is not stated.", status: "Not described" },
        { actor_class: "Administrative and privileged access", approach: "Not described in the submitted material. No document describes how operators reach the application tier or the database.", status: "Not described" },
        { actor_class: "External or third-party actors", approach: "Not described in the submitted material. The payment provider's access, if any, is not characterised.", status: "Not described" },
      ],
      integrations: [
        { name: "Payment provider (named as Stripe in the intake record)", purpose: "Not stated", data_exchanged: "Not stated", notes: "Appears as an unlabelled box on the diagram; not covered by any submitted document." },
        { name: "Internal ledger API", purpose: "Named in the intake record only", data_exchanged: "Not stated", notes: "Does not appear on the architecture diagram at all, which is a contradiction between the two sources." },
        { name: "Managed identity provider", purpose: "Customer authentication", data_exchanged: "Not stated", notes: "Referenced in the identity section but not drawn." },
      ],
    },

    // VALD — UC-10 to UC-13.
    evidence_validation: {
      sufficiency: {
        artifact_id: "UC-12-OUT-01",
        rating: "Sufficient with gaps",
        completeness_score: 48,
        rationale: "Three of the six minimum requested inputs arrived in readable form, one arrived as a link that could not be opened, one arrived only as an intake-record statement, and one was not submitted at all. What did arrive was clear enough to assess: the package establishes the component set, the zoning and the shape of the customer journey, and against good security architecture practice it shows three weaknesses that do not depend on any missing document — an unencrypted internal hop, card data routed through the application, and personal data served directly from object storage. Those stand on their own evidence and should be addressed regardless of what else is supplied. The remaining picture is thinner: with no readable hosting model and no environment scope, a substantial part of what shapes this solution's exposure rests on inference, and the identity material covers end users only, leaving service and administrative access undocumented for an internet-facing system handling payment data.",
        quality_concerns: [
          "The hosting model was referenced by SharePoint link rather than submitted. The link is recorded, but its contents were not available to this review, so it earns no completeness credit.",
          "The data flow diagram stops at the application tier, so the half of the data path that touches the system of record is undocumented.",
          "The intake record and the architecture diagram give different dependency lists, so neither can be treated as authoritative.",
        ],
        blocking_items: [
          "A decision on how the load-balancer-to-application hop will be protected, since the current design leaves it in the clear.",
          "A position on whether card details must continue to traverse the application on the way to the payment provider.",
          "The hosting and deployment document itself, uploaded rather than linked, covering regions, account structure and the runtime for each component.",
          "A statement of which environments are in scope and whether any non-production environment holds real customer data.",
          "The identity and access approach for service, administrative and third-party actors, not only end users.",
        ],
      },
      gap_register: [
        {
          input_name: "Architecture diagram",
          status: "Provided",
          what_was_submitted: "A single-page architecture diagram showing the browser, an Application Load Balancer, an Orders API on ECS, a PostgreSQL database and an S3 bucket, grouped into public, DMZ and private zones.",
          what_is_missing: "Nothing material is missing for this input. The diagram establishes the component set and their arrangement.",
          impact_on_review: "No impact — this input is complete.",
        },
        {
          input_name: "Data flow diagram",
          status: "Partially provided",
          what_was_submitted: "A flow diagram covering the browser-to-load-balancer and load-balancer-to-API hops.",
          what_is_missing: "Everything behind the API tier is drawn as unlabelled arrows. The connection to the database and the path to the S3 bucket carry no protocol, no direction of initiation and no description of what data travels.",
          impact_on_review: "The reviewer cannot establish what crosses the internal boundaries or how those channels are established, so the second half of the data path is unassessable.",
        },
        {
          input_name: "Hosting or deployment model",
          status: "Not provided",
          what_was_submitted: "A SharePoint link to a document named hosting-model.docx. The link was recorded in the evidence source register, but this review runs in the browser with no access to SharePoint and could not open it.",
          what_is_missing: "The contents of that document: cloud accounts, regions, the runtime substrate for each component, and how deployments reach production.",
          impact_on_review: "Assessed the same as not provided. Without the contents the reviewer cannot establish which shared-responsibility boundaries apply, which jurisdictions are involved, or which parts of the stack the team actually operates. Uploading the file itself would close this.",
        },
        {
          input_name: "Integrations and third-party dependencies",
          status: "Partially provided",
          what_was_submitted: "The intake record names Stripe and an internal ledger API. The architecture diagram shows a payment provider box with no label on the connecting line.",
          what_is_missing: "What crosses each boundary, in which direction, under what contractual arrangement, and where the shared-responsibility line falls. The diagram and the intake record also disagree on how many external systems are involved.",
          impact_on_review: "External data paths cannot be characterised, and the disagreement between the two sources means neither can be relied on.",
        },
        {
          input_name: "Environment scope",
          status: "Not provided",
          what_was_submitted: "No material addressing this input was submitted.",
          what_is_missing: "Which environments are in scope for this review, whether they are isolated from one another, and whether any non-production environment carries real customer data.",
          impact_on_review: "The reviewer cannot tell what the review actually covers, which makes every conclusion in the report conditional on an unstated scope.",
        },
        {
          input_name: "Identity and access approach",
          status: "Partially provided",
          what_was_submitted: "A short section describing customer sign-in through a managed identity provider.",
          what_is_missing: "Service and machine identity, administrative and privileged access, and access held by external or third-party actors. How operators reach the servers and the database is not described anywhere in the package.",
          impact_on_review: "A material part of the access approach is undocumented for an internet-facing system, so the reviewer cannot describe who can reach what.",
        },
      ],
      conflict_register: [
        { id: "C-01", topic: "Which external systems the solution depends on", source_a: "The intake record names a payment provider and an internal ledger API.", source_b: "The architecture diagram shows a payment provider box and no ledger at all.", domain: "Secure development and vulnerability management", significance: "High", resolution_needed: "The team should state which of the two is current and produce one reconciled dependency list with an owner for each entry." },
        { id: "C-02", topic: "Whether the payment provider is Stripe", source_a: "The intake record names Stripe explicitly.", source_b: "The architecture diagram labels the box only as 'payment provider'.", domain: "Cloud, SaaS and platform", significance: "Low", resolution_needed: "Name the provider on the diagram so the contractual and shared-responsibility position can be assessed against the right party." },
        { id: "C-03", topic: "Where the cardholder data environment begins", source_a: "The intake record names PCI DSS as applicable and implies the provider handles card data.", source_b: "The flow diagram shows card details reaching the Orders API before the provider, which places the application inside the scope.", domain: "Data protection and encryption", significance: "High", resolution_needed: "Confirm the actual checkout path and mark the cardholder data environment boundary on the architecture diagram." },
      ],
      clarification_requests: [
        { id: "Q-01", question: "Is the plain-HTTP hop from the load balancer to the Orders API the intended design, or does the diagram lag a change that has already been made?", directed_to: "Solution architect", why_it_matters: "Determines whether SAR-01 is a live weakness in the deployed solution or an out-of-date drawing.", related_artifact: "SAR-01" },
        { id: "Q-02", question: "Does the checkout page post card details to the Orders API, or is there a tokenisation or hosted-field step that the flow diagram does not show?", directed_to: "Application owner", why_it_matters: "Decides whether the application really sits inside the cardholder data environment, which changes both the design and the PCI DSS scope.", related_artifact: "SAR-02" },
        { id: "Q-03", question: "Could the hosting and deployment document be uploaded as a file rather than linked? This review has no access to SharePoint and could not open it.", directed_to: "Infrastructure or platform team", why_it_matters: "It is one of the six minimum inputs and is currently assessed as not provided, purely because its contents could not be read.", related_artifact: "SAR-03" },
        { id: "Q-04", question: "Which environments are in scope for this review, and does any non-production environment hold real customer data?", directed_to: "Application owner", why_it_matters: "Defines what this review covers and whether unmasked data exists outside production.", related_artifact: "SAR-04" },
        { id: "Q-05", question: "How does the Orders API authenticate to the database and to the payment provider, and how do operators reach the runtime and the database?", directed_to: "Identity team", why_it_matters: "Three of the four actor classes are undocumented, which is the largest single gap in the design.", related_artifact: "SAR-05" },
        { id: "Q-06", question: "How is the browser authorised to retrieve a particular invoice object from storage, and could that retrieval be mediated by the Orders API instead?", directed_to: "Solution architect", why_it_matters: "The current design places an authorisation decision on personal data outside the component that owns it.", related_artifact: "SAR-06" },
        { id: "Q-07", question: "What protocol and authentication does the Orders API use to reach the database, and is the channel encrypted?", directed_to: "Solution architect", why_it_matters: "The only labelled internal hop turned out to be unencrypted, so this one cannot be assumed sound.", related_artifact: "SAR-07" },
        { id: "Q-08", question: "Is the internal ledger API part of this solution, and how are third-party components reviewed or scanned before the solution depends on them?", directed_to: "Solution architect", why_it_matters: "Resolves a contradiction between two submitted sources and establishes whether any supply-chain assurance exists.", related_artifact: "SAR-08" },
        { id: "Q-09", question: "Where do this solution's logs go, how long are they kept, and does anything alert on them?", directed_to: "Infrastructure or platform team", why_it_matters: "Nothing in the package establishes whether an incident here could be detected or reconstructed at all.", related_artifact: "SAR-10" },
      ],
    },

    // KNOW — UC-22 and UC-23.
    requirements_basis: {
      retrieval_note: "No internal policy repository or approved reference-architecture library is connected to this agent, so no organisational standard could be retrieved. What follows is drawn from the regulatory context the team stated in the intake record and from general security architecture practice. Where a finding rests on general practice rather than a named requirement, its linkage says so, and the Security Architect should substitute the organisation's own standard before the finding is relied on.",
      applicable_requirements: [
        { requirement: "Cardholder data must be protected in transit across open and internal networks, and the systems it traverses fall within assessment scope.", source: "PCI DSS, named as applicable in the intake record", domain: "Data protection and encryption", authority: "Stated by the team as applicable" },
        { requirement: "Personal data must be accessible only to the individual it concerns or to authorised parties, with access decided by a component that can establish who is asking.", source: "GDPR, named as applicable in the intake record", domain: "Identity and access management", authority: "Stated by the team as applicable" },
        { requirement: "Processing of personal data must be limited to identified locations and jurisdictions.", source: "GDPR, implied by the stated regulatory context", domain: "Cloud, SaaS and platform", authority: "Implied by the stated regulatory context" },
        { requirement: "Every hop carrying authenticating or sensitive data should be encrypted and both ends authenticated, including hops that remain inside the organisation's own network.", source: "General security architecture practice", domain: "Data protection and encryption", authority: "General security architecture practice" },
        { requirement: "Every actor class — end user, service, administrative and third party — should have a described authentication and authorisation approach.", source: "General security architecture practice", domain: "Identity and access management", authority: "General security architecture practice" },
        { requirement: "Security-relevant events should be recorded to a destination the application itself cannot alter, with a stated retention period.", source: "General security architecture practice", domain: "Logging, monitoring and detection", authority: "General security architecture practice" },
      ],
      reference_guidance: [
        { pattern: "Three-tier public / DMZ / private zoning with a load balancer as the sole public entry point", relevance: "This is the pattern the architecture diagram follows, and it is the right shape for an internet-facing web solution.", conformance: "Appears to conform" },
        { pattern: "End-to-end encryption of internal service hops, not only the internet-facing edge", relevance: "The design terminates TLS at the load balancer and continues in the clear.", conformance: "Appears to depart" },
        { pattern: "Keeping cardholder data out of the application entirely, via tokenisation, a hosted field or a redirect", relevance: "The checkout path routes card details through components the organisation operates.", conformance: "Appears to depart" },
        { pattern: "Mediated access to stored documents, so authorisation is decided by the component that owns the data model", relevance: "Invoices are retrieved by the browser directly from object storage.", conformance: "Appears to depart" },
        { pattern: "Centralised secret management with no credentials in deployment artifacts", relevance: "Nothing in the package describes how the application holds any credential.", conformance: "Cannot determine from the submitted material" },
      ],
    },

    // CTRL — UC-14 to UC-21, one block per domain in schema order.
    domain_assessments: [
      {
        domain: "Identity and access management",
        artifact_id: "UC-14-OUT-01",
        status: "Assessed — concerns raised",
        summary: "End-user authentication is delegated properly and that decision is sound. Beyond it, the design carries no stated position at all: service, administrative and third-party access are absent from every submitted document, and the invoice path takes an authorisation decision on personal data out of the component that owns the data model.",
        evidence_considered: ["F-04", "F-06", "F-07", "Identity and access approach document", "Architecture diagram, browser-to-bucket arrow"],
        sound_by_design: [
          "End-user authentication is delegated to a managed identity provider rather than implemented inside the application.",
          "The session token is issued by the identity provider and presented at the edge, so the application is not minting its own credentials.",
        ],
        concerns: [
          "Three of the four actor classes — service, administrative and third-party — are undocumented for an internet-facing solution handling payment data.",
          "Whether one customer can retrieve another's invoice rests on how object access is granted, outside the application's authorisation model.",
          "Nothing states how operators reach the application tier or the database, so no privileged-access design exists to review.",
        ],
        uncertainty: "The absence of non-user identity material is itself the finding; it is not an inference. Whether an approach exists but was simply not documented cannot be told from the package.",
      },
      {
        domain: "Data protection and encryption",
        artifact_id: "UC-15-OUT-01",
        status: "Assessed — concerns raised",
        summary: "Protection of traffic stops at the edge. The one internal hop the team labelled is plain HTTP while carrying session tokens and card details, and the checkout design routes cardholder data through the application rather than around it. At-rest protection for either data store is not stated anywhere.",
        evidence_considered: ["F-01", "F-02", "F-03", "F-05", "F-08", "Data flow diagram", "Intake record data types"],
        sound_by_design: [
          "TLS is terminated at a dedicated edge component, which is the right place for it.",
        ],
        concerns: [
          "The load-balancer-to-application hop is plain HTTP while carrying session tokens and checkout payloads.",
          "Card details are designed to pass through the application on their way to the payment provider, pulling the application into the cardholder data environment.",
          "Neither the database nor the invoice bucket carries any statement about encryption at rest or key custody.",
        ],
        uncertainty: "The application-to-database hop appears only as an unlabelled arrow. Given that the hop in front of it is unencrypted, it is recorded as unverifiable rather than assumed sound.",
      },
      {
        domain: "Network and trust boundary",
        artifact_id: "UC-16-OUT-01",
        status: "Assessed — concerns raised",
        summary: "The zoning is explicit and the public entry point is correctly a load balancer rather than the application itself. Against that, the object store sits outside every labelled zone and is reached directly by the browser, which puts a boundary crossing on a path the application never sees.",
        evidence_considered: ["F-04", "Architecture diagram zoning", "Trust boundary register"],
        sound_by_design: [
          "The solution is zoned, with public, DMZ and private segments drawn explicitly rather than presented as a flat network.",
          "The application tier is not itself directly published to the internet.",
        ],
        concerns: [
          "The S3 invoice bucket is the only component drawn outside a labelled zone, and the browser reaches it directly.",
          "What changes at the DMZ-to-private crossing is not described, so the boundary is drawn but not characterised.",
        ],
        uncertainty: "Without the hosting model the actual network topology behind the zoning — security groups, subnets, egress paths — is unknown, so the zoning is assessed as a design intent rather than a verified control.",
      },
      {
        domain: "Logging, monitoring and detection",
        artifact_id: "UC-17-OUT-01",
        status: "Not assessable from the submitted evidence",
        summary: "No logging component, log destination, retention period or alerting arrangement appears anywhere in the package. There is nothing to assess in either direction, and the absence is recorded rather than read as a pass.",
        evidence_considered: ["F-09"],
        sound_by_design: [],
        concerns: [
          "Whether this solution could detect or reconstruct an incident is entirely unestablished.",
        ],
        uncertainty: "Nothing in the six inputs is required to cover logging, so the absence may simply reflect what was asked for rather than what exists. It is raised as a gap, not as a weakness.",
      },
      {
        domain: "Resilience, recovery and availability",
        artifact_id: "UC-18-OUT-01",
        status: "Not assessable from the submitted evidence",
        summary: "The intake record states business criticality as High but no availability target, redundancy design, backup arrangement or recovery objective was submitted. The hosting document that might have covered this was referenced by link and could not be opened.",
        evidence_considered: ["F-14", "Intake record criticality field"],
        sound_by_design: [],
        concerns: [
          "A solution stated as High criticality carries no described availability or recovery design.",
        ],
        uncertainty: "This would most likely have been addressed in the hosting and deployment document. Because that arrived as a link rather than a file, the domain could not be assessed either way.",
      },
      {
        domain: "Cloud, SaaS and platform",
        artifact_id: "UC-19-OUT-01",
        status: "Partially assessed",
        summary: "Managed services are used for the database and object storage, which is a reasonable platform choice. Everything else about the platform posture — accounts, regions, shared-responsibility boundary, guardrails — rests on iconography rather than a submitted document.",
        evidence_considered: ["F-11", "F-12", "Architecture diagram iconography", "Evidence source register, hosting model row"],
        sound_by_design: [
          "Managed services are used for the database and object storage rather than self-operated equivalents.",
        ],
        concerns: [
          "The hosting model was referenced by link rather than submitted, so the shared-responsibility boundary is undetermined.",
          "No account structure, region or jurisdiction is established, which matters directly given the stated GDPR context.",
        ],
        uncertainty: "That this runs on AWS is inferred from diagram iconography and is recorded as an assumption, not a fact.",
      },
      {
        domain: "Secrets, keys and credential management",
        artifact_id: "UC-20-OUT-01",
        status: "Not assessable from the submitted evidence",
        summary: "Nothing in the package describes how the application holds any credential — not the database credential, not the payment provider's API key, not the object storage grant. No secret store or key management service is named.",
        evidence_considered: ["F-10"],
        sound_by_design: [],
        concerns: [
          "The design carries no stated position on where credentials live or how they are rotated.",
        ],
        uncertainty: "Absence of description is not evidence of absence of a secret store. This is recorded as unassessable rather than as a weakness.",
      },
      {
        domain: "Secure development and vulnerability management",
        artifact_id: "UC-21-OUT-01",
        status: "Assessed — concerns raised",
        summary: "The one thing the package does establish here is that the dependency inventory is unreliable: two submitted sources give different lists. Beyond that, no evidence was supplied of how third-party components are reviewed, scanned or vouched for before the solution depends on them.",
        evidence_considered: ["F-13", "C-01", "Intake record integrations field", "Architecture diagram"],
        sound_by_design: [],
        concerns: [
          "The intake record and the architecture diagram disagree on the external dependency set, so neither can be relied on as the inventory.",
          "No review, scanning or provenance check for third-party components is described anywhere.",
        ],
        uncertainty: "Whether a build pipeline exists, and what it does, is entirely outside the submitted material.",
      },
    ],

    // GAPF — UC-24. Every candidate finding traces back to one of these.
    candidate_gaps: [
      { id: "G-01", domain: "Data protection and encryption", expected: "Every hop carrying authenticating or sensitive data is encrypted, including hops that stay inside the organisation's network.", observed: "The load-balancer-to-application hop is labelled plain HTTP while carrying session tokens and card details (F-01, F-02).", gap_type: "Design departs from expectation", becomes_finding: "SAR-01" },
      { id: "G-02", domain: "Data protection and encryption", expected: "Cardholder data is kept out of components the organisation operates, where the payment provider offers a path that allows it.", observed: "Card details are posted to the Orders API before reaching the provider (F-03).", gap_type: "Design departs from expectation", becomes_finding: "SAR-02" },
      { id: "G-03", domain: "Cloud, SaaS and platform", expected: "A hosting and deployment description establishing provider, accounts, regions and per-component runtime.", observed: "Referenced by SharePoint link; contents not available to this review.", gap_type: "Evidence absent", becomes_finding: "SAR-03" },
      { id: "G-04", domain: "Cloud, SaaS and platform", expected: "A statement of which environments are in scope and whether any holds real customer data.", observed: "Nothing submitted.", gap_type: "Evidence absent", becomes_finding: "SAR-04" },
      { id: "G-05", domain: "Identity and access management", expected: "An access approach covering all four actor classes.", observed: "End users only; three classes absent (F-07).", gap_type: "Evidence absent", becomes_finding: "SAR-05" },
      { id: "G-06", domain: "Identity and access management", expected: "Access to a customer's stored documents is authorised by the component that knows which customer owns which document.", observed: "The browser retrieves invoice objects directly from storage, bypassing the Orders API (F-04, F-05).", gap_type: "Design departs from expectation", becomes_finding: "SAR-06" },
      { id: "G-07", domain: "Data protection and encryption", expected: "The channel to the system of record is encrypted and both ends authenticated, and the design says so.", observed: "The hop appears only as an unlabelled arrow (F-08).", gap_type: "Evidence insufficient to decide", becomes_finding: "SAR-07" },
      { id: "G-08", domain: "Secure development and vulnerability management", expected: "One reconciled dependency inventory, with a stated assurance step before each dependency is trusted.", observed: "Two sources give different lists and no assurance step is described (F-13, C-01).", gap_type: "Evidence absent", becomes_finding: "SAR-08" },
      { id: "G-09", domain: "Data protection and encryption", expected: "Data classification mapped onto the components that hold it, and the cardholder data environment boundary drawn.", observed: "Data types are listed in the intake record but mapped to nothing.", gap_type: "Evidence absent", becomes_finding: "SAR-09" },
      { id: "G-10", domain: "Logging, monitoring and detection", expected: "Security-relevant events recorded to a destination the application cannot alter, with a stated retention period.", observed: "No logging appears anywhere in the package (F-09).", gap_type: "Evidence absent", becomes_finding: "SAR-10" },
    ],

    // GAPF — UC-25 and UC-26. Candidates: the architect sets severity.
    candidate_findings: [
      {
        id: "SAR-01",
        title: "Traffic between the load balancer and the application tier is unencrypted",
        proposed_priority: "High",
        finding_type: "Architecture weakness",
        area: "Data protection and encryption",
        source_gap: "G-01",
        description: "TLS terminates at the Application Load Balancer and the onward hop to the Orders API is carried over plain HTTP. The payloads on that hop include session tokens and, at checkout, card details forwarded from the browser. The design protects the segment that crosses the internet and leaves the segment inside the estate in the clear.",
        evidence: "The submitted flow diagram labels the load-balancer-to-API arrow 'HTTP :8080'. The preceding browser-to-load-balancer arrow is labelled HTTPS, so the change of protocol is deliberate rather than an omission.",
        good_practice: "Traffic carrying authenticating or sensitive data should be encrypted on every hop, including hops that stay inside the organisation's own network, so that the confidentiality of the channel does not depend on the trustworthiness of the network it crosses.",
        why_it_matters: "Anything with visibility of the internal segment sees session tokens and cardholder data in the clear. For an internet-facing solution in PCI DSS scope, the protected boundary effectively stops at the load balancer rather than extending to the component that holds the data.",
        treatment_options: [
          { option: "Encrypt the load-balancer-to-application hop and authenticate both ends, so the application tier accepts traffic only from the intended edge component.", treatment_type: "Remediate", note: "The direct fix. Applies equally to the remaining internal hops once their protocols are established." },
          { option: "Move TLS termination to the application tier, leaving the load balancer to pass traffic through without decrypting it.", treatment_type: "Redesign", note: "Removes the plaintext segment entirely but changes where certificates are managed." },
          { option: "Confirm first whether the diagram reflects the deployed system, since it may lag a change already made.", treatment_type: "Clarify before deciding", note: "See Q-01. If the diagram is stale, this finding closes on evidence rather than on work." },
        ],
        linkage: {
          evidence_linkage: "Directly evidenced in submitted material",
          requirement_linkage: "Linked to a stated requirement or regulatory context",
          confidence: "High",
          validation_note: "The team's own flow diagram states the protocol and states the payload. Nothing here is inferred, and the finding survives a rebuild with the same design and fresh settings.",
        },
        owner: "Solution architect",
      },
      {
        id: "SAR-02",
        title: "Card details traverse the application before reaching the payment provider",
        proposed_priority: "High",
        finding_type: "Architecture weakness",
        area: "Data protection and encryption",
        source_gap: "G-02",
        description: "The flow diagram shows card details entered in the browser being posted to the Orders API, which then forwards them to the payment provider. The application tier is therefore in the cardholder data path rather than beside it. No tokenisation, redirect or hosted-field arrangement appears anywhere in the material.",
        evidence: "The checkout flow on the submitted diagram runs browser to load balancer to Orders API to payment provider, with the card payload described at each step. No component is drawn between the browser and the payment provider.",
        good_practice: "Where a payment provider offers a path that keeps cardholder data out of the application — tokenisation, a hosted field, or a redirect — the architecture should use it, so that the systems in scope for cardholder data are as few as possible.",
        why_it_matters: "Every component the card data passes through is drawn into PCI DSS scope, including the load balancer and the application tier, and the exposure of that data now depends on those components rather than on the provider. The intake record names PCI DSS as applicable, so this shapes both the design and the compliance boundary.",
        treatment_options: [
          { option: "Move the card entry path so cardholder data goes from the browser to the payment provider without traversing the application tier.", treatment_type: "Redesign", note: "Tokenisation or a hosted field. Removes the application from PCI scope rather than securing it within scope." },
          { option: "Keep the application in the path and mark the cardholder data environment boundary explicitly on the architecture diagram, accepting the scope that follows.", treatment_type: "Mitigate", note: "Viable only with a stated compensating design decision and the assessment obligations that come with it." },
          { option: "Confirm whether the checkout page already uses a hosted field the flow diagram does not show.", treatment_type: "Clarify before deciding", note: "See Q-02." },
        ],
        linkage: {
          evidence_linkage: "Directly evidenced in submitted material",
          requirement_linkage: "Linked to a stated requirement or regulatory context",
          confidence: "High",
          validation_note: "The path is drawn on the team's own diagram and PCI DSS is named by the team in the intake record. This is a design property, not a configuration setting.",
        },
        owner: "Solution architect",
      },
      {
        id: "SAR-03",
        title: "The hosting and deployment model was referenced by link, so its contents are unavailable to this review",
        proposed_priority: "High",
        finding_type: "Missing or incomplete input",
        area: "Hosting or deployment model",
        source_gap: "G-03",
        description: "A hosting document was referenced by SharePoint link rather than submitted as a file. This review runs in the browser and has no access to the SharePoint session, so the link was recorded verbatim in the evidence source register but its contents could not be read. Where the solution runs — cloud accounts, regions, network topology, per-component runtime, and the path a change takes to production — therefore remains unestablished.",
        evidence: "The evidence source register records this input as 'Referenced link — not retrieved'. The AWS iconography on the architecture diagram is suggestive but is not a hosting model.",
        good_practice: "Not applicable — this is a documentation gap.",
        why_it_matters: "Without the contents the reviewer cannot establish which shared-responsibility boundaries apply, which jurisdictions the data sits in, or which parts of the stack the team operates versus consumes. For an internet-facing solution processing payment data this materially shapes exposure. It is also the most easily closed item in this report: the document appears to exist.",
        treatment_options: [
          { option: "Upload the referenced document as a file so its contents can be read and assessed.", treatment_type: "Remediate", note: "Closes this finding outright if the document covers provider, accounts, regions and per-component runtime." },
          { option: "If the document does not cover the deployment path to production, extend it before resubmitting.", treatment_type: "Remediate", note: "" },
        ],
        linkage: {
          evidence_linkage: "Based on the absence of material",
          requirement_linkage: "Linked to general security architecture practice",
          confidence: "High",
          validation_note: "This finding is about what the reviewer could read, not about the quality of the team's documentation. If the linked document is complete, the finding closes on submission.",
        },
        owner: "Infrastructure or platform team",
      },
      {
        id: "SAR-04",
        title: "Environment scope for the review has not been stated",
        proposed_priority: "High",
        finding_type: "Missing or incomplete input",
        area: "Environment scope",
        source_gap: "G-04",
        description: "No document identifies which environments are in scope for this review, which others exist, whether they are isolated from one another, or whether any non-production environment holds real customer data.",
        evidence: "No file or link was submitted against the environment scope input, and the intake record's environment field was left blank.",
        good_practice: "Not applicable — this is a documentation gap.",
        why_it_matters: "The reviewer cannot state what this review actually covers. Every conclusion in this report is therefore conditional on a scope that has not been agreed, and any assurance drawn from it would be unbounded.",
        treatment_options: [
          { option: "Supply a list of the environments in scope for this review and those explicitly excluded.", treatment_type: "Remediate", note: "" },
          { option: "State whether any non-production environment holds real or unmasked customer data, and how the environments are separated.", treatment_type: "Remediate", note: "If real data does sit outside production, that will likely generate a finding of its own." },
        ],
        linkage: {
          evidence_linkage: "Based on the absence of material",
          requirement_linkage: "Linked to general security architecture practice",
          confidence: "High",
          validation_note: "Nothing was submitted against this input in any form, so the absence is certain.",
        },
        owner: "Application owner",
      },
      {
        id: "SAR-05",
        title: "Identity model covers end users only",
        proposed_priority: "High",
        finding_type: "Missing or incomplete input",
        area: "Identity and access management",
        source_gap: "G-05",
        description: "The submitted identity material describes customer sign-in and stops there. Service and machine identity, administrative and privileged access, and any access held by third parties are not covered anywhere in the package.",
        evidence: "The identity section submitted against requested input 6 addresses the customer journey only. No artifact in the package describes how operators reach the application tier or the database.",
        good_practice: "Not applicable — this is a documentation gap.",
        why_it_matters: "Three of the four actor classes are undocumented for an internet-facing solution handling payment data. The reviewer cannot describe who can reach what, which is a precondition for every subsequent step of the review.",
        treatment_options: [
          { option: "Describe how the application tier authenticates to the database and to the payment provider.", treatment_type: "Remediate", note: "" },
          { option: "Describe how administrators and operators reach each environment, and through what path.", treatment_type: "Remediate", note: "" },
          { option: "State whether any third party holds access, and of what kind.", treatment_type: "Remediate", note: "" },
        ],
        linkage: {
          evidence_linkage: "Based on the absence of material",
          requirement_linkage: "Linked to general security architecture practice",
          confidence: "High",
          validation_note: "The identity document was read in full; the omission is in the document, not in the reading of it.",
        },
        owner: "Identity team",
      },
      {
        id: "SAR-06",
        title: "Invoices are served to the browser directly from object storage",
        proposed_priority: "Medium",
        finding_type: "Architecture weakness",
        area: "Identity and access management",
        source_gap: "G-06",
        description: "The architecture diagram draws a direct arrow from the browser to the S3 invoice bucket, bypassing the Orders API. Invoice documents containing names, addresses and order history are therefore retrieved on a path that does not pass through the component that holds the application's authorisation logic.",
        evidence: "The browser-to-bucket arrow on the architecture diagram does not touch the Orders API. The bucket is the only component drawn outside a labelled zone.",
        good_practice: "Access to stored documents belonging to one customer should be mediated by the component that knows which customer is asking, so that authorisation is decided in one place rather than delegated to the storage layer.",
        why_it_matters: "Whether one customer can retrieve another's invoice now rests entirely on how object access is granted, outside the application's own authorisation model. The material does not describe that mechanism, so the design places a boundary in a component the review cannot see into.",
        treatment_options: [
          { option: "Serve invoice documents through the Orders API so each request is authorised against the requesting customer's identity.", treatment_type: "Remediate", note: "Returns the authorisation decision to the component that owns the data model." },
          { option: "Keep the direct path but mediate it with short-lived, per-object grants issued by the Orders API after it authorises the request.", treatment_type: "Mitigate", note: "Retains the performance benefit while keeping the decision in the application." },
          { option: "Draw the object store inside a labelled zone so its exposure is explicit on the diagram.", treatment_type: "Remediate", note: "Documentation change; does not alter the design." },
        ],
        linkage: {
          evidence_linkage: "Directly evidenced in submitted material",
          requirement_linkage: "Linked to a stated requirement or regulatory context",
          confidence: "High",
          validation_note: "The design point holds regardless of how the object grant is implemented, so the finding does not depend on a setting the review has not seen.",
        },
        owner: "Solution architect",
      },
      {
        id: "SAR-07",
        title: "How the application tier reaches the database cannot be determined",
        proposed_priority: "Medium",
        finding_type: "Unverifiable from the material",
        area: "Data protection and encryption",
        source_gap: "G-07",
        description: "The connection from the Orders API to the PostgreSQL database appears on the architecture diagram only, with no protocol, no authentication method and no description of what travels. The flow diagram stops before this hop entirely.",
        evidence: "The API-to-database arrow on the architecture diagram is unlabelled, and the submitted flow diagram ends at the Orders API.",
        good_practice: "The channel to the system of record should be encrypted and both ends authenticated, and the design should say so — this is the hop that carries everything the solution stores.",
        why_it_matters: "The most sensitive channel in the solution cannot be assessed either way. Given that the hop in front of it is unencrypted, this is not a safe assumption to leave open.",
        treatment_options: [
          { option: "State the protocol and authentication method for the application-to-database channel.", treatment_type: "Clarify before deciding", note: "See Q-07. The finding may resolve to nothing, or to a second SAR-01." },
          { option: "Extend the data flow diagram past the application tier so the interior hops are covered.", treatment_type: "Remediate", note: "Also closes part of the data flow diagram gap." },
        ],
        linkage: {
          evidence_linkage: "Based on the absence of material",
          requirement_linkage: "Linked to general security architecture practice",
          confidence: "Medium",
          validation_note: "Recorded as unverifiable rather than as a weakness. It would be tempting to infer this hop is unencrypted by analogy with SAR-01, but that inference is not supported and has not been made.",
        },
        owner: "Solution architect",
      },
      {
        id: "SAR-08",
        title: "Integration list and architecture diagram disagree",
        proposed_priority: "Medium",
        finding_type: "Missing or incomplete input",
        area: "Integrations and third-party dependencies",
        source_gap: "G-08",
        description: "The intake record names a payment provider and an internal ledger API. The architecture diagram shows a payment provider box and no ledger at all. Neither source describes what crosses either boundary, and no evidence was supplied of how third-party components are reviewed before being trusted.",
        evidence: "The internal ledger API named in the intake record does not appear on the architecture diagram, and the payment provider's connector on the diagram carries no label. Recorded as conflict C-01.",
        good_practice: "Not applicable — this is a documentation gap.",
        why_it_matters: "Where two submitted sources disagree, neither can be relied on as the dependency inventory. The reviewer cannot establish what the solution's external exposure actually is, or tell whether the diagram or the intake record reflects the deployed reality.",
        treatment_options: [
          { option: "Produce a single reconciled list of external dependencies with an owner for each.", treatment_type: "Remediate", note: "Resolves conflict C-01." },
          { option: "State what data crosses to and from each dependency, and in which direction.", treatment_type: "Remediate", note: "" },
          { option: "State how third-party components are assessed before they are introduced, and whether that has been done for these.", treatment_type: "Transfer or contractual", note: "Where assurance rests on the provider's own attestations, that should be stated as such." },
        ],
        linkage: {
          evidence_linkage: "Directly evidenced in submitted material",
          requirement_linkage: "Linked to general security architecture practice",
          confidence: "High",
          validation_note: "The contradiction is between two documents the team submitted, so it is directly evidenced rather than inferred.",
        },
        owner: "Solution architect",
      },
      {
        id: "SAR-09",
        title: "Data classification is not mapped to components",
        proposed_priority: "Low",
        finding_type: "Missing or incomplete input",
        area: "Business or regulatory context",
        source_gap: "G-09",
        description: "The intake record names the data types the solution handles but nothing maps them to the components that hold or process them, and the boundary of the cardholder data environment is not drawn.",
        evidence: "The intake record lists partial card numbers and personal data; neither diagram annotates any component with a data classification.",
        good_practice: "Not applicable — this is a documentation gap.",
        why_it_matters: "The review can proceed without this, but the precision with which regulated data paths can be discussed is reduced, and the PCI DSS scope named in the intake record cannot be corroborated against the design.",
        treatment_options: [
          { option: "Annotate a data classification onto the architecture diagram, or supply a component-to-data-type table.", treatment_type: "Remediate", note: "" },
          { option: "Draw the boundary of the cardholder data environment, if one has been defined.", treatment_type: "Remediate", note: "Also resolves conflict C-03 and sharpens SAR-02." },
        ],
        linkage: {
          evidence_linkage: "Based on the absence of material",
          requirement_linkage: "Linked to a stated requirement or regulatory context",
          confidence: "Medium",
          validation_note: "Proposed as Low because the review proceeded without it. If the architect treats PCI scope as the central question, it belongs higher.",
        },
        owner: "Application owner",
      },
      {
        id: "SAR-10",
        title: "No logging, monitoring or detection appears anywhere in the package",
        proposed_priority: "Low",
        finding_type: "Unverifiable from the material",
        area: "Logging, monitoring and detection",
        source_gap: "G-10",
        description: "No logging component, log destination, retention period or alerting arrangement appears in any submitted artifact. Whether the solution can detect or reconstruct an incident is entirely unestablished.",
        evidence: "Neither diagram shows a log sink, and no submitted document mentions logging, monitoring or alerting.",
        good_practice: "Security-relevant events should be recorded to a destination the application itself cannot alter, with a stated retention period, so that an incident can be detected and reconstructed after the fact.",
        why_it_matters: "This cannot be called a weakness on the evidence: none of the six requested inputs asks for logging, so its absence may reflect what was asked for rather than what exists. It is recorded so the domain is not silently read as a pass.",
        treatment_options: [
          { option: "State where this solution's logs go, how long they are kept and what alerts on them.", treatment_type: "Clarify before deciding", note: "See Q-09. Once answered this either closes or becomes a substantive finding." },
        ],
        linkage: {
          evidence_linkage: "Based on the absence of material",
          requirement_linkage: "Linked to general security architecture practice",
          confidence: "Low",
          validation_note: "Deliberately proposed as Low: the absence is in the requested inputs as much as in the solution. The architect may reasonably decide this is out of scope for Step 1.",
        },
        owner: "Infrastructure or platform team",
      },
    ],

    // RPTS — UC-28.
    technical_summary: {
      artifact_id: "UC-28-OUT-01",
      summary: "Where the material is explicit, the design shows some sound instincts: the solution is zoned, the public entry point is a load balancer rather than the application itself, and end-user authentication is delegated to a managed identity provider rather than built in. Against that, three architectural weaknesses are visible in what was submitted. Protection of traffic stops at the edge — the onward hop to the application tier is drawn as plain HTTP while carrying session tokens and checkout payloads. The checkout design routes card details through the application, which places the solution's own components inside the regulated data path when the design need not do so. And invoices containing personal data are retrieved by the browser straight from object storage, moving an authorisation decision outside the application that owns it. Beyond these, the material thins out sharply: the internal hops behind the application tier, the whole hosting model, environment separation and all non-user access are undescribed, so four of the eight control domains could not be judged either way and are recorded as such rather than assumed sound.",
      strengths: [
        "The solution is zoned, with public, DMZ and private segments drawn explicitly rather than presented as a flat network.",
        "The public entry point is a load balancer, so the application tier is not itself directly published to the internet.",
        "End-user authentication is delegated to a managed identity provider rather than implemented inside the application.",
        "TLS is terminated at a dedicated edge component, which is the right place for it even though protection does not continue past it.",
        "Managed services are used for the database and object storage rather than self-operated equivalents.",
      ],
      areas_of_concern: [
        "Encryption in transit stops at the load balancer, leaving session tokens and checkout payloads on an unencrypted internal hop.",
        "Card details are designed to pass through the application on their way to the payment provider, pulling the application into the cardholder data environment.",
        "Invoices carrying personal data are served to the browser directly from object storage, outside the application that should be authorising the request.",
        "No non-user identity is described anywhere, so the design carries no stated position on service, administrative or third-party access for an internet-facing system.",
        "No environment separation is described, so nothing establishes that non-production environments are isolated from production data.",
        "External dependencies are neither reconciled nor accompanied by any stated review, scanning or provenance check before they are trusted.",
      ],
      not_assessable: [
        "Whether the application-to-database channel is encrypted or mutually authenticated — the hop appears only as an unlabelled arrow.",
        "Whether data at rest in the database or the invoice bucket is encrypted, and under whose key.",
        "Whether administrative access to the runtime and the database is brokered, bastioned or direct.",
        "Whether logging and monitoring exist at all; no component, sink or retention appears anywhere in the package.",
        "Whether secrets used by the application are held in a managed store or embedded in the deployment.",
        "Whether the deployment has any availability or resilience design, since the hosting document could not be opened.",
      ],
    },

    // RPTS — UC-30.
    executive_summary: {
      artifact_id: "UC-30-OUT-01",
      headline: "The design is broadly conventional, but payment and personal data travel on paths that need changing — and a third of the requested evidence could not be read.",
      narrative: "This solution follows a recognisable and reasonable shape for an internet-facing customer portal, and several of its choices are the right ones. Three design decisions, however, put regulated data where it need not be: card details pass through systems the organisation operates on their way to the payment provider, traffic behind the public entry point travels unencrypted while carrying those details, and customer invoices are fetched straight from storage without the application deciding who is entitled to them. None of these depends on a missing document; all three are visible in what the team submitted and all three are design choices rather than settings. Separately, the evidence package is half complete. One document was linked rather than uploaded and so could not be read, one was not supplied at all, and the identity material covers customers but not staff, services or third parties. The review can proceed on what is here, but the picture it produces is partial and should be treated as such.",
      key_points: [
        "Three design weaknesses are evidenced and actionable now, without waiting for any further document.",
        "PCI DSS scope is wider than the intake record implies, because card data traverses the organisation's own components.",
        "Two of the six requested inputs produced no readable evidence: one was linked rather than uploaded, one was not supplied.",
        "Four of the eight control domains could not be assessed and are recorded as unassessed rather than as passing.",
        "The single highest-value action is small: upload the hosting document that was linked.",
      ],
      decision_required: "Whether to return this package for further evidence before a detailed review begins, or to let detailed review proceed in parallel with the three evidenced design changes.",
      recommended_disposition: "Proceed with conditions",
    },

    next_steps: [
      { step: "Decide how the load-balancer-to-application hop will be protected, and reflect that decision on the flow diagram (SAR-01).", owner: "Solution architect", depends_on: "Q-01", sequence: "Before the review proceeds" },
      { step: "Confirm whether card details must pass through the Orders API, and if not, move the checkout onto a path that keeps them out of it (SAR-02).", owner: "Solution architect", depends_on: "Q-02", sequence: "Before the review proceeds" },
      { step: "Upload the hosting and deployment document rather than linking it, so its contents can be read (SAR-03).", owner: "Infrastructure or platform team", depends_on: "Q-03", sequence: "Before the review proceeds" },
      { step: "State the environment scope for this review and confirm whether non-production environments hold real data (SAR-04).", owner: "Application owner", depends_on: "Q-04", sequence: "Before the review proceeds" },
      { step: "Extend the identity and access material to cover service, administrative and third-party actors (SAR-05).", owner: "Identity team", depends_on: "Q-05", sequence: "Before the review proceeds" },
      { step: "Reconsider whether invoice retrieval should be mediated by the Orders API rather than served direct from storage (SAR-06).", owner: "Solution architect", depends_on: "Q-06", sequence: "During detailed review" },
      { step: "Label the remaining internal flows with protocol, authentication and data contents so they can be assessed rather than left open (SAR-07).", owner: "Solution architect", depends_on: "Q-07", sequence: "During detailed review" },
      { step: "Reconcile the dependency list and state how third-party components are reviewed before they are trusted (SAR-08).", owner: "Solution architect", depends_on: "C-01", sequence: "During detailed review" },
      { step: "Map data classification onto components and draw the cardholder data environment boundary (SAR-09).", owner: "Application owner", depends_on: "C-03", sequence: "During detailed review" },
      { step: "Establish where logs go, how long they are kept and what alerts on them (SAR-10).", owner: "Infrastructure or platform team", depends_on: "Q-09", sequence: "Before go-live" },
    ],

    human_review_gate: {
      decisions_required: [
        "Whether each candidate finding is accepted, amended or rejected. The ten below are proposals, not a findings register.",
        "The actual severity and risk rating of each accepted finding. The proposed priorities reflect evidential strength and design impact, not this organisation's risk appetite.",
        "Whether the package is returned for evidence or allowed to proceed with conditions. A disposition is proposed but not decided.",
        "Whether any finding is formally risk-accepted, and by whom.",
        "Which treatment option is chosen where more than one is offered — the options are set out without a preference.",
      ],
      material_evidence_to_validate: [
        "That the flow diagram reflects the deployed system rather than an earlier design, since SAR-01 and SAR-02 both rest on it.",
        "That the payment provider integration works as the diagram shows, before SAR-02 is treated as settled.",
        "That the hosting document behind the SharePoint link says what the team believes it says — this review never saw it.",
        "That the architecture diagram describes production, which this review assumed because no environment was labelled.",
        "That the AWS inference drawn from diagram iconography is correct.",
      ],
      not_performed: [
        "No configuration was inspected: no TLS version, cipher, bucket policy, security group or IAM policy was read.",
        "No threat model was built and no attack path was traced.",
        "No code review, dependency scan or penetration test was performed.",
        "No requirement was retrieved from an organisational policy repository — none is connected to this agent.",
        "No severity, risk rating or risk acceptance was determined.",
      ],
    },

    // ORCH — the run record for this sample.
    use_case_coverage: [
      { use_case_id: "UC-01", status: "Executed", note: "Determined from the intake record and the architecture diagram." },
      { use_case_id: "UC-02", status: "Executed", note: "Full review path, driven by internet exposure and regulated data." },
      { use_case_id: "UC-03", status: "Executed", note: "Hosting class inferred from diagram iconography and recorded as an inference." },
      { use_case_id: "UC-04", status: "Executed", note: "Six minimum inputs plus two additional artifacts for this review path." },
      { use_case_id: "UC-05", status: "Partially executed", note: "Four of six inputs produced readable material; one was a link that could not be opened, one was absent." },
      { use_case_id: "UC-06", status: "Executed", note: "Six components extracted from the architecture diagram." },
      { use_case_id: "UC-07", status: "Partially executed", note: "Five flows extracted, but the flow diagram stops at the application tier so interior hops are unlabelled." },
      { use_case_id: "UC-08", status: "Executed", note: "Five stated controls extracted, three explicit and two implied." },
      { use_case_id: "UC-09", status: "Executed", note: "Fourteen normalized facts, each tagged with its certainty." },
      { use_case_id: "UC-10", status: "Executed", note: "Gap register covers all six minimum inputs." },
      { use_case_id: "UC-11", status: "Executed", note: "Three conflicts detected between submitted sources." },
      { use_case_id: "UC-12", status: "Executed", note: "Sufficient with gaps; completeness scored at 48." },
      { use_case_id: "UC-13", status: "Executed", note: "Nine clarification requests, each tied to a finding." },
      { use_case_id: "UC-14", status: "Executed", note: "Concerns raised: three of four actor classes undocumented." },
      { use_case_id: "UC-15", status: "Executed", note: "Concerns raised: unencrypted internal hop and card data in the application path." },
      { use_case_id: "UC-16", status: "Executed", note: "Concerns raised: object store outside every labelled zone." },
      { use_case_id: "UC-17", status: "Not executed — required input unavailable", note: "No logging material of any kind was submitted." },
      { use_case_id: "UC-18", status: "Not executed — required input unavailable", note: "The hosting document that would cover this was linked, not uploaded." },
      { use_case_id: "UC-19", status: "Partially executed", note: "Managed-service use is visible; accounts, regions and shared responsibility are not." },
      { use_case_id: "UC-20", status: "Not executed — required input unavailable", note: "No secret store or credential handling is described anywhere." },
      { use_case_id: "UC-21", status: "Executed", note: "Concerns raised: dependency inventory unreliable, no assurance step described." },
      { use_case_id: "UC-22", status: "Partially executed", note: "No policy repository is connected; requirements drawn from the stated regulatory context and general practice." },
      { use_case_id: "UC-23", status: "Partially executed", note: "No approved reference-architecture library is connected; five general patterns assessed instead." },
      { use_case_id: "UC-24", status: "Executed", note: "Ten candidate gaps recorded, each expected-versus-observed." },
      { use_case_id: "UC-25", status: "Executed", note: "Ten candidate findings, each tracing to exactly one gap." },
      { use_case_id: "UC-26", status: "Executed", note: "Treatment options proposed per finding, with the type named and no preference expressed." },
      { use_case_id: "UC-27", status: "Executed", note: "Every finding carries an evidence linkage, a requirement linkage and a confidence." },
      { use_case_id: "UC-28", status: "Executed", note: "Technical assessment summary produced." },
      { use_case_id: "UC-29", status: "Executed", note: "Draft findings and treatment package produced." },
      { use_case_id: "UC-30", status: "Executed", note: "Executive summary produced with a proposed disposition." },
    ],

    assumptions: [
      "Assumed the solution runs on AWS, based on the iconography in the architecture diagram rather than on any submitted statement.",
      "Assumed the PostgreSQL database is a managed service, since the diagram uses a managed-database icon; this was not confirmed by any document.",
      "Assumed the payment provider box on the diagram is the Stripe integration named in the intake record; the diagram does not name it.",
      "Assumed the architecture diagram describes production, since no environment was labelled.",
      "Assumed the SharePoint link submitted for the hosting model points to a genuine document; its contents were never seen, so nothing was inferred from it.",
    ],

    reviewer_note: "This is Step 1 of a Security Architecture Review, run as the eight-agent use-case chain of the SAR Agentic AI MVP. It does two things — it judges the architecture the material describes against good security architecture practice, and it records what the package is missing or leaves unclear. Both are reported as candidate findings. Everything here is a proposal: evidence validation, security judgement, finding approval, severity and risk determination, risk acceptance and final disposition all remain with the Security Architect. It is not the whole Security Architecture Review: no configuration review, threat modelling, code review or testing has been performed, findings are limited to what the submitted material evidences, links that were referenced but not uploaded were never opened, and the absence of a finding in an area means only that the material did not establish one.",
  };

  const SAMPLE_THINKING =
    "Two jobs here. Judge the architecture the material describes, and record what the package is missing. " +
    "Let me do the architecture first, because that is what the team most needs to hear.\n\n" +
    "Encryption in transit. The browser-to-load-balancer hop is HTTPS. The next hop is labelled 'HTTP :8080' " +
    "in the team's own flow diagram, and the same request carries a session token and, at checkout, card " +
    "details. That is not an absence — the material states it. Protection stops at the edge while the data " +
    "keeps going. High weakness.\n\n" +
    "Following that checkout payload further: it reaches the Orders API before it reaches the payment provider. " +
    "So the application, its runtime and its logs all sit inside the cardholder data environment by design. " +
    "The usual pattern keeps card data out of the application entirely. Second High weakness — and it changes " +
    "the PCI scope the intake record claims.\n\n" +
    "The invoice path. The browser goes straight to the bucket, bypassing the API. The objects hold names, " +
    "addresses and order history. Whatever mechanism grants that access, the authorisation decision has been " +
    "moved out of the component that knows which customer owns which invoice. Medium weakness — the design " +
    "point holds regardless of how the grant is implemented.\n\n" +
    "Discipline check. I am not going to say the TLS version is wrong, or that the bucket policy is too broad " +
    "— I have not seen either, and both would change with a setting. The test is whether the finding survives " +
    "a rebuild with the same design and fresh settings. All three do.\n\n" +
    "The database hop is different. Unlabelled arrow, nothing more. Tempting to call it unencrypted by " +
    "analogy with the hop above, but I do not know that. It goes down as unverifiable, with a question " +
    "attached — and given what the labelled hop turned out to be, I am not going to record it as sound either.\n\n" +
    "Now the six inputs. Architecture diagram: Provided. Data flow diagram: Partially — it stops after two " +
    "hops. Hosting model: a SharePoint link. I have no session there and cannot open it, so I record the link " +
    "verbatim and score the input as not provided. That is not the team being careless — the document may be " +
    "perfectly complete — so the finding says the contents were unavailable to this review, and the fix is to " +
    "upload the file. Integrations: the intake record and the diagram disagree, and nothing says how third " +
    "parties are reviewed before being trusted. Environment scope: nothing at all. Identity: end users only, " +
    "three of four actor classes absent for an internet-facing system handling card data.\n\n" +
    "Across the eight control domains, four have nothing to read — logging, resilience, secrets, and most of " +
    "the platform posture. Those go down as not assessable. Silence does not get to read as a pass.\n\n" +
    "Five High candidates — two weaknesses, three evidence gaps. 'Sufficient with gaps' rather than " +
    "'Insufficient': there was enough here to assess, and the weaknesses are actionable today without waiting " +
    "on the missing documents. Severity and disposition are the architect's call, not mine.";

  async function runSampleReport() {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    showUploadError("");
    showView("progressView");
    document.querySelector(".spinner").style.display = "";
    $("progressTitle").textContent = "Reviewing the submitted materials (sample)";
    $("cancelBtn").textContent = "Cancel";
    $("thinkingText").textContent = "";
    $("thinkingCount").textContent = "";

    setPhase("preparing", "Reading the submitted material…");
    await sleep(600);
    setPhase("analyzing", "claude-opus-4-6 is reconstructing the architecture from 3 attachment(s) and 1 recorded link…");

    // Replay the reasoning at reading speed so the demo shows the live view.
    let shown = 0;
    for (const chunk of SAMPLE_THINKING.match(/[\s\S]{1,90}/g)) {
      shown += chunk.length;
      $("thinkingText").textContent += chunk;
      $("thinkingText").scrollTop = $("thinkingText").scrollHeight;
      $("thinkingCount").textContent = `(${shown.toLocaleString()} chars)`;
      await sleep(28);
    }

    setPhase("writing", "Writing the report… 11,200 characters so far");
    await sleep(700);
    setPhase("assembling", "Assembling the report…");
    await sleep(400);

    handleEvent("complete", {
      report: SAMPLE_REPORT,
      meta: { model: "sample data", effort: "—", demo: true },
    });
  }

  $("demoBtn").addEventListener("click", () => { runSampleReport(); });

  // ======================================================================
  // Rendering
  // ======================================================================

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };

  const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
  const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");

  function section(title, subtitle) {
    const s = el("section", "section");
    s.appendChild(el("h2", null, title));
    if (subtitle) s.appendChild(el("p", "section-sub", subtitle));
    return s;
  }

  function bulletList(items, emptyText) {
    const list = arr(items);
    if (!list.length) return el("p", "empty", emptyText || "None recorded.");
    const ul = el("ul", "bullets");
    list.forEach((i) => ul.appendChild(el("li", null, i)));
    return ul;
  }

  function table(headers, rows) {
    const wrap = el("div", "table-wrap");
    const t = el("table");
    const thead = el("thead");
    const tr = el("tr");
    headers.forEach((h) => tr.appendChild(el("th", null, h)));
    thead.appendChild(tr);
    t.appendChild(thead);

    const tbody = el("tbody");
    rows.forEach((cells) => {
      const row = el("tr");
      cells.forEach((cell) => {
        const td = el("td");
        td.textContent = cell == null || cell === "" ? "—" : String(cell);
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    t.appendChild(tbody);
    wrap.appendChild(t);
    return wrap;
  }

  function renderReport() {
    const r = state.report;
    const root = $("report");
    root.innerHTML = "";

    if (state.meta && state.meta.demo) {
      root.appendChild(el("div", "demo-banner",
        "Sample report — illustrative data for a fictional application. No review was performed and no API call was made."));
    }
    // The screen carries the findings pack and nothing else: the issues, the
    // questions they are waiting on, and what to do next. The working record
    // behind them is a download, not a scroll.
    const trace = findingsTrace(r);
    root.appendChild(renderHeader(r));
    root.appendChild(renderFindings(r));
    root.appendChild(renderOpenQuestions(trace));
    root.appendChild(renderNextSteps(trace));
    root.appendChild(renderReviewPackCard(r, trace));

    const m = state.meta || {};
    const cached = m.cache_read_input_tokens ? ` · ${m.cache_read_input_tokens.toLocaleString()} cached` : "";
    $("metaBadge").textContent = `${m.model || ""}${cached}`;
  }

  function renderHeader(r) {
    const rr = (r.evidence_validation || {}).sufficiency || {};
    const profile = r.application_profile || {};
    const findings = arr(r.candidate_findings);
    const score = Math.max(0, Math.min(100, Number(rr.completeness_score) || 0));
    const colour = score >= 80 ? "var(--good)" : score >= 60 ? "var(--low)"
                 : score >= 40 ? "var(--medium)" : "var(--high)";

    const s = el("section", "section");
    const head = el("div", "score-head");

    const circumference = 2 * Math.PI * 54;
    const ring = el("div", "score-ring");
    ring.innerHTML = `
      <svg width="128" height="128" viewBox="0 0 128 128">
        <circle class="track" cx="64" cy="64" r="54"></circle>
        <circle class="value" cx="64" cy="64" r="54"
                stroke="${colour}"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${circumference}"></circle>
      </svg>
      <div class="score-num"><strong style="color:${colour}">${score}</strong><small>complete</small></div>`;
    head.appendChild(ring);
    requestAnimationFrame(() => {
      const c = ring.querySelector(".value");
      if (c) c.style.strokeDashoffset = String(circumference * (1 - score / 100));
    });

    const body = el("div", "score-body");
    body.appendChild(el("h2", null, profile.name || "Security Architecture Review"));
    body.appendChild(el("p", "app-meta",
      ["SAR Step 1 — candidate output, pending Security Architect review", rr.rating,
       new Date().toLocaleDateString(undefined, { dateStyle: "long" })].filter(Boolean).join("  ·  ")));
    body.appendChild(el("p", "summary", rr.rationale || ""));

    const strip = el("div", "sev-strip");
    PRIORITIES.forEach((p) => {
      const count = findings.filter((f) => f.proposed_priority === p).length;
      if (!count) return;
      const chip = el("button", `sev-chip ${slug(p)}`);
      chip.type = "button";
      chip.innerHTML = `<b>${count}</b><span>${p} proposed</span>`;
      chip.addEventListener("click", () => {
        state.priorityFilter.has(p) ? state.priorityFilter.delete(p) : state.priorityFilter.add(p);
        chip.classList.toggle("on");
        applyFilter();
      });
      strip.appendChild(chip);
    });
    if (!findings.length) strip.appendChild(el("span", "empty", "No candidate findings were raised."));
    body.appendChild(strip);

    head.appendChild(body);
    s.appendChild(head);

    if (arr(rr.blocking_items).length) {
      const why = el("div", "fb-block");
      why.appendChild(el("h4", null, "What must be resolved before the review proceeds"));
      why.appendChild(bulletList(rr.blocking_items, "Nothing blocks the review from proceeding."));
      s.appendChild(why);
    }
    if (arr(rr.quality_concerns).length) {
      const q = el("div", "fb-block");
      q.appendChild(el("h4", null, "Concerns about the quality of the evidence itself"));
      q.appendChild(bulletList(rr.quality_concerns));
      s.appendChild(q);
    }
    return s;
  }

  // finding_type drives the headings inside a card, because "what is missing"
  // reads wrong on a weakness and "what the design does" reads wrong on a gap.
  const WEAKNESS = "Architecture weakness";
  const UNVERIFIABLE = "Unverifiable from the material";

  const TYPE_SLUG = {
    "Architecture weakness": "weakness",
    "Missing or incomplete input": "gap",
    "Unverifiable from the material": "unverified",
  };

  function renderFindings(r) {
    const findings = arr(r.candidate_findings);
    const count = (type) => findings.filter((f) => f.finding_type === type).length;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

    // Three kinds of finding, so the subtitle counts each rather than
    // lumping "unverifiable" in with the missing inputs.
    const parts = [];
    const weak = count(WEAKNESS);
    const gaps = count("Missing or incomplete input");
    const unver = count(UNVERIFIABLE);
    if (weak) parts.push(plural(weak, "architectural weakness in the design", "architectural weaknesses in the design"));
    if (gaps) parts.push(plural(gaps, "gap in the submitted package", "gaps in the submitted package"));
    if (unver) parts.push(plural(unver, "point the material could not settle", "points the material could not settle"));

    const s = section(`Candidate findings (${findings.length})`, parts.length ? `${parts.join(" · ")}.` : "");
    s.appendChild(el("p", "sub-head",
      "Candidates only. Severity, risk acceptance and final disposition are the Security Architect's to set — the priority shown is a proposal."));
    const wrap = el("div", "findings");

    findings.forEach((f) => wrap.appendChild(renderFinding(f)));
    if (!findings.length) {
      wrap.appendChild(el("p", "empty", "No candidate findings were raised — the submitted package was complete and the architecture it describes held up against review."));
    }
    s.appendChild(wrap);
    return s;
  }

  function renderFinding(f) {
    const card = el("article", `finding ${slug(f.proposed_priority)}`);
    card.dataset.priority = f.proposed_priority || "";
    card.dataset.type = f.finding_type || "";

    const head = el("div", "finding-head");
    head.appendChild(el("span", "finding-id", f.id || ""));
    head.appendChild(el("span", "finding-title", f.title || ""));

    const badges = el("div", "finding-badges");
    if (f.finding_type) {
      badges.appendChild(el("span", `pill pill-type pill-${TYPE_SLUG[f.finding_type] || "gap"}`, f.finding_type));
    }
    if (f.area) badges.appendChild(el("span", "pill pill-area", f.area));
    if (f.proposed_priority) {
      badges.appendChild(el("span", `pill pill-${slug(f.proposed_priority)}`, `${f.proposed_priority} proposed`));
    }
    head.appendChild(badges);
    head.addEventListener("click", () => card.classList.toggle("open"));
    card.appendChild(head);

    const body = el("div", "finding-body");
    const isWeakness = f.finding_type === WEAKNESS;
    const isUnverified = f.finding_type === UNVERIFIABLE;

    const block = (title, node) => {
      const b = el("div", "fb-block");
      b.appendChild(el("h4", null, title));
      b.appendChild(node);
      body.appendChild(b);
    };

    if (f.description) {
      block(isWeakness ? "What the architecture does"
            : isUnverified ? "What could not be established"
            : "What is missing or unclear",
            el("p", null, f.description));
    }
    if (f.evidence) block("What in the material shows this", el("div", "evidence", f.evidence));
    if (f.good_practice && !/^not applicable/i.test(f.good_practice)) {
      block("The practice at stake", el("p", "practice", f.good_practice));
    }
    if (f.why_it_matters) {
      block(isWeakness ? "Why it matters" : "Why it matters for the review", el("p", null, f.why_it_matters));
    }

    // GAPF proposes options and names their type; it does not choose between
    // them. Presented as a list rather than an ordered instruction.
    if (arr(f.treatment_options).length) {
      const rec = el("div", "fb-block rec");
      rec.appendChild(el("h4", null, isWeakness ? "Treatment options to choose between" : "Options for closing this"));
      const ul = el("ul", "bullets");
      arr(f.treatment_options).forEach((t) => {
        const li = el("li");
        if (t.treatment_type) li.appendChild(el("span", "pill pill-treat", t.treatment_type));
        li.appendChild(document.createTextNode(t.option || ""));
        if (t.note) li.appendChild(el("span", "treat-note", t.note));
        ul.appendChild(li);
      });
      rec.appendChild(ul);
      body.appendChild(rec);
    }

    // The §4 hand-off rule made visible: every finding names the gap it came
    // from and how firmly it is tied to evidence and to a requirement.
    const lk = f.linkage || {};
    if (f.source_gap || lk.evidence_linkage || lk.requirement_linkage) {
      const b = el("div", "fb-block linkage");
      b.appendChild(el("h4", null, "How this finding is grounded"));
      const dl = el("dl", "kv");
      const row = (label, value) => {
        if (!value) return;
        const d = el("div", "kv-row");
        d.appendChild(el("dt", null, label));
        d.appendChild(el("dd", null, value));
        dl.appendChild(d);
      };
      row("Traces back to", f.source_gap);
      row("Evidence basis", lk.evidence_linkage);
      row("Requirement basis", lk.requirement_linkage);
      row("Confidence", lk.confidence);
      b.appendChild(dl);
      if (lk.validation_note) b.appendChild(el("p", "practice", lk.validation_note));
      body.appendChild(b);
    }

    if (f.owner) {
      const meta = el("div", "finding-meta");
      const span = el("span");
      span.appendChild(el("b", null, isWeakness ? "Owner: " : "Most likely to hold this: "));
      span.appendChild(document.createTextNode(String(f.owner)));
      meta.appendChild(span);
      body.appendChild(meta);
    }

    card.appendChild(body);
    if (f.proposed_priority === "High") card.classList.add("open");
    return card;
  }

  function applyFilter() {
    const active = state.priorityFilter;
    document.querySelectorAll(".finding").forEach((card) => {
      card.style.display = (active.size === 0 || active.has(card.dataset.priority)) ? "" : "none";
    });
  }

  // Only the questions a finding is actually waiting on. The rest of the
  // question set is review-pack material — see findingsTrace.
  function renderOpenQuestions({ questions, otherQuestions }) {
    const s = section(`Open questions these findings depend on (${questions.length})`,
      "Each question is tied to a finding above. Answering it is what lets that finding be closed, narrowed or set aside.");
    if (!questions.length) {
      s.appendChild(el("p", "empty", "No open question was tied to a finding."));
    }
    questions.forEach((q) => {
      const card = el("div", "question");
      card.appendChild(el("div", "q-text", `${q.id ? q.id + " — " : ""}${q.question || ""}`));
      card.appendChild(el("div", "q-meta",
        [q.related_artifact && q.related_artifact !== "None" && `Relates to ${q.related_artifact}`,
         q.directed_to && `For: ${q.directed_to}`, q.why_it_matters]
          .filter(Boolean).join("  ·  ")));
      s.appendChild(card);
    });
    if (otherQuestions > 0) {
      s.appendChild(el("p", "carry-note",
        `${otherQuestions} further clarification request${otherQuestions === 1 ? "" : "s"} did not trace to a finding. ` +
        `${otherQuestions === 1 ? "It is" : "They are"} in the review pack.`));
    }
    return s;
  }

  function renderNextSteps({ steps, otherSteps }) {
    const s = section(`Next steps (${steps.length})`,
      "What follows from the findings above. Each step names what it serves.");
    if (steps.length) {
      s.appendChild(table(
        ["Step", "Owner", "Serves", "When"],
        steps.map((x) => [x.step, x.owner, x.depends_on, x.sequence])
      ));
    } else {
      s.appendChild(el("p", "empty", "No next step traced to a finding."));
    }
    if (otherSteps > 0) {
      s.appendChild(el("p", "carry-note",
        `${otherSteps} further step${otherSteps === 1 ? "" : "s"} relate to evidence conflicts and review housekeeping ` +
        `rather than to a finding. ${otherSteps === 1 ? "It is" : "They are"} in the review pack.`));
    }
    return s;
  }

  // The working record is a download, not a scroll. Say plainly what is in it
  // so nobody assumes the screen is the whole review.
  function renderReviewPackCard(r, { otherQuestions, otherSteps }) {
    const ev = r.evidence_validation || {};
    const eb = r.evidence_base || {};
    const s = section("The rest of the review",
      "Everything the findings above were built from is in the review pack. It is not shown here — download it.");

    const held = [
      arr(r.domain_assessments).length && `Control assessment across ${arr(r.domain_assessments).length} domains`,
      arr(r.candidate_gaps).length && `${arr(r.candidate_gaps).length} candidate gaps, each the origin of a finding`,
      arr(ev.gap_register).length && "The six minimum requested inputs, one row each",
      arr(eb.source_register).length && `Evidence source register (${arr(eb.source_register).length} sources, files and links)`,
      r.intake_determination && "Intake determination — applicability, review depth, solution class",
      (eb.summary || arr(eb.component_inventory).length) && "The architecture as understood from the submission",
      r.requirements_basis && "What the review was assessed against",
      arr(ev.conflict_register).length && `${arr(ev.conflict_register).length} conflicts between sources`,
      arr(ev.clarification_requests).length && `The full question set (${arr(ev.clarification_requests).length})`,
      r.human_review_gate && "Human review gate — the decisions reserved to the Security Architect",
      arr(r.next_steps).length && `The full next-step list (${arr(r.next_steps).length})`,
      arr(r.use_case_coverage).length && `Use-case coverage across all ${arr(r.use_case_coverage).length} use cases`,
      r.executive_summary && "Executive and technical summaries",
    ].filter(Boolean);
    s.appendChild(bulletList(held));

    if (otherQuestions > 0 || otherSteps > 0) {
      const carried = [
        otherQuestions > 0 && `${otherQuestions} question${otherQuestions === 1 ? "" : "s"}`,
        otherSteps > 0 && `${otherSteps} step${otherSteps === 1 ? "" : "s"}`,
      ].filter(Boolean).join(" and ");
      const plural = otherQuestions + otherSteps === 1;
      s.appendChild(el("p", "carry-note",
        `${carried} that did not trace to a finding ${plural ? "is" : "are"} held there too.`));
    }

    const actions = el("div", "pack-actions");
    const btn = el("button", "btn btn-primary", "Download the review pack PDF");
    btn.type = "button";
    btn.addEventListener("click", () => exportPdf(buildReviewPdf, "review-pack"));
    actions.appendChild(btn);
    const json = el("button", "btn", "Download the full JSON");
    json.type = "button";
    json.addEventListener("click", () => $("jsonBtn").click());
    actions.appendChild(json);
    s.appendChild(actions);
    return s;
  }

  // ======================================================================
  // Export
  // ======================================================================

  $("jsonBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.report, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${fileStem()}.json`);
  });

  // Two deliverables, not one. The findings pack is what goes to the delivery
  // team: the issues, the questions those issues are waiting on, and what to do
  // next. The review pack is the working record behind it.
  function exportPdf(build, suffix) {
    const jsPDFCtor = window.jspdf?.jsPDF;
    if (!jsPDFCtor) {
      alert("The PDF library did not load (offline?). Using the browser's print dialog instead — choose 'Save as PDF'.");
      window.print();
      return;
    }
    try {
      const doc = new jsPDFCtor({ unit: "pt", format: "a4" });
      build(doc);
      doc.save(`${fileStem()}-${suffix}.pdf`);
    } catch (err) {
      console.error(err);
      alert("PDF generation failed, falling back to the print dialog.");
      window.print();
    }
  }

  $("findingsPdfBtn").addEventListener("click", () => exportPdf(buildFindingsPdf, "findings"));
  $("fullPdfBtn").addEventListener("click", () => exportPdf(buildReviewPdf, "review-pack"));

  function fileStem() {
    const name = state.report?.application_profile?.name || "application";
    const date = new Date().toISOString().slice(0, 10);
    return `sar-step1-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${date}`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // jsPDF's built-in fonts are Latin-1 only: an em dash or a curly quote is
  // silently dropped, which mangles sentences. Transliterate what we can and
  // discard the rest before anything reaches the page.
  const PDF_SUBS = [
    [/[\u2018\u2019\u201A\u201B\u2032]/g, "'"],
    [/[\u201C\u201D\u201E\u201F\u2033]/g, '"'],
    [/[\u2013\u2014\u2015\u2212]/g, "-"],
    [/\u2026/g, "..."],
    [/[\u2192\u21D2]/g, "->"],
    [/[\u2190\u21D0]/g, "<-"],
    [/[\u2022\u25CF\u25AA\u25E6\u2043]/g, "-"],
    [/[\u00A0\u2007\u202F\u2009\u200A]/g, " "],
    [/\u200B/g, ""],
    [/\u2264/g, "<="],
    [/\u2265/g, ">="],
    [/\u2260/g, "!="],
    [/[\u2713\u2714]/g, "[x]"],
    [/[\u2717\u2718]/g, "[ ]"],
    [/\u2122/g, "(TM)"],
  ];

  const pdfSafe = (value) => {
    let out = String(value ?? "");
    for (const [pattern, replacement] of PDF_SUBS) out = out.replace(pattern, replacement);
    return out.replace(/[^\t\n\r\x20-\x7E\xA1-\xFF]/g, "");
  };

  const PDF_COLOURS = {
    High: [200, 30, 40], Medium: [214, 110, 20], Low: [40, 120, 190],
  };

  // --------------------------------------------------------------------
  // A shared page engine. Both documents draw through the same primitives,
  // so the findings pack and the review pack cannot drift apart in look.
  // --------------------------------------------------------------------
  function pdfKit(doc) {
    const M = 48;                       // margin
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const CW = W - M * 2;               // content width
    let y = M;

    // Sanitize at the boundary so every call site is covered, including line
    // measurement — otherwise widths are computed for characters that get dropped.
    const rawText = doc.text.bind(doc);
    const rawSplit = doc.splitTextToSize.bind(doc);
    doc.text = (str, x, ty, opts) =>
      rawText(Array.isArray(str) ? str.map(pdfSafe) : pdfSafe(str), x, ty, opts);
    doc.splitTextToSize = (str, width, opts) => rawSplit(pdfSafe(str), width, opts);

    const space = (need) => {
      if (y + need > H - M - 24) { doc.addPage(); y = M; }
    };

    const text = (str, { size = 10, style = "normal", colour = [40, 45, 55], gap = 4, indent = 0 } = {}) => {
      if (str == null || str === "") return;
      doc.setFont("helvetica", style).setFontSize(size).setTextColor(...colour);
      const lines = doc.splitTextToSize(String(str), CW - indent);
      for (const line of lines) {
        space(size + 2);
        doc.text(line, M + indent, y);
        y += size + 2.5;
      }
      y += gap;
    };

    const heading = (str) => {
      space(40);
      y += 8;
      doc.setDrawColor(220, 224, 230).setLineWidth(0.7);
      doc.line(M, y - 10, W - M, y - 10);
      text(str.toUpperCase(), { size: 11, style: "bold", colour: [25, 30, 40], gap: 8 });
    };

    const subhead = (str) => text(str, { size: 9.5, style: "bold", colour: [30, 36, 48], gap: 3 });

    const note = (str) => text(str, { size: 9, style: "italic", colour: [130, 138, 150], gap: 6 });

    const bullets = (items, empty) => {
      const list = arr(items);
      if (!list.length) { if (empty) text(empty, { size: 9, style: "italic", colour: [130, 138, 150] }); return; }
      list.forEach((item) => {
        space(16);
        doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(70, 78, 90);
        doc.text("•", M + 4, y);
        const lines = doc.splitTextToSize(String(item), CW - 18);
        lines.forEach((line, i) => {
          if (i > 0) space(12);
          doc.text(line, M + 14, y);
          y += 12;
        });
        y += 2;
      });
      y += 4;
    };

    const labelled = (label, value, indent = 0) => {
      if (!value) return;
      text(label, { size: 8.5, style: "bold", colour: [110, 118, 132], gap: 1, indent });
      text(value, { size: 9.5, colour: [70, 78, 90], gap: 6, indent });
    };

    // The dark banner both documents open on. `big` is the one number the
    // reader should take away — findings raised, or package completeness.
    const cover = ({ strapline, name, metaLine, bigValue, bigLabel, bigSub }) => {
      doc.setFillColor(13, 17, 23).rect(0, 0, W, 150, "F");
      doc.setFont("helvetica", "bold").setFontSize(19).setTextColor(255, 255, 255);
      doc.text("Security Architecture Review", M, 58);
      doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(120, 140, 170);
      doc.text(strapline, M, 76);
      doc.setFontSize(13).setTextColor(150, 165, 185);
      doc.text(doc.splitTextToSize(name, CW - 130), M, 100);
      doc.setFontSize(9).setTextColor(120, 132, 150);
      doc.text(metaLine, M, 126);

      doc.setFont("helvetica", "bold").setFontSize(34).setTextColor(255, 255, 255);
      doc.text(String(bigValue), W - M, 76, { align: "right" });
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(150, 165, 185);
      doc.text(bigLabel, W - M, 92, { align: "right" });
      doc.setFontSize(9).setTextColor(190, 205, 225);
      doc.text(bigSub || "", W - M, 108, { align: "right" });

      y = 186;
    };

    const priorityChips = (findings) => {
      const counts = PRIORITIES
        .map((p) => [p, findings.filter((f) => f.proposed_priority === p).length])
        .filter(([, n]) => n > 0);
      if (!counts.length) return;
      space(30);
      let x = M;
      counts.forEach(([prio, n]) => {
        const label = `${n} ${prio} proposed`;
        const w = doc.getTextWidth(label) + 18;
        doc.setFillColor(...PDF_COLOURS[prio]).roundedRect(x, y - 9, w, 17, 4, 4, "F");
        doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(255, 255, 255);
        doc.text(label, x + 9, y + 2.5);
        x += w + 7;
      });
      y += 26;
    };

    const findingCard = (f) => {
      space(90);
      const colour = PDF_COLOURS[f.proposed_priority] || PDF_COLOURS.Low;

      const titleLines = doc.setFont("helvetica", "bold").setFontSize(11)
        .splitTextToSize(`${f.id || ""}  ${f.title || ""}`, CW - 14);
      const barTop = y - 10;

      doc.setTextColor(25, 30, 40);
      titleLines.forEach((line) => { doc.text(line, M + 12, y); y += 14; });
      doc.setFillColor(...colour).rect(M, barTop, 4, Math.max(14, y - barTop - 4), "F");
      y += 2;

      const isWeakness = f.finding_type === WEAKNESS;
      const isUnverified = f.finding_type === UNVERIFIABLE;

      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...colour);
      doc.text([`${f.proposed_priority || ""} priority proposed`, f.finding_type, f.area].filter(Boolean).join("   ·   "), M + 12, y);
      y += 14;

      labelled(isWeakness ? "What the architecture does"
               : isUnverified ? "What could not be established"
               : "What is missing or unclear", f.description, 12);
      labelled("What in the material shows this", f.evidence, 12);
      if (f.good_practice && !/^not applicable/i.test(f.good_practice)) {
        labelled("The practice at stake", f.good_practice, 12);
      }
      labelled(isWeakness ? "Why it matters" : "Why it matters for the review", f.why_it_matters, 12);
      if (arr(f.treatment_options).length) {
        text(isWeakness ? "Treatment options to choose between" : "Options for closing this",
          { size: 8.5, style: "bold", colour: [110, 118, 132], gap: 1, indent: 12 });
        arr(f.treatment_options).forEach((t) => {
          text(`[${t.treatment_type || "Option"}] ${t.option || ""}` + (t.note ? ` - ${t.note}` : ""),
            { size: 9.5, colour: [60, 68, 80], gap: 2, indent: 22 });
        });
        y += 4;
      }
      const lk = f.linkage || {};
      const grounding = [
        f.source_gap && `Traces back to ${f.source_gap}`,
        lk.evidence_linkage, lk.requirement_linkage,
        lk.confidence && `Confidence: ${lk.confidence}`,
      ].filter(Boolean).join("   ·   ");
      if (grounding) labelled("How this finding is grounded", grounding, 12);
      if (f.owner) {
        text(`${isWeakness ? "Owner" : "Most likely to hold this"}: ${f.owner}`,
          { size: 8.5, colour: [130, 138, 150], gap: 10, indent: 12 });
      }
      y += 6;
    };

    const footers = (strip) => {
      const pages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(150, 158, 170);
        doc.text(state.meta && state.meta.demo
          ? "SAMPLE REPORT — illustrative data for a fictional application. No review was performed."
          : strip,
          M, H - 22);
        doc.text(`${i} / ${pages}`, W - M, H - 22, { align: "right" });
      }
    };

    return { text, heading, subhead, note, bullets, labelled, space, cover, priorityChips, findingCard, footers };
  }

  // Shared cover facts, so the two documents describe the same solution the
  // same way.
  function pdfCoverMeta() {
    const profile = state.report.application_profile || {};
    return {
      name: profile.name || "Application",
      metaLine: [profile.application_type,
                 profile.internet_facing && `Internet facing: ${profile.internet_facing}`,
                 new Date().toLocaleDateString(undefined, { dateStyle: "long" })]
                .filter(Boolean).join("   ·   "),
    };
  }

  // Which questions and next steps belong to the findings pack. A question
  // belongs if it serves a finding, either directly or through the gap the
  // finding came from; a step belongs if it serves a finding or one of those
  // questions. Everything else is review-pack material.
  function findingsTrace(r) {
    const findings = arr(r.candidate_findings);
    const findingIds = new Set(findings.map((f) => f.id).filter(Boolean));

    const gapStandsForFinding = new Set(
      arr(r.candidate_gaps)
        .filter((g) => g.id && findingIds.has(g.becomes_finding))
        .map((g) => g.id)
    );
    const tiesToFinding = (ref) => !!ref && (findingIds.has(ref) || gapStandsForFinding.has(ref));

    const allQuestions = arr((r.evidence_validation || {}).clarification_requests);
    const questions = allQuestions.filter((q) => tiesToFinding(q.related_artifact));
    const questionIds = new Set(questions.map((q) => q.id).filter(Boolean));

    const allSteps = arr(r.next_steps);
    const steps = allSteps.filter((s) => tiesToFinding(s.depends_on) || questionIds.has(s.depends_on));

    return {
      findings, questions, steps,
      otherQuestions: allQuestions.length - questions.length,
      otherSteps: allSteps.length - steps.length,
    };
  }

  const stepSuffix = (x) =>
    [x.owner && `owner: ${x.owner}`, x.sequence, x.depends_on && x.depends_on !== "None" && `depends on ${x.depends_on}`]
      .filter(Boolean).map((s) => ` [${s}]`).join("");

  // ======================================================================
  // Document 1 — the findings pack
  // ======================================================================

  function buildFindingsPdf(doc) {
    const r = state.report;
    const k = pdfKit(doc);
    const { name, metaLine } = pdfCoverMeta();
    const { findings, questions, steps, otherQuestions, otherSteps } = findingsTrace(r);

    k.cover({
      strapline: "Findings pack - candidate findings, open questions and next steps",
      name, metaLine,
      bigValue: findings.length,
      bigLabel: findings.length === 1 ? "candidate finding" : "candidate findings",
      bigSub: "pending Security Architect review",
    });

    k.heading("What this document is");
    k.text("This is the findings pack from Step 1 of the Security Architecture Review - the review of the submitted materials. It carries three things and nothing else: the issues raised against the architecture package, the open questions those issues are waiting on, and the next steps that follow from them.",
      { size: 10 });
    k.text("Every issue here is a candidate. The priority shown is a proposal. Severity, risk acceptance and final disposition are set by the Security Architect, not by this review. The working record behind these findings - the evidence read, the control assessment by domain, the intake determination and the rest - is in the accompanying review pack.",
      { size: 10 });
    k.priorityChips(findings);

    // --- findings ---------------------------------------------------------
    k.heading(`Candidate findings (${findings.length})`);
    if (!findings.length) {
      k.text("No candidate findings were raised - the submitted package was complete and the architecture it describes held up against review.",
        { style: "italic" });
    }
    findings.forEach(k.findingCard);

    // --- open questions ---------------------------------------------------
    k.heading(`Open questions these findings depend on (${questions.length})`);
    if (questions.length) {
      k.note("Each question below is tied to a finding above. Answering it is what lets that finding be closed, narrowed or set aside.");
      questions.forEach((q) => {
        k.space(40);
        k.text(`${q.id ? q.id + "  " : ""}${q.question || ""}`,
          { size: 10, style: "bold", colour: [30, 36, 48], gap: 2 });
        k.text([q.related_artifact && q.related_artifact !== "None" && `Relates to ${q.related_artifact}`,
                q.directed_to && `For: ${q.directed_to}`,
                q.why_it_matters].filter(Boolean).join("   ·   "),
          { size: 9, colour: [110, 118, 132], gap: 8 });
      });
    } else {
      k.text("No open question was tied to a finding.", { style: "italic" });
    }
    if (otherQuestions > 0) {
      k.note(`${otherQuestions} further clarification request${otherQuestions === 1 ? "" : "s"} did not trace to a finding and ${otherQuestions === 1 ? "is" : "are"} recorded in the review pack.`);
    }

    // --- next steps -------------------------------------------------------
    k.heading(`Next steps (${steps.length})`);
    if (steps.length) {
      k.note("Ordered as the review needs them. Each step names what it serves.");
      k.bullets(steps.map((x) => `${x.step}${stepSuffix(x)}`));
    } else {
      k.text("No next step traced to a finding.", { style: "italic" });
    }
    if (otherSteps > 0) {
      k.note(`${otherSteps} further step${otherSteps === 1 ? "" : "s"} relate to evidence conflicts and review housekeeping rather than to a finding, and ${otherSteps === 1 ? "is" : "are"} recorded in the review pack.`);
    }

    k.footers("Security Architecture Review, Step 1 — candidate findings. Severity and disposition are the Security Architect's to set.");
  }

  // ======================================================================
  // Document 2 — the review pack
  // ======================================================================

  function buildReviewPdf(doc) {
    const r = state.report;
    const k = pdfKit(doc);
    const { name, metaLine } = pdfCoverMeta();
    const profile = r.application_profile || {};
    const readiness = (r.evidence_validation || {}).sufficiency || {};
    const score = Math.max(0, Math.min(100, Number(readiness.completeness_score) || 0));

    k.cover({
      strapline: "Review pack - the working record behind the findings",
      name, metaLine,
      bigValue: score,
      bigLabel: "package completeness / 100",
      bigSub: readiness.rating || "",
    });

    k.heading("What this document is");
    k.text("This is the working record from Step 1 of the Security Architecture Review: what was submitted, what was read, what was assessed against what, and what the agent could not establish. The findings themselves are set out in the accompanying findings pack; they are listed here only as an index, so that each section below can be traced to the finding it produced.",
      { size: 10 });

    // --- findings index ----------------------------------------------------
    const findings = arr(r.candidate_findings);
    if (findings.length) {
      k.heading(`Findings index (${findings.length})`);
      k.priorityChips(findings);
      k.bullets(findings.map((f) =>
        `${f.id || ""} [${f.proposed_priority || "-"}] ${f.title || ""}` +
        (f.source_gap ? ` (from ${f.source_gap})` : "")));
    }

    // --- evidence sufficiency ----------------------------------------------
    k.heading("Evidence sufficiency");
    k.text(readiness.rationale, { size: 10.5 });
    if (arr(readiness.blocking_items).length) {
      k.subhead("Must be resolved before the review proceeds");
      k.bullets(readiness.blocking_items);
    }
    if (arr(readiness.quality_concerns).length) {
      k.subhead("Concerns about the quality of the evidence itself");
      k.bullets(readiness.quality_concerns);
    }

    // --- executive summary --------------------------------------------------
    const exec = r.executive_summary;
    if (exec) {
      k.heading("Executive summary");
      k.text(exec.headline, { size: 11, style: "bold", colour: [25, 30, 40], gap: 6 });
      k.text(exec.narrative, { size: 10 });
      k.bullets(exec.key_points);
      k.labelled("Decision the Security Architect is being asked to take", exec.decision_required);
      k.labelled("Proposed disposition", exec.recommended_disposition);
    }

    // --- how the architecture holds up -------------------------------------
    const assess = r.technical_summary;
    if (assess) {
      k.heading("How the architecture holds up");
      k.text(assess.summary, { size: 10 });
      if (arr(assess.strengths).length) {
        k.subhead("Sound by design");
        k.bullets(assess.strengths);
      }
      if (arr(assess.areas_of_concern).length) {
        k.subhead("Areas of concern");
        k.bullets(assess.areas_of_concern);
      }
      if (arr(assess.not_assessable).length) {
        k.subhead("Could not be assessed from the material");
        k.bullets(assess.not_assessable);
      }
    }

    // --- control assessment by domain --------------------------------------
    if (arr(r.domain_assessments).length) {
      k.heading("Control assessment by domain");
      arr(r.domain_assessments).forEach((d) => {
        k.space(70);
        k.text(`${d.domain}  -  ${d.status || "Unknown"}`,
          { size: 10, style: "bold", colour: [30, 36, 48], gap: 3 });
        k.text(d.summary, { size: 9.5, colour: [70, 78, 90], gap: 3 });
        if (arr(d.sound_by_design).length) {
          k.text("Sound by design", { size: 8.5, style: "bold", colour: [110, 118, 132], gap: 1, indent: 10 });
          k.bullets(d.sound_by_design);
        }
        if (arr(d.concerns).length) {
          k.text("Concerns", { size: 8.5, style: "bold", colour: [110, 118, 132], gap: 1, indent: 10 });
          k.bullets(d.concerns);
        }
        k.labelled("Uncertainty", d.uncertainty, 10);
      });
    }

    // --- candidate gaps ----------------------------------------------------
    if (arr(r.candidate_gaps).length) {
      k.heading("Candidate gaps");
      k.note("Each gap is the difference between what good practice expects and what the evidence shows. Every finding traces back to one.");
      arr(r.candidate_gaps).forEach((g) => {
        k.space(50);
        k.text(`${g.id || ""}  ${g.domain || ""}  -  ${g.gap_type || ""}`,
          { size: 9.5, style: "bold", colour: [30, 36, 48], gap: 2 });
        k.labelled("Expected", g.expected, 10);
        k.labelled("Observed", g.observed, 10);
        k.labelled("Raised as", g.becomes_finding, 10);
      });
    }

    // --- the six requested inputs ----------------------------------------
    k.heading("The six minimum requested inputs");
    k.note("Every input is optional to submit. Anything not provided - including anything referenced only by link - is recorded below and raised as a candidate finding.");
    arr((r.evidence_validation || {}).gap_register).forEach((c) => {
      k.space(60);
      k.text(`${c.input_name}  -  ${c.status || "Unknown"}`,
        { size: 10, style: "bold", colour: [30, 36, 48], gap: 3 });
      k.labelled("Submitted", c.what_was_submitted, 10);
      k.labelled("Missing", c.what_is_missing, 10);
      k.labelled("Impact on the review", c.impact_on_review, 10);
    });

    // --- evidence source register ------------------------------------------
    const eb = r.evidence_base || {};
    if (arr(eb.source_register).length) {
      k.heading("Evidence source register");
      k.bullets(arr(eb.source_register).map((x) =>
        `${x.input_name}: ${x.source_type}` +
        (x.source_location ? ` (${x.source_location})` : "") +
        ` - ${x.retrieval_status}` +
        (x.what_it_establishes ? `. ${x.what_it_establishes}` : "")));
    }

    // --- intake determination ----------------------------------------------
    const intake = r.intake_determination;
    if (intake) {
      const app = intake.sar_applicability || {};
      const path = intake.review_path || {};
      const cls = intake.solution_classification || {};
      k.heading("Intake determination");
      k.labelled("Does a review apply?", [app.determination, app.rationale].filter(Boolean).join(" - "));
      k.labelled("How deep?", [path.path, path.rationale].filter(Boolean).join(" - "));
      k.labelled("What kind of solution?",
        [cls.solution_type, cls.delivery_model, cls.hosting_class, cls.classification_note].filter(Boolean).join(" - "));
      if (arr(intake.required_evidence).length) {
        k.subhead("Evidence this solution type calls for");
        k.bullets(arr(intake.required_evidence).map((x) =>
          `${x.artifact} [${x.priority}] - ${x.why_required}`));
      }
    }

    // --- solution profile -------------------------------------------------
    k.heading("Solution profile");
    k.labelled("What it does", profile.purpose);
    k.labelled("Type", profile.application_type);
    k.labelled("Internet facing", profile.internet_facing);
    k.labelled("Hosting", profile.hosting_summary);
    k.labelled("Environment scope", profile.environment_scope);
    k.labelled("Data sensitivity", profile.data_sensitivity);
    k.labelled("Business criticality", profile.business_criticality);
    k.labelled("Regulatory context", profile.regulatory_context);

    // --- evidence base -----------------------------------------------------
    k.heading("The architecture as understood from the submission");
    k.text(eb.summary, { size: 10 });

    if (arr(eb.component_inventory).length) {
      k.subhead("Components");
      k.bullets(arr(eb.component_inventory).map((c) =>
        `${c.name} - ${c.purpose} [technology: ${c.technology}; zone: ${c.zone}; sensitive data: ${c.handles_sensitive_data}]` +
        (c.notes ? ` Note: ${c.notes}` : "")));
    }
    if (arr(eb.flow_register).length) {
      k.subhead("Data flows");
      k.bullets(arr(eb.flow_register).map((f) =>
        `${f.source} -> ${f.destination}: ${f.data_description}; protocol: ${f.protocol}; ` +
        `auth: ${f.authentication}; crosses a trust boundary: ${f.crosses_trust_boundary}`));
    }
    if (arr(eb.trust_boundaries).length) {
      k.subhead("Trust boundaries");
      k.bullets(arr(eb.trust_boundaries).map((b) => `${b.name} - ${b.description} (${b.how_established})`));
    }
    if (arr(eb.identity_and_access).length) {
      k.subhead("Identity and access, by actor class");
      k.bullets(arr(eb.identity_and_access).map((i) => `${i.actor_class} [${i.status}] - ${i.approach}`));
    }
    if (arr(eb.integrations).length) {
      k.subhead("Integrations and dependencies");
      k.bullets(arr(eb.integrations).map((i) =>
        `${i.name} - ${i.purpose}; data exchanged: ${i.data_exchanged}` + (i.notes ? `. ${i.notes}` : "")));
    }
    if (arr(eb.stated_controls).length) {
      k.subhead("Controls the material claims");
      k.bullets(arr(eb.stated_controls).map((c) =>
        `${c.control} [${c.domain}] - stated in ${c.stated_in}; evidence: ${c.evidence_strength}`));
    }
    k.labelled("Hosting and deployment", eb.hosting_and_deployment);
    if (arr(eb.normalized_facts).length) {
      k.subhead("Normalized fact base");
      k.bullets(arr(eb.normalized_facts).map((f) =>
        `${f.fact_id ? f.fact_id + " " : ""}${f.fact} [${f.domain}] - from ${f.source} (${f.certainty})`));
    }

    // --- what this was assessed against -------------------------------------
    const rb = r.requirements_basis;
    if (rb) {
      k.heading("What this was assessed against");
      k.text(rb.retrieval_note, { size: 9.5, colour: [70, 78, 90] });
      if (arr(rb.applicable_requirements).length) {
        k.subhead("Requirements taken to apply");
        k.bullets(arr(rb.applicable_requirements).map((x) =>
          `${x.requirement} [${x.domain}] - ${x.source} (${x.authority})`));
      }
      if (arr(rb.reference_guidance).length) {
        k.subhead("Reference patterns considered");
        k.bullets(arr(rb.reference_guidance).map((x) => `${x.pattern} - ${x.relevance} (${x.conformance})`));
      }
    }

    // --- conflicts ----------------------------------------------------------
    const ev = r.evidence_validation || {};
    if (arr(ev.conflict_register).length) {
      k.heading("Conflicts between sources");
      arr(ev.conflict_register).forEach((c) => {
        k.space(50);
        k.text(`${c.id ? c.id + "  " : ""}${c.topic || ""}  -  ${c.significance || ""}`,
          { size: 10, style: "bold", colour: [30, 36, 48], gap: 2 });
        k.labelled("One source says", c.source_a, 10);
        k.labelled("The other says", c.source_b, 10);
        k.labelled("To resolve", c.resolution_needed, 10);
      });
    }

    // --- clarification requests ---------------------------------------------
    if (arr(ev.clarification_requests).length) {
      k.heading(`Clarification requests for the team (${arr(ev.clarification_requests).length})`);
      k.note("The complete question set, including the ones carried in the findings pack.");
      arr(ev.clarification_requests).forEach((q) => {
        k.space(40);
        k.text(`${q.id ? q.id + "  " : ""}${q.question || ""}`,
          { size: 10, style: "bold", colour: [30, 36, 48], gap: 2 });
        k.text([q.directed_to && `For: ${q.directed_to}`, q.why_it_matters,
                q.related_artifact && q.related_artifact !== "None" && `Relates to ${q.related_artifact}`]
               .filter(Boolean).join("   ·   "),
          { size: 9, colour: [110, 118, 132], gap: 8 });
      });
    }

    // --- human review gate ---------------------------------------------------
    const gate = r.human_review_gate;
    if (gate) {
      k.heading("Human review gate");
      k.note("The agent stops here. Everything below is reserved to the Security Architect.");
      k.subhead("Decisions the architect must take");
      k.bullets(gate.decisions_required, "None recorded.");
      k.subhead("Evidence worth validating first");
      k.bullets(gate.material_evidence_to_validate, "None recorded.");
      k.subhead("What this review did not do");
      k.bullets(gate.not_performed, "None recorded.");
    }

    // --- closing -----------------------------------------------------------
    k.heading("Assumptions & the full next-step list");
    k.subhead("Assumptions made");
    k.bullets(r.assumptions, "None stated.");
    k.subhead("Next steps");
    k.note("The complete list, including the finding-linked steps carried in the findings pack.");
    k.bullets(arr(r.next_steps).map((x) => `${x.step}${stepSuffix(x)}`), "None recorded.");

    // --- use-case coverage ---------------------------------------------------
    if (arr(r.use_case_coverage).length) {
      const byId = {};
      arr(r.use_case_coverage).forEach((c) => { byId[c.use_case_id] = c; });
      const done = USE_CASES.filter(([id]) => (byId[id] || {}).status === "Executed").length;
      k.heading(`Use-case coverage (${done} of ${USE_CASES.length} executed)`);
      k.bullets(USE_CASES.map(([id, useCase, agent, artifact]) => {
        const c = byId[id] || {};
        return `${id} ${useCase} [${AGENTS[agent] || agent} -> ${artifact}]: ${c.status || "Not recorded"}` +
               (c.note ? ` - ${c.note}` : "");
      }));
    }

    if (r.reviewer_note) {
      k.heading("Scope of this review");
      k.text(r.reviewer_note, { size: 9.5, colour: [70, 78, 90] });
    }

    k.footers("Security Architecture Review, Step 1 — review pack. Architecture-level review of the submitted materials; not a configuration review, threat model or test.");
  }

  // ======================================================================

  // The header wraps at narrow widths; keep the sticky export bar clear of it.
  const topbar = document.querySelector(".topbar");
  new ResizeObserver(() => {
    // offsetHeight, not contentRect: the header has padding that must be counted.
    document.documentElement.style.setProperty("--topbar-h", `${topbar.offsetHeight}px`);
  }).observe(topbar);

  checkKey();
  renderFileLists();
})();
