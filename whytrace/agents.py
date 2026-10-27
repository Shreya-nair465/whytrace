
from __future__ import annotations

import json

from whytrace.llm import complete_json, resolve_llm


CORRELATION_SYSTEM = """
You are the Correlation Analyst agent in WhyTrace.
Analyze the supplied detections, activity chains, and events.
Use only supplied evidence. Never invent event IDs, users, hosts, IPs, or timestamps.
Distinguish observed facts from hypotheses and flag gaps.
Return JSON with keys:
sequence, connections, gaps, alternative_explanations, confidence.
"""


VALIDATOR_SYSTEM = """
You are the Evidence Validator agent in WhyTrace.
Review a proposed investigation report against the supplied source events.
Check event IDs and whether explanations are supported by the evidence.
Flag unsupported claims and overconfident conclusions.
Do not reject findings merely because evidence is incomplete.
Return JSON with keys:
approved_finding_ids, rejected_findings, warnings, overall_assessment.
"""


def run_correlation_agent(packet: dict) -> tuple[dict, str]:
    """Analyze relationships across detections, chains, and events."""
    if resolve_llm() is not None:
        try:
            result, model = complete_json(
                CORRELATION_SYSTEM,
                json.dumps(packet, indent=2),
            )
            return result, model
        except Exception:
            pass

    return {
        "sequence": [
            {
                "step": index + 1,
                "explanation": detection.get("title", "Detected activity"),
                "event_ids": detection.get("event_ids", []),
            }
            for index, detection in enumerate(packet.get("detections", []))
        ],
        "connections": [
            {
                "explanation": chain.get("title", "Related activity"),
                "event_ids": chain.get("event_ids", []),
            }
            for chain in packet.get("chains", [])
        ],
        "gaps": ["Model-based cross-source analysis was unavailable."],
        "alternative_explanations": [],
        "confidence": "medium",
    }, "rules-only-correlation"


def run_validation_agent(
    packet: dict,
    proposed_report: dict,
) -> tuple[dict, str]:
    """Check report evidence references."""
    validation_input = {
        "source_events": packet.get("events", []),
        "proposed_report": proposed_report,
    }

    if resolve_llm() is not None:
        try:
            result, model = complete_json(
                VALIDATOR_SYSTEM,
                json.dumps(validation_input, indent=2),
            )
            return result, model
        except Exception:
            pass

    valid_event_ids = {
        event.get("id")
        for event in packet.get("events", [])
        if event.get("id")
    }

    approved = []
    rejected = []

    for finding in proposed_report.get("findings", []):
        finding_id = finding.get("id", "")
        evidence = finding.get("evidence", [])
        cited_ids = {
            item.get("event_id")
            for item in evidence
            if isinstance(item, dict)
        }

        if cited_ids & valid_event_ids:
            approved.append(finding_id)
        else:
            rejected.append({
                "finding_id": finding_id,
                "reason": "No evidence citation matched the supplied events.",
            })

    return {
        "approved_finding_ids": approved,
        "rejected_findings": rejected,
        "warnings": [
            "Fallback validation checks citations, not the full meaning of claims."
        ],
        "overall_assessment": (
            "Checked evidence references using deterministic rules."
        ),
    }, "rules-only-validation"
