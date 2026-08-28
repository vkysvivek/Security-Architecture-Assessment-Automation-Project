"""JSON Schema for the SAR Agentic AI MVP — Step 1 review of submitted materials.

Passed to the Messages API as
`output_config={"format": {"type": "json_schema", "schema": REPORT_SCHEMA}}`,
which constrains the model to emit exactly this shape.

Structured-output constraints this file must respect:
  - every object needs "additionalProperties": false
  - every property must be listed in "required"
  - no recursion, no $ref cycles
  - no numeric/string constraints (minimum, maxLength, pattern, format, ...)

ALIGNMENT WITH SAR_Agentic_MVP_v0.3
-----------------------------------
The document defines eight reusable agents and thirty use cases, each use case
exporting a *named* artifact (`UC-##-OUT-##`). Its central rule is that
"no downstream use case may depend on an unnamed or implicit agent output where
a persistent business artifact is required". This schema is that rule made
enforceable: every top-level block below is a named artifact from the register
in section 6, and the `artifact_id` fields carry the canonical name through to
the report and the PDF.

  Block                       Artifact          Use case   Agent
  --------------------------  ----------------  ---------  -----
  intake_determination        01-1 .. 04-1      UC-01..04  INTK
  evidence_base               05-1 .. 09-1      UC-05..09  EXTR
  evidence_validation         10-1 .. 13-1      UC-10..13  VALD
  requirements_basis          22-1, 23-1        UC-22,23   KNOW
  domain_assessments          14-1 .. 21-1      UC-14..21  CTRL
  candidate_gaps              24-1              UC-24      GAPF
  candidate_findings          25-1, 26-1, 27-1  UC-25..27  GAPF/VALD
  technical_summary           28-1              UC-28      RPTS
  findings_package            29-1              UC-29      RPTS
  executive_summary           30-1              UC-30      RPTS
  use_case_coverage           ORCH-OUT-02       —          ORCH
  human_review_gate           section 11        —          —

Section 11 of the document is the reason nothing here is stated as a decision.
The AI assists; the human Security Architect owns validation of material
evidence, security judgment, finding approval, risk and severity determination,
and final SAR disposition. So findings are *candidate* findings, priority is a
*proposed* priority, and `human_review_gate` names what must be settled by a
person before any of it counts.

Scope ceiling (unchanged): findings live at the level of "this flow is
unencrypted" or "this data store is reachable from an untrusted network", never
"TLS 1.0 is enabled on the listener". There is deliberately nowhere in this
schema to put a configuration setting, a threat model, a CVE, a CWE or an OWASP
category.

Field names here are load-bearing: SYSTEM_PROMPT in sar_prompt.py refers to
them by name, and public/app.js renders them. Rename in all three or nowhere.
"""


def _obj(properties: dict) -> dict:
    """An object schema with every key required and nothing extra allowed."""
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties.keys()),
        "additionalProperties": False,
    }


def _str(description: str) -> dict:
    return {"type": "string", "description": description}


def _str_array(description: str) -> dict:
    return {"type": "array", "description": description, "items": {"type": "string"}}


def _enum(description: str, values: list) -> dict:
    return {"type": "string", "description": description, "enum": values}


def _array(description: str, item_properties: dict) -> dict:
    return {"type": "array", "description": description, "items": _obj(item_properties)}


# ---------------------------------------------------------------------------
# Vocabulary
# ---------------------------------------------------------------------------

# The six minimum requested inputs. The upload zones in public/index.html map
# one-to-one onto this list, in this order. Each zone now accepts either a
# local file or a document/SharePoint link, which is why SOURCE_TYPE exists.
MINIMUM_INPUTS = [
    "Architecture diagram",
    "Data flow diagram",
    "Hosting or deployment model",
    "Integrations and third-party dependencies",
    "Environment scope",
    "Identity and access approach",
]

# UC-05-OUT-02 Evidence Source Metadata Register turns on this distinction. A
# link that was named but never retrieved is not evidence, and the review must
# not treat it as though it were.
SOURCE_TYPE = [
    "Uploaded file",
    "Referenced link — not retrieved",
    "Intake record statement",
    "Not supplied",
]

RETRIEVAL_STATUS = [
    "Retrieved and read",
    "Referenced only — contents not available to this review",
    "Nothing supplied",
]

PRIORITY = ["High", "Medium", "Low"]
INPUT_STATUS = ["Provided", "Partially provided", "Not provided"]

# A finding is one of three things, and the reader needs to know which at a
# glance: a security weakness the material actually shows, a requested input
# that never arrived, or a security-relevant property the material leaves
# undetermined. The third is the honest middle ground — it stops the model
# either inventing a weakness or staying silent about a real concern.
FINDING_TYPE = [
    "Architecture weakness",
    "Missing or incomplete input",
    "Unverifiable from the material",
]

# The eight control-assessment domains of UC-14..UC-21, named as the document
# names them. Replaces the previous twelve free-standing areas: every one of
# those twelve falls inside one of these eight.
CONTROL_DOMAINS = [
    "Identity and access management",
    "Data protection and encryption",
    "Network and trust boundary",
    "Logging, monitoring and detection",
    "Resilience, recovery and availability",
    "Cloud, SaaS and platform",
    "Secrets, keys and credential management",
    "Secure development and vulnerability management",
]

# UC-14..21 export 14-1..21-1 in the same order as CONTROL_DOMAINS above.
DOMAIN_ARTIFACT_IDS = [f"UC-{n}-OUT-01" for n in range(14, 22)]

# A weakness finding is filed against a control domain; a missing-input finding
# against the input it concerns.
FINDING_AREA = MINIMUM_INPUTS + CONTROL_DOMAINS + [
    "Business or regulatory context",
    "General",
]

