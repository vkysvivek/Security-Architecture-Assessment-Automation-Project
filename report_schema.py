"""JSON Schema for the security review report.

Passed to the Messages API as
`output_config={"format": {"type": "json_schema", "schema": REPORT_SCHEMA}}`,
which constrains the model to emit exactly this shape.

Structured-output constraints this file must respect:
  - every object needs "additionalProperties": false
  - every property must be listed in "required"
  - no recursion, no $ref cycles
  - no numeric/string constraints (minimum, maxLength, pattern, format, ...)

Field names here are load-bearing: SYSTEM_PROMPT in owasp_prompt.py refers to
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


def _str_array(description: str) -> dict:
    return {"type": "array", "description": description, "items": {"type": "string"}}


SEVERITY = ["Critical", "High", "Medium", "Low", "Informational"]
RATING = ["Low", "Medium", "High"]

REPORT_SCHEMA = _obj(
    {
        "application_profile": _obj(
            {
                "name": {
                    "type": "string",
                    "description": "The application name, taken from the inputs if stated, otherwise a short descriptive name you assign.",
                },
                "type": {
                    "type": "string",
                    "description": "What kind of system this is, e.g. 'public-facing SaaS web application', 'internal batch pipeline', 'mobile app + REST API'.",
                },
                "summary": {
                    "type": "string",
                    "description": "Two to four sentences describing what the application does and how it is put together, written from the diagrams only.",
                },
                "tech_stack": _str_array(
                    "Concrete technologies you can actually see or that are explicitly stated. Empty array if the diagrams do not name any."
                ),
                "trust_boundaries": _str_array(
                    "Each boundary as 'zone A | zone B — what crosses it', e.g. 'Internet | DMZ — HTTPS requests from browsers to the load balancer'."
                ),
                "entry_points": _str_array(
                    "Every place untrusted input enters the system: public endpoints, webhooks, file uploads, message queues, admin consoles, third-party callbacks."
                ),
                "data_assets": _str_array(
                    "What is worth stealing or corrupting, with its sensitivity, e.g. 'customer PII (name, email, address) — regulated under GDPR'."
                ),
                "external_dependencies": _str_array(
                    "Third-party services, SaaS APIs, identity providers, payment processors and other systems outside your control."
                ),
            }
        ),
        "diagram_understanding": _obj(
            {
                "components": {
                    "type": "array",
                    "description": "Every component you could identify in the diagrams. This is your transcription — it lets the reader confirm you read the diagram correctly.",
                    "items": _obj(
                        {
                            "name": {
                                "type": "string",
                                "description": "The label as it appears in the diagram.",
                            },
                            "role": {
                                "type": "string",
                                "description": "What this component does in the system.",
                            },
                            "zone": {
                                "type": "string",
                                "description": "The trust zone it sits in, e.g. 'public internet', 'DMZ', 'private subnet', 'third party'. Use 'unspecified' when the diagram does not say.",
                            },
                            "handles_sensitive_data": {
                                "type": "boolean",
                                "description": "True if this component stores, processes or transmits sensitive data.",
                            },
                        }
                    ),
                },
                "data_flows": {
                    "type": "array",
                    "description": "Every arrow / connection you could identify. Empty array only if no flows are discernible.",
                    "items": _obj(
                        {
                            "source": {"type": "string", "description": "Originating component name."},
                            "destination": {"type": "string", "description": "Receiving component name."},
                            "data": {
                                "type": "string",
                                "description": "What travels over this flow, as specifically as the inputs allow.",
                            },
                            "protocol": {
                                "type": "string",
                                "description": "The protocol shown, e.g. 'HTTPS', 'gRPC', 'JDBC', 'AMQP'. Use 'unspecified' when the diagram does not label it.",
                            },
                            "crosses_trust_boundary": {
                                "type": "boolean",
                                "description": "True if this flow moves between trust zones. These are the flows that matter most.",
                            },
                            "authentication": {
                                "type": "string",
                                "description": "How the receiving side authenticates the caller on this flow, or 'unspecified' / 'none shown'.",
                            },
                        }
                    ),
                },
            }
        ),
        "posture": _obj(
            {
                "overall_score": {
                    "type": "integer",
                    "description": "Design security maturity from 0 to 100, based only on what the inputs evidence. Sparse inputs should produce a mid-range score with that stated in the rationale, not a low one.",
                },
                "rating": {
                    "type": "string",
                    "description": "Plain-language rating of the design's current security posture.",
                    "enum": ["Critical", "Poor", "Fair", "Good", "Strong"],
                },
                "summary": {
                    "type": "string",
                    "description": "An executive summary in three to five sentences: the biggest risks, what is done well, and what to do first.",
                },
                "score_rationale": {
                    "type": "string",
                    "description": "Why this score and not ten points higher or lower. Reference specific findings and specific observed strengths.",
                },
                "input_coverage_gaps": _str_array(
                    "Material that was not supplied and that limited this review, e.g. 'no authentication sequence diagram, so token handling could not be assessed'. Empty array if the inputs were genuinely complete."
                ),
                "strengths": _str_array(
                    "Security controls that are actually visible in the design and worth keeping. Empty array if none are evident — do not invent praise."
                ),
            }
        ),
        "findings": {
            "type": "array",
            "description": "The security gaps. Ordered by severity, then priority. Only confirmed weaknesses and missing controls — never speculation about things the inputs cannot show.",
            "items": _obj(
                {
                    "id": {"type": "string", "description": "Sequential identifier: F-01, F-02, F-03, ..."},
                    "title": {
                        "type": "string",
                        "description": "A specific one-line title naming the affected component, e.g. 'API gateway forwards unauthenticated requests to the orders service'.",
                    },
                    "owasp_category": _obj(
                        {
                            "code": {
                                "type": "string",
                                "description": "The OWASP identifier, e.g. 'A01:2021', 'API3:2023', 'LLM01:2025'.",
                            },
                            "name": {
                                "type": "string",
                                "description": "The category name, e.g. 'Broken Access Control'.",
                            },
                            "framework": {
                                "type": "string",
                                "description": "Which OWASP list the code comes from.",
                                "enum": [
                                    "OWASP Top 10 2021",
                                    "OWASP API Security Top 10 2023",
                                    "OWASP Top 10 for LLM Applications",
                                    "OWASP Mobile Top 10",
                                    "OWASP Proactive Controls",
                                    "OWASP ASVS",
                                ],
                            },
                        }
                    ),
                    "severity": {"type": "string", "enum": SEVERITY},
                    "likelihood": {"type": "string", "enum": RATING},
                    "impact": {"type": "string", "enum": RATING},
                    "confidence": {
                        "type": "string",
                        "description": "Confirmed = the inputs show the weakness directly. Inferred = it follows from what is shown. Never use this field to smuggle in unverifiable speculation.",
                        "enum": ["Confirmed", "Inferred"],
                    },
                    "finding_type": {
                        "type": "string",
                        "description": "Whether the design shows something wrong, or shows nothing where a control was expected.",
                        "enum": ["Confirmed weakness", "Missing control"],
                    },
                    "affected_components": _str_array(
                        "Component names exactly as they appear in the diagrams."
                    ),
                    "gap_description": {
                        "type": "string",
                        "description": "What is wrong or absent, in terms of this specific architecture. Two to four sentences.",
                    },
                    "evidence": {
                        "type": "string",
                        "description": "What in the supplied material led to this. Quote labels, arrows and text verbatim. Prefix with 'inferred:' when it is a reasoned inference rather than a direct observation.",
                    },
                    "exploit_scenario": {
                        "type": "string",
                        "description": "A concrete attack walked through step by step against these components — who the attacker is, what they do, what they get.",
                    },
                    "business_impact": {
                        "type": "string",
                        "description": "What this costs the organisation if exploited: data loss, regulatory exposure, downtime, fraud.",
                    },
                    "recommendation": _obj(
                        {
                            "summary": {
                                "type": "string",
                                "description": "The fix in one sentence, naming the component and where on the request path the control belongs.",
                            },
                            "steps": _str_array(
                                "Ordered, concrete implementation steps an engineer can act on this sprint."
                            ),
                            "example_controls": _str_array(
                                "Named technologies, patterns or configurations appropriate to this stack. Empty array if the stack is unknown enough that naming products would be a guess."
                            ),
                            "verification": {
                                "type": "string",
                                "description": "How the team proves the fix works: the test to write, the scan to run, the log line to look for.",
                            },
                        }
                    ),
                    "effort": {
                        "type": "string",
                        "description": "Rough implementation cost.",
                        "enum": ["Low", "Medium", "High"],
                    },
                    "priority": {
                        "type": "string",
                        "description": "P1 = fix before release. P2 = next sprint. P3 = this quarter. P4 = backlog.",
                        "enum": ["P1", "P2", "P3", "P4"],
                    },
                    "cwe": _str_array("Relevant CWE identifiers, e.g. 'CWE-306: Missing Authentication for Critical Function'."),
                    "asvs_refs": _str_array("Relevant ASVS requirements, e.g. 'V4.1.3 — least privilege access control'."),
                    "references": _str_array("Authoritative URLs, preferably OWASP cheat sheets and category pages."),
                }
            ),
        },
        "stride_threat_model": {
            "type": "array",
            "description": "Per-element STRIDE analysis for the components and flows that cross trust boundaries. Focus on what matters rather than filling in all six categories for every element.",
            "items": _obj(
                {
                    "component": {
                        "type": "string",
                        "description": "The component or data flow being analysed, named as in the diagram.",
                    },
                    "category": {
                        "type": "string",
                        "enum": [
                            "Spoofing",
                            "Tampering",
                            "Repudiation",
                            "Information Disclosure",
                            "Denial of Service",
                            "Elevation of Privilege",
                        ],
                    },
                    "threat": {
                        "type": "string",
                        "description": "The specific threat against this element, not the generic definition of the STRIDE category.",
                    },
                    "existing_mitigation": {
                        "type": "string",
                        "description": "The control visible in the design that addresses this, or 'none shown in the supplied material'.",
                    },
                    "residual_risk": {"type": "string", "enum": RATING},
                    "related_finding_ids": _str_array(
                        "Finding IDs that cover this threat, e.g. ['F-03']. Empty array if the residual risk did not warrant a finding."
                    ),
                }
            ),
        },
        "missing_controls": {
            "type": "array",
            "description": "Control areas where the design shows nothing, organised by control domain rather than by finding. This is the OWASP gap matrix.",
            "items": _obj(
                {
                    "control_area": {
                        "type": "string",
                        "description": "The control domain, e.g. 'Authentication', 'Secrets management', 'Logging and monitoring', 'Input validation', 'Rate limiting'.",
                    },
                    "expected_control": {
                        "type": "string",
                        "description": "What a secure design of this kind of system would show here.",
                    },
                    "observed": {
                        "type": "string",
                        "description": "What the supplied material actually shows, including 'nothing in the diagrams addresses this'.",
                    },
                    "owasp_reference": {
                        "type": "string",
                        "description": "The OWASP category, ASVS section or Proactive Control that defines this expectation.",
                    },
                    "recommendation": {
                        "type": "string",
                        "description": "The specific control to add and where it belongs in this architecture.",
                    },
                    "status": {
                        "type": "string",
                        "description": "Present = evidenced in the inputs. Partial = some coverage with gaps. Missing = nothing shown. Unknown = the inputs cannot tell us either way.",
                        "enum": ["Present", "Partial", "Missing", "Unknown"],
                    },
                }
            ),
        },
        "quick_wins": {
            "type": "array",
            "description": "High-value, low-effort fixes the team can land immediately. Empty array if there genuinely are none.",
            "items": _obj(
                {
                    "action": {"type": "string", "description": "The concrete action to take."},
                    "why": {"type": "string", "description": "The risk it removes."},
                    "related_finding_ids": _str_array("Finding IDs this addresses."),
                }
            ),
        },
        "roadmap": _obj(
            {
                "immediate": _str_array("Do before release or within days. Each item names the component and the change."),
                "short_term": _str_array("Do within the next one to two sprints."),
                "long_term": _str_array("Architectural work over the coming quarters."),
            }
        ),
        "compliance_considerations": {
            "type": "array",
            "description": "Regulatory regimes the data assets pull the system into, and what the design must therefore do. Empty array if no regulated data is evident.",
            "items": _obj(
                {
                    "regime": {
                        "type": "string",
                        "description": "e.g. 'PCI DSS 4.0', 'GDPR', 'HIPAA', 'SOC 2'.",
                    },
                    "why_applicable": {
                        "type": "string",
                        "description": "The data asset or flow in this design that brings the regime into scope.",
                    },
                    "design_implications": _str_array(
                        "What the architecture must do to satisfy it."
                    ),
                }
            ),
        },
        "assumptions": _str_array(
            "Everything you had to assume because the inputs did not say. Each assumption should be one the team can confirm or deny in a sentence."
        ),
        "questions_for_the_team": _str_array(
            "The questions whose answers would most change this assessment. Ordered by how much the answer matters."
        ),
    }
)