# UC-12-OUT-01 Evidence Sufficiency & Quality Assessment carries this rating.
SUFFICIENCY = [
    "Sufficient to proceed",
    "Sufficient with gaps",
    "Insufficient — evidence required before assessment",
]

# UC-14..21 domain records carry an assessment status plus an explicit
# uncertainty statement. "Not assessable" is a first-class outcome: thin
# evidence must never read as a clean bill of health.
DOMAIN_STATUS = [
    "Assessed — no concern evidenced",
    "Assessed — concerns raised",
    "Partially assessed",
    "Not assessable from the submitted evidence",
]

CONFIDENCE = ["High", "Medium", "Low"]

# UC-26-OUT-01 Candidate Remediation & Treatment Option Set. The document says
# "remediation / treatment options" — plural, and treatment is broader than fix.
TREATMENT_TYPE = [
    "Remediate",
    "Redesign",
    "Mitigate",
    "Transfer or contractual",
    "Clarify before deciding",
    "Recommend risk acceptance",
]

# UC-27-OUT-01 Finding Evidence / Requirement Validation Record. Every
# candidate finding must survive this check before a human sees it.
EVIDENCE_LINKAGE = [
    "Directly evidenced in submitted material",
    "Inferred from submitted material",
    "Based on the absence of material",
]

REQUIREMENT_LINKAGE = [
    "Linked to a stated requirement or regulatory context",
    "Linked to general security architecture practice",
    "No applicable requirement source available to this review",
]

# ORCH-OUT-02 Workflow State. Reported per use case so the reader can see which
# of the thirty this run could actually execute, and why the rest could not.
USE_CASE_STATUS = [
    "Executed",
    "Partially executed",
    "Not executed — required input unavailable",
    "Not executed — reserved for human decision",
]

# The thirty use cases of section 7, with their primary agent and export. Held
# here so the prompt, the report and public/app.js all name them identically.
# (id, name, primary agent, supporting agents, export artifact)
USE_CASES = [
    ("UC-01", "Determine whether SAR is required", "INTK", "ORCH, KNOW", "UC-01-OUT-01"),
    ("UC-02", "Determine SAR review path / depth", "INTK", "ORCH, KNOW", "UC-02-OUT-01"),
    ("UC-03", "Classify solution / technology type", "INTK", "EXTR, KNOW", "UC-03-OUT-01"),
    ("UC-04", "Identify required SAR evidence and artifacts", "INTK", "KNOW", "UC-04-OUT-01"),
    ("UC-05", "Ingest submitted SAR documentation", "EXTR", "ORCH", "UC-05-OUT-01, UC-05-OUT-02"),
    ("UC-06", "Extract architecture components and technologies", "EXTR", "KNOW", "UC-06-OUT-01"),
    ("UC-07", "Extract data flows, interfaces, trust relationships", "EXTR", "VALD", "UC-07-OUT-01"),
    ("UC-08", "Extract stated security controls and safeguards", "EXTR", "CTRL", "UC-08-OUT-01"),
    ("UC-09", "Normalize evidence into assessment-ready facts", "EXTR", "VALD", "UC-09-OUT-01"),
    ("UC-10", "Identify missing required evidence", "VALD", "KNOW", "UC-10-OUT-01"),
    ("UC-11", "Detect conflicting / contradictory evidence", "VALD", "EXTR", "UC-11-OUT-01"),
    ("UC-12", "Evaluate evidence sufficiency / quality", "VALD", "KNOW", "UC-12-OUT-01"),
    ("UC-13", "Generate targeted evidence follow-up questions", "VALD", "KNOW, ORCH", "UC-13-OUT-01"),
    ("UC-14", "Assess identity and access management controls", "CTRL", "KNOW, GAPF", "UC-14-OUT-01"),
    ("UC-15", "Assess data protection and encryption controls", "CTRL", "KNOW, GAPF", "UC-15-OUT-01"),
    ("UC-16", "Assess network and trust-boundary controls", "CTRL", "KNOW, GAPF", "UC-16-OUT-01"),
    ("UC-17", "Assess logging, monitoring, detection controls", "CTRL", "KNOW, GAPF", "UC-17-OUT-01"),
    ("UC-18", "Assess resilience, recovery, availability controls", "CTRL", "KNOW, GAPF", "UC-18-OUT-01"),
    ("UC-19", "Assess cloud / SaaS / platform control posture", "CTRL", "KNOW, GAPF", "UC-19-OUT-01"),
    ("UC-20", "Assess secrets, keys, credential-management controls", "CTRL", "KNOW, GAPF", "UC-20-OUT-01"),
    ("UC-21", "Assess secure development / vuln-management controls", "CTRL", "KNOW, GAPF", "UC-21-OUT-01"),
    ("UC-22", "Retrieve applicable internal policy / standards requirements", "KNOW", "ORCH", "UC-22-OUT-01"),
    ("UC-23", "Retrieve approved reference architecture / guidance", "KNOW", "ORCH", "UC-23-OUT-01"),
    ("UC-24", "Identify candidate control or architecture gaps", "GAPF", "CTRL, KNOW", "UC-24-OUT-01"),
    ("UC-25", "Generate candidate SAR finding", "GAPF", "VALD, KNOW", "UC-25-OUT-01"),
    ("UC-26", "Generate candidate remediation / treatment options", "GAPF", "KNOW", "UC-26-OUT-01"),
    ("UC-27", "Validate finding-to-evidence and requirement linkage", "VALD", "GAPF, KNOW", "UC-27-OUT-01"),
    ("UC-28", "Generate SAR technical assessment summary", "RPTS", "ORCH, VALD", "UC-28-OUT-01"),
    ("UC-29", "Generate draft findings / remediation package", "RPTS", "GAPF, VALD", "UC-29-OUT-01"),
    ("UC-30", "Generate executive / approval-ready SAR summary", "RPTS", "ORCH, VALD", "UC-30-OUT-01"),
]

USE_CASE_IDS = [uc[0] for uc in USE_CASES]

# The eight reusable agents of section 3.
AGENTS = [
    ("ORCH", "Orchestrator", "Directs execution, preserves workflow state, routes human review"),
    ("INTK", "Intake / Classification", "Context, applicability, review path, evidence expectations"),
    ("EXTR", "Evidence Extraction", "Converts artifacts into structured assessment facts"),
    ("VALD", "Evidence Validation", "Missing, conflicting, insufficient or weakly supported evidence"),
    ("CTRL", "Control Assessment", "Evaluates evidence against applicable security requirements"),
    ("KNOW", "Knowledge Retrieval", "Approved policy, standards, methodology, reference guidance"),
    ("GAPF", "Gap / Finding", "Candidate gaps, findings, remediation and treatment options"),
    ("RPTS", "Reporting / Synthesis", "Technical, findings and approval-ready outputs"),
]


# ---------------------------------------------------------------------------
# The report
# ---------------------------------------------------------------------------

REPORT_SCHEMA = _obj(
    {
        # -------------------------------------------------------------------
        # SRC-01 / SRC-02 restated — the solution under review
        # -------------------------------------------------------------------
        "application_profile": _obj(
            {
                "name": _str(
                    "The solution name, taken from the inputs if stated, otherwise a short descriptive name you assign."
                ),
                "purpose": _str(
                    "Two to four sentences on what the solution does and who uses it, drawn only from what was submitted."
                ),
                "application_type": _str(
                    "What kind of system this is, e.g. 'internet-facing customer web portal', 'internal batch reporting pipeline', 'mobile app with REST backend'."
                ),
                "internet_facing": _enum(
                    "Whether the solution is reachable from the public internet. Use the value the team supplied; if they did not say and the material does not show it, use 'Not stated'.",
                    ["Yes", "No", "Partially", "Not stated"],
                ),
                "hosting_summary": _str(
                    "Where and how the solution runs, as far as the material establishes it. Say 'Not stated in the submitted material' if it does not."
                ),
                "environment_scope": _str(
                    "Which environments are in scope for this review and what the material says about their separation and data. 'Not stated in the submitted material' if absent."
                ),
                "data_sensitivity": _str(
                    "The classes of data the solution appears to handle and how sensitive they are, as stated or as visible in the flows. Say so plainly where it is not established."
                ),
                "business_criticality": _str(
                    "What the material or the team's context says about how critical this solution is to the business. 'Not stated in the submitted material' if absent."
                ),
                "regulatory_context": _str(
                    "Applicable regulatory or policy context where provided, e.g. PCI DSS, GDPR, HIPAA, internal standards. 'Not stated in the submitted material' if absent."
                ),
            }
        ),
        # -------------------------------------------------------------------
        # INTK — UC-01..04
        # -------------------------------------------------------------------
        "intake_determination": _obj(
            {
                "sar_applicability": _obj(
                    {
                        "artifact_id": _str("Always exactly 'UC-01-OUT-01'."),
                        "determination": _enum(
                            "Whether a Security Architecture Review is indicated for this solution, on the evidence available. This is a recommendation to the human architect, not a ruling.",
                            [
                                "SAR required",
                                "SAR likely required — confirm with the architect",
                                "SAR may not be required — confirm with the architect",
                                "Cannot determine from the submitted material",
                            ],
                        ),
                        "rationale": _str(
                            "Two to four sentences. Lean on the factors that actually drive applicability: internet exposure, sensitivity of data handled, third-party involvement, regulatory context, whether this is a new build or a material change. Name which of those the material established and which it did not."
                        ),
                        "drivers": _str_array(
                            "The specific factors that push this towards or away from requiring a review, one short phrase each."
                        ),
                    }
                ),
                "review_path": _obj(
                    {
                        "artifact_id": _str("Always exactly 'UC-02-OUT-01'."),
                        "path": _enum(
                            "The depth of review the solution appears to warrant.",
                            [
                                "Full review",
                                "Standard review",
                                "Light-touch review",
                                "Cannot determine from the submitted material",
                            ],
                        ),
                        "rationale": _str(
                            "Two to four sentences on why this depth, tied to exposure, data sensitivity, criticality and change scale."
                        ),
                        "depth_drivers": _str_array(
                            "What specifically raises or lowers the required depth, one short phrase each."
                        ),
                    }
                ),
                "solution_classification": _obj(
                    {
                        "artifact_id": _str("Always exactly 'UC-03-OUT-01'."),
                        "solution_type": _str(
                            "What kind of solution this is in delivery terms, e.g. 'custom-built cloud-native web application', 'vendor SaaS with SSO integration', 'COTS product hosted on-premise', 'internal data pipeline'."
                        ),
                        "delivery_model": _enum(
                            "How the solution is delivered and who runs it.",
                            [
                                "Custom build",
                                "Vendor SaaS",
                                "COTS deployed in-house",
                                "Hybrid",
                                "Not stated in the submitted material",
                            ],
                        ),
                        "hosting_class": _enum(
                            "The hosting class, as far as the material establishes it.",
                            [
                                "Public cloud",
                                "Private cloud",
                                "On-premise",
                                "Hybrid",
                                "Third-party hosted",
                                "Not stated in the submitted material",
                            ],
                        ),
                        "technology_profile": _str_array(
                            "The technologies, platforms and services the material names, one per entry. Empty array if the material names none."
                        ),
                        "classification_note": _str(
                            "One or two sentences on how confident this classification is and what would firm it up."
                        ),
                    }
                ),
                "required_evidence": {
                    "type": "array",
                    "description": "UC-04-OUT-01 Required SAR Evidence Checklist. Exactly one entry for each of the six minimum requested inputs, in the order listed in the enum — plus any further artifact the review path you determined would call for. Every entry states why the review needs it.",
                    "items": _obj(
                        {
                            "artifact": _str(
                                "The evidence artifact required. For the six minimum inputs use their exact names; for anything additional, name it plainly."
                            ),
                            "is_minimum_input": _enum(
                                "Whether this is one of the six minimum requested inputs or an additional artifact the review path calls for.",
                                ["Minimum input", "Additional for this review path"],
                            ),
                            "why_required": _str(
                                "One sentence on what the review cannot do without it."
                            ),
                            "priority": _enum(
                                "How much of the review depends on this artifact.",
                                PRIORITY,
                            ),
                        }
                    ),
                },
            }
        ),
        # -------------------------------------------------------------------
        # EXTR — UC-05..09
        # -------------------------------------------------------------------
        "evidence_base": _obj(
            {
                "summary": _str(
                    "A reviewer's briefing of the solution as you understood it from the evidence, written for a colleague who has not seen the material. Be explicit about the limits of your understanding."
                ),
                "source_register": {
                    "type": "array",
                    "description": "UC-05-OUT-01 Submitted Evidence Inventory merged with UC-05-OUT-02 Evidence Source Metadata Register. Exactly one entry per requested input, in enum order, whether or not anything arrived for it. Where a link was supplied instead of a file, record it and mark it as not retrieved — a named location is not evidence.",
                    "items": _obj(
                        {
                            "input_name": _enum(
                                "Which of the six minimum requested inputs this entry covers.",
                                MINIMUM_INPUTS,
                            ),
                            "source_type": _enum(
                                "Where this input came from. Use 'Referenced link — not retrieved' when the team gave a SharePoint or document URL rather than the file itself.",
                                SOURCE_TYPE,
                            ),
                            "source_location": _str(
                                "The filename, or the link exactly as supplied, or 'None supplied'. Reproduce a link verbatim so the architect can go and fetch it."
                            ),
                            "retrieval_status": _enum(
                                "Whether this review could actually read the content.",
                                RETRIEVAL_STATUS,
                            ),
                            "what_it_establishes": _str(
                                "What this source actually told the review. Where the content was not available, state what it would have established and write 'Contents not available to this review.'"
                            ),
                        }
                    ),
                },
                "component_inventory": {
                    "type": "array",
                    "description": "UC-06-OUT-01 Architecture Component & Technology Inventory. Each element you could identify from the material.",
                    "items": _obj(
                        {
                            "name": _str("The component as labelled, or a short descriptive name if unlabelled."),
                            "purpose": _str("What it appears to do. 'Not stated' where the material does not say."),
                            "technology": _str(
                                "The technology or service it runs on where the material names it, e.g. 'AWS RDS PostgreSQL', 'nginx', 'Azure App Service'. 'Not stated' if unnamed."
                            ),
                            "zone": _str(
                                "Which zone or tier it sits in, e.g. 'Internet', 'DMZ', 'Application tier', 'Managed cloud service', 'Third party'. 'Not stated' if undetermined."
                            ),
                            "handles_sensitive_data": _enum(
                                "Whether the material indicates this component handles sensitive data.",
                                ["Yes", "No", "Not stated"],
                            ),
                            "notes": _str(
                                "Anything unclear, contradictory or inferred about this component. Empty string if there is nothing to add."
                            ),
                        }
                    ),
                },
                "flow_register": {
                    "type": "array",
                    "description": "UC-07-OUT-01 Data Flow, Interface & Trust Relationship Register. Each flow you could identify. Record 'Not stated' for any attribute the material does not establish rather than filling it in from imagination.",
                    "items": _obj(
                        {
                            "source": _str("Where the flow originates."),
                            "destination": _str("Where the flow terminates."),
                            "data_description": _str("What travels. 'Not stated' if the material does not say."),
                            "protocol": _str("The transport or protocol. 'Not stated' if unlabelled."),
                            "authentication": _str("How the flow is authenticated. 'Not stated' if the material does not say."),
                            "crosses_trust_boundary": _enum(
                                "Whether this flow crosses from one zone of trust into another.",
                                ["Yes", "No", "Not stated"],
                            ),
                            "notes": _str("Ambiguity or gaps in how this flow is drawn. Empty string if none."),
                        }
                    ),
                },
                "trust_boundaries": _array(
                    "The points where control changes hands. Part of UC-07-OUT-01.",
                    {
                        "name": _str("The boundary as 'zone A | zone B', e.g. 'Internet | DMZ'."),
                        "description": _str("What crosses it and what changes at the crossing."),
                        "how_established": _enum(
                            "Whether the boundary is drawn explicitly in the material or you had to infer it.",
                            ["Drawn explicitly", "Inferred"],
                        ),
                    },
                ),
                "stated_controls": {
                    "type": "array",
                    "description": "UC-08-OUT-01 Stated Security Control Register. Every security control or safeguard the material CLAIMS is in place — read off the diagrams, documents and intake record. This is a register of claims, not of verified controls: record what the package says, and say how firmly it says it. Empty array if the material claims none.",
                    "items": _obj(
                        {
                            "control": _str("The control as the material describes it, e.g. 'WAF in front of the public endpoint', 'Okta OIDC for customer sign-in', 'TLS on the external listener'."),
                            "domain": _enum(
                                "Which control-assessment domain this claim belongs to.",
                                CONTROL_DOMAINS,
                            ),
                            "stated_in": _str("Which source states it — the diagram, a named document, or the intake record."),
                            "evidence_strength": _enum(
                                "How firmly the material establishes that this control exists. 'Explicitly stated' means the material says so directly; 'Implied' means it follows from a label or arrangement; 'Asserted without detail' means it is named but nothing about it is established.",
                                ["Explicitly stated", "Implied", "Asserted without detail"],
                            ),
                        }
                    ),
                },
                "normalized_facts": {
                    "type": "array",
                    "description": "UC-09-OUT-01 Normalized SAR Evidence Fact Set. The assessment-ready facts distilled from everything above, each carrying its source so a human can trace it back. This is the set the control assessments below are built on — a fact that does not appear here must not drive a finding. Keep each fact to one sentence.",
                    "items": _obj(
                        {
                            "fact_id": _str("Sequential identifier: F-01, F-02 and so on."),
                            "fact": _str("A single, checkable statement about the architecture, e.g. 'The load balancer forwards to the application tier over plain HTTP on port 8080.'"),
                            "domain": _enum(
                                "Which control-assessment domain this fact bears on.",
                                CONTROL_DOMAINS,
                            ),
                            "source": _str("Which submitted source establishes it, named specifically."),
                            "certainty": _enum(
                                "How firmly the material establishes this fact.",
                                ["Stated", "Inferred", "Assumed"],
                            ),
                        }
                    ),
                },
                "hosting_and_deployment": _str(
                    "What you could establish about where and how the solution runs, and what remains undetermined."
                ),
                "identity_and_access": _array(
                    "One entry per class of actor. Include every class, including those the material does not cover.",
                    {
                        "actor_class": _str(
                            "e.g. 'End users', 'Service and machine identities', 'Administrative and privileged access', 'External or third-party actors'."
                        ),
                        "approach": _str(
                            "How identity is established and access granted for this class. 'Not described in the submitted material' where it is not."
                        ),
                        "status": _enum(
                            "How well the material covers this actor class.",
                            ["Described", "Partially described", "Not described"],
                        ),
                    },
                ),
                "integrations": _array(
                    "Each external system the solution connects to that it does not own.",
                    {
                        "name": _str("The external system or provider."),
                        "purpose": _str("What it is used for. 'Not stated' if the material does not say."),
                        "data_exchanged": _str("What crosses to or from it, and in which direction. 'Not stated' if undocumented."),
                        "notes": _str("Ownership, shared-responsibility questions or gaps. Empty string if none."),
                    },
                ),
            }
        ),
        # -------------------------------------------------------------------
        # VALD — UC-10..13
        # -------------------------------------------------------------------
        "evidence_validation": _obj(
            {
                "sufficiency": _obj(
                    {
                        "artifact_id": _str("Always exactly 'UC-12-OUT-01'."),
                        "rating": _enum(
                            "Whether the submitted evidence is sufficient in quality and coverage for the control assessments to carry weight.",
                            SUFFICIENCY,
                        ),
                        "completeness_score": {
                            "type": "integer",
                            "description": "0-100 score for how complete the submitted evidence is against the required evidence checklist. Weight the architecture diagram and data flow diagram most heavily. A link that was referenced but not retrieved earns no credit.",
                        },
                        "rationale": _str(
                            "Three to five sentences explaining the rating and the score: what arrived, what did not, what was referenced but unavailable, and what that means for the assessments below."
                        ),
                        "quality_concerns": _str_array(
                            "Concerns about the quality of what did arrive, as distinct from what is absent — an undated diagram, unlabelled arrows, a document that describes a different version of the system. Empty array if none."
                        ),
                        "blocking_items": _str_array(
                            "The specific items that must be supplied or clarified before the review can proceed. Empty array if nothing blocks it."
                        ),
                    }
                ),
                "gap_register": {
                    "type": "array",
                    "description": "UC-10-OUT-01 Evidence Gap Register. Exactly one entry for each of the six minimum requested inputs, in enum order. Include every input, including those fully provided.",
                    "items": _obj(
                        {
                            "input_name": _enum(
                                "Which of the six minimum requested inputs this entry covers.",
                                MINIMUM_INPUTS,
                            ),
                            "status": _enum(
                                "Provided means supplied and substantial enough to serve its purpose. Partially provided means something on the topic arrived but the basic picture is still incomplete. Not provided means nothing usable addressing this input was submitted — including the case where only an unretrievable link was given.",
                                INPUT_STATUS,
                            ),
                            "what_was_submitted": _str(
                                "What actually arrived for this input. If only a link was named, say so and say that its contents were not available."
                            ),
                            "what_is_missing": _str(
                                "What this input should have established and does not. Empty-handed phrasing is fine where the input is fully provided: 'Nothing material is missing.'"
                            ),
                            "impact_on_review": _str(
                                "One or two sentences on what the reviewer cannot determine as a result. Say 'No impact — this input is complete.' where it is."
                            ),
                        }
                    ),
                },
                "conflict_register": {
                    "type": "array",
                    "description": "UC-11-OUT-01 Evidence Conflict Register. Places where two submitted sources contradict each other, or where a source contradicts the intake record — a diagram showing a direct database connection while the questionnaire describes an API layer, an intake record naming three environments while the deployment document names two. Empty array if the material is internally consistent, which is a legitimate outcome. Never manufacture a conflict.",
                    "items": _obj(
                        {
                            "id": _str("Sequential identifier: C-01, C-02 and so on."),
                            "topic": _str("What the two sources disagree about, in a short phrase."),
                            "source_a": _str("The first source and what it says."),
                            "source_b": _str("The second source and what it says."),
                            "domain": _enum(
                                "Which control-assessment domain the disagreement bears on.",
                                CONTROL_DOMAINS,
                            ),
                            "significance": _enum(
                                "How much the disagreement matters to the review.",
                                PRIORITY,
                            ),
                            "resolution_needed": _str(
                                "What the team must confirm to settle it, phrased as an instruction to a person."
                            ),
                        }
                    ),
                },
                "clarification_requests": {
                    "type": "array",
                    "description": "UC-13-OUT-01 Targeted Evidence Clarification Request Set. The question set that would let the team close the gaps and conflicts, ordered so the questions that unblock the most sit first.",
                    "items": _obj(
                        {
                            "id": _str("Sequential identifier: Q-01, Q-02 and so on."),
                            "question": _str("A specific, answerable question about a fact or decision the team already holds."),
                            "directed_to": _str("The role most likely to hold the answer."),
                            "why_it_matters": _str("What the answer unblocks, in one or two sentences."),
                            "related_artifact": _str(
                                "The identifier of the finding, gap or conflict this question serves, e.g. 'SAR-03', 'C-01'. Use 'None' if it stands alone."
                            ),
                        }
                    ),
                },
            }
        ),
        # -------------------------------------------------------------------
        # KNOW — UC-22, UC-23
        # -------------------------------------------------------------------
        "requirements_basis": _obj(
            {
                "retrieval_note": _str(
                    "Two to three sentences stating plainly what this review had available as an authority to assess against. No approved policy repository (SRC-05) or reference architecture repository (SRC-06) is connected to this agent, so the basis is the regulatory and policy context the team stated, plus general security architecture practice. Say that, and say what connecting those repositories would change."
                ),
                "applicable_requirements": {
                    "type": "array",
                    "description": "UC-22-OUT-01 Applicable SAR Requirement Set. The requirements this assessment is actually held against, derived from the regulatory and policy context the team supplied plus general security architecture practice. Where the team named a standard (PCI DSS, GDPR, an internal standard), name the obligations it plausibly imposes on an architecture of this shape — at architecture level, never clause-by-clause compliance mapping.",
                    "items": _obj(
                        {
                            "requirement": _str("The architectural requirement in one plain sentence, e.g. 'Cardholder data must not traverse systems outside the defined cardholder data environment.'"),
                            "source": _str("Where it comes from: a standard the team named, the stated policy context, or 'General security architecture practice'."),
                            "domain": _enum(
                                "Which control-assessment domain it bears on.",
                                CONTROL_DOMAINS,
                            ),
                            "authority": _enum(
                                "How authoritative this requirement is for this review.",
                                [
                                    "Stated by the team as applicable",
                                    "Implied by the stated regulatory context",
                                    "General security architecture practice",
                                ],
                            ),
                        }
                    ),
                },
                "reference_guidance": {
                    "type": "array",
                    "description": "UC-23-OUT-01 Applicable Reference Architecture & Security Guidance Set. The architectural patterns that would be the reference point for a solution of this classification — a segmented three-tier pattern with no direct data-tier exposure, federated identity with no local credential store, an egress-controlled outbound path. Keep these as patterns, not products. Empty array if the classification was too uncertain to name any.",
                    "items": _obj(
                        {
                            "pattern": _str("The reference pattern in a short phrase."),
                            "relevance": _str("Why it applies to a solution of this classification, in one sentence."),
                            "conformance": _enum(
                                "How the submitted architecture stands against this pattern.",
                                [
                                    "Appears to conform",
                                    "Appears to depart",
                                    "Cannot determine from the submitted material",
                                ],
                            ),
                        }
                    ),
                },
            }
        ),
        # -------------------------------------------------------------------
        # CTRL — UC-14..21
        # -------------------------------------------------------------------
        "domain_assessments": {
            "type": "array",
            "description": "The eight domain assessment records of UC-14 through UC-21, exports 14-1 through 21-1. Exactly eight entries, one per domain, in the order the domain enum lists them. Every domain gets a record even where the evidence is silent — a domain with no evidence is reported as 'Not assessable from the submitted evidence', never omitted and never quietly passed. Each record follows the reusable pattern of section 8: normalized facts plus sufficiency, held against applicable requirements and guidance, producing status, rationale and uncertainty.",
            "items": _obj(
                {
                    "domain": _enum("The control-assessment domain this record covers.", CONTROL_DOMAINS),
                    "artifact_id": _str(
                        "The canonical export name for this domain: 'UC-14-OUT-01' for identity and access management, 'UC-15-OUT-01' for data protection and encryption, 'UC-16-OUT-01' for network and trust boundary, 'UC-17-OUT-01' for logging monitoring and detection, 'UC-18-OUT-01' for resilience recovery and availability, 'UC-19-OUT-01' for cloud SaaS and platform, 'UC-20-OUT-01' for secrets keys and credential management, 'UC-21-OUT-01' for secure development and vulnerability management."
                    ),
                    "status": _enum(
                        "The assessment outcome for this domain. Use 'Assessed — no concern evidenced' only where the evidence genuinely covered the domain and showed nothing of concern; where the evidence simply did not reach it, that is 'Not assessable from the submitted evidence'.",
                        DOMAIN_STATUS,
                    ),
                    "summary": _str(
                        "Two to four sentences on how the architecture stands in this domain, built only on the normalized facts. Where the evidence did not reach, say so directly rather than hedging."
                    ),
                    "evidence_considered": _str_array(
                        "The fact identifiers from the normalized fact set that this record rests on, e.g. 'F-03', 'F-07'. Empty array where no facts bore on this domain."
                    ),
                    "sound_by_design": _str_array(
                        "What the architecture does well in this domain, where the material evidences it. Empty array if it evidences nothing."
                    ),
                    "concerns": _str_array(
                        "The architecture-level concerns in this domain, one sentence each. Each of these should correspond to a candidate gap and, where it rises to it, a candidate finding."
                    ),
                    "uncertainty": _str(
                        "What you could not settle in this domain and what would settle it. This field is mandatory even where the status is 'Assessed' — state 'No material uncertainty remains in this domain.' only when that is genuinely true."
                    ),
                }
            ),
        },
        # -------------------------------------------------------------------
        # GAPF — UC-24
        # -------------------------------------------------------------------
        "candidate_gaps": {
            "type": "array",
            "description": "UC-24-OUT-01 Candidate Control & Architecture Gap Register. The distance between what the applicable requirements expect and what the evidence shows, per domain. A gap is not yet a finding: it is the raw difference, before you have judged whether it is material enough to raise. Every concern in the domain assessments should appear here; a subset of these then become candidate findings.",
            "items": _obj(
                {
                    "id": _str("Sequential identifier: G-01, G-02 and so on."),
                    "domain": _enum("The control-assessment domain this gap sits in.", CONTROL_DOMAINS),
                    "expected": _str("What the applicable requirement or reference pattern expects, in one sentence."),
                    "observed": _str("What the evidence actually shows, or that it shows nothing, in one sentence."),
                    "gap_type": _enum(
                        "Whether the distance is a real departure in the design, an absence of evidence, or a point the evidence leaves undecidable.",
                        [
                            "Design departs from expectation",
                            "Evidence absent",
                            "Evidence insufficient to decide",
                        ],
                    ),
                    "becomes_finding": _str(
                        "The identifier of the candidate finding this gap was raised as, e.g. 'SAR-02'. Use 'Not raised' where the gap was judged immaterial, and say why in one clause."
                    ),
                }
            ),
        },
        # -------------------------------------------------------------------
        # GAPF + VALD — UC-25, UC-26, UC-27
        # -------------------------------------------------------------------
        "candidate_findings": {
            "type": "array",
            "description": "UC-25-OUT-01 Candidate SAR Finding Set, carrying UC-26-OUT-01 treatment options and UC-27-OUT-01 linkage validation inline. Ordered High proposed priority first. Three kinds share this list: security weaknesses in the architecture the material describes, gaps where a requested input is absent or unretrievable, and security-relevant properties the material leaves undetermined. Every input marked Not provided or Partially provided must have a corresponding finding here, and every architectural weakness the evidence shows must appear here too. These are CANDIDATE findings: the human Security Architect owns approval, modification and final severity.",
            "items": _obj(
                {
                    "id": _str("Sequential identifier: SAR-01, SAR-02, SAR-03 and so on."),
                    "title": _str(
                        "A short, specific statement of the issue. For a weakness, name what the architecture does: 'Application-to-database traffic is unencrypted'. For a gap, name what is absent: 'No hosting or deployment model was submitted'."
                    ),
                    "proposed_priority": _enum(
                        "The priority this review proposes, subject to human determination. For a weakness: how much exposure the design carries. For a gap: how much of the review it blocks. High, Medium or Low as defined in your instructions.",
                        PRIORITY,
                    ),
                    "finding_type": _enum(
                        "Architecture weakness means the material shows a design that departs from good security architecture practice. Missing or incomplete input means a requested input is absent, unretrievable or too thin to serve its purpose. Unverifiable from the material means a security-relevant property of the architecture could not be established either way from what was submitted.",
                        FINDING_TYPE,
                    ),
                    "area": _enum(
                        "For a weakness, the control-assessment domain it belongs to. For a missing-input finding, the requested input it concerns.",
                        FINDING_AREA,
                    ),
                    "source_gap": _str(
                        "The identifier of the candidate gap this finding was raised from, e.g. 'G-04'. Use 'None' where the finding did not arise from a gap record."
                    ),
                    "description": _str(
                        "What the issue is, in two to four sentences. For a weakness, state plainly what the architecture does and how that departs from good practice. For a gap, state precisely what is absent, ambiguous or contradictory. Stay at architecture level throughout — components, flows, boundaries and trust relationships, never settings."
                    ),
                    "evidence": _str(
                        "What in the submitted material establishes this — the arrow labelled 'HTTP', the database drawn in the public subnet, the shared account named in the identity section, the unlabelled hop, the absent artifact, the unretrievable link, the contradiction between two documents. Cite normalized fact identifiers where they apply. Never write a finding you cannot point at."
                    ),
                    "good_practice": _str(
                        "The architectural security principle at stake, in one plain sentence: 'all traffic carrying sensitive data should be encrypted in transit, including between internal tiers'; 'data stores should not be directly reachable from an untrusted network'; 'every actor class should have a distinct, individually attributable identity'. For a pure documentation gap, write 'Not applicable — this is an evidence gap.'"
                    ),
                    "why_it_matters": _str(
                        "For a weakness: what the design exposes and under what conditions, in architectural terms. For a gap: what the reviewer cannot determine and what part of the review it holds up. Two to four sentences, no attacker narratives."
                    ),
                    "treatment_options": {
                        "type": "array",
                        "description": "UC-26-OUT-01. One or more candidate treatments, best first. Architecture-level only: 'encrypt the application-to-database channel and authenticate both ends', 'move the data store into a private subnet reachable only from the application tier'. Never a configuration instruction, a product choice or a parameter value. Where a genuine choice exists between treatments, give more than one so the architect can choose.",
                        "items": _obj(
                            {
                                "option": _str("What should change or be supplied, in one sentence."),
                                "treatment_type": _enum(
                                    "What kind of treatment this is.",
                                    TREATMENT_TYPE,
                                ),
                                "note": _str(
                                    "One clause on the trade-off or precondition. Empty string if there is nothing to add."
                                ),
                            }
                        ),
                    },
                    "linkage": _obj(
                        {
                            "evidence_linkage": _enum(
                                "UC-27-OUT-01. How this finding connects to the submitted evidence. Be honest: a finding built on the absence of material is not the same as one drawn directly off a labelled diagram.",
                                EVIDENCE_LINKAGE,
                            ),
                            "requirement_linkage": _enum(
                                "UC-27-OUT-01. What authority this finding is held against.",
                                REQUIREMENT_LINKAGE,
                            ),
                            "confidence": _enum(
                                "How confident this review is in the finding as stated, before human validation.",
                                CONFIDENCE,
                            ),
                            "validation_note": _str(
                                "One or two sentences on what a human reviewer should check to confirm or overturn this finding."
                            ),
                        }
                    ),
                    "owner": _str(
                        "The role most likely to own this or hold the answer: solution architect, application owner, infrastructure or platform team, identity team, third-party manager, compliance contact."
                    ),
                }
            ),
        },
        # -------------------------------------------------------------------
        # RPTS — UC-28, UC-29, UC-30
        # -------------------------------------------------------------------
        "technical_summary": _obj(
            {
                "artifact_id": _str("Always exactly 'UC-28-OUT-01'."),
                "summary": _str(
                    "Three to six sentences on how the architecture holds up against good security architecture practice, based only on what the evidence establishes. Cover what is sound as well as what is weak, and say explicitly where the evidence was too thin for you to judge. Written for a security architect."
                ),
                "strengths": _str_array(
                    "Architectural decisions visible in the material that reflect good security practice — a properly segmented data tier, a single enforced entry point, federated identity, an explicit trust boundary. Empty array if the material establishes none."
                ),
                "areas_of_concern": _str_array(
                    "The architecture-level security concerns in priority order, one sentence each. These correspond to your High and Medium weakness findings."
                ),
                "not_assessable": _str_array(
                    "Security-relevant properties of the architecture you could not assess either way, because the evidence does not establish them. Each phrased so the team can see what would settle it."
                ),
            }
        ),
        "executive_summary": _obj(
            {
                "artifact_id": _str("Always exactly 'UC-30-OUT-01'."),
                "headline": _str(
                    "One sentence a senior stakeholder could read on its own and understand the position. No jargon."
                ),
                "narrative": _str(
                    "Three to five sentences for an audience that will not read the detail: what was reviewed, what state the evidence was in, what the main architectural concerns are, and what is being asked of them. Plain business language — no protocol names, no artifact identifiers."
                ),
                "key_points": _str_array(
                    "Three to five bullet points, each a single plain sentence. These are what gets read."
                ),
                "decision_required": _str(
                    "What the approving stakeholder is actually being asked to decide or authorise at this point, in one or two sentences. If nothing can be decided until evidence is supplied, say exactly that."
                ),
                "recommended_disposition": _enum(
                    "The disposition this review recommends for Step 1, subject to the human Security Architect's determination.",
                    [
                        "Proceed to detailed review",
                        "Proceed with conditions",
                        "Return for further evidence before proceeding",
                        "Cannot recommend a disposition from the submitted material",
                    ],
                ),
            }
        ),
        "next_steps": {
            "type": "array",
            "description": "UC-29-OUT-01 Draft SAR Findings & Remediation Package, expressed as an ordered action list — which architectural weaknesses to address, which artifacts to supply or make retrievable, which questions to answer, and whether the package should be resubmitted before the review proceeds.",
            "items": _obj(
                {
                    "step": _str("What should happen, in one sentence."),
                    "owner": _str("The role that should do it."),
                    "depends_on": _str(
                        "The finding, gap, conflict or question identifier this step serves, e.g. 'SAR-01', 'Q-02'. Use 'None' where it stands alone."
                    ),
                    "sequence": _enum(
                        "When this should happen relative to the rest of the review.",
                        ["Before the review proceeds", "During detailed review", "Before go-live"],
                    ),
                }
            ),
        },
        # -------------------------------------------------------------------
        # Governance and orchestration
        # -------------------------------------------------------------------
        "human_review_gate": _obj(
            {
                "decisions_required": _str_array(
                    "The specific judgments in this report that a human Security Architect must make or ratify before anything here is acted on — which candidate findings stand, what their real severity is, whether any is a risk acceptance, what the SAR disposition is. Be concrete and reference the finding identifiers, not generic."
                ),
                "material_evidence_to_validate": _str_array(
                    "The specific pieces of evidence a human should verify independently before relying on this report — an inferred trust boundary, an unretrievable link, a control claimed but not shown, a diagram of uncertain vintage."
                ),
                "not_performed": _str_array(
                    "What this step deliberately did not do, so that silence is not mistaken for a pass: configuration review, threat modelling, control effectiveness testing, code review, dependency scanning, penetration testing, and verification that stated controls actually exist."
                ),
            }
        ),
        "use_case_coverage": {
            "type": "array",
            "description": "ORCH-OUT-02 Workflow State. Exactly thirty entries, one per use case UC-01 through UC-30, in order. This records which of the MVP's use cases this run could actually execute against the material supplied, and why the rest could not — a use case that needs an approved policy repository or a recorded human decision cannot be executed by this agent, and saying so is the point.",
            "items": _obj(
                {
                    "use_case_id": _enum("The use case identifier.", USE_CASE_IDS),
                    "status": _enum("Whether this run executed the use case.", USE_CASE_STATUS),
                    "note": _str(
                        "One short clause on what was produced, or what was missing that prevented it. Keep it under fifteen words."
                    ),
                }
            ),
        },
        "assumptions": _str_array(
            "Every assumption you made to construct the evidence base and the assessments, each stated so the team can confirm or correct it."
        ),
        "reviewer_note": _str(
            "Two to three sentences framing the report for the reader: that this is Step 1 of a Security Architecture Review performed by an AI agent against the SAR Agentic MVP use-case model, that everything in it is candidate output pending human validation, that its findings sit at architecture level, and that no configuration review, threat modelling or testing has been performed."
        ),
    }
)
