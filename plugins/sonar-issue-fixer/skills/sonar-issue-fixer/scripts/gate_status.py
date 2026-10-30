#!/usr/bin/env python3
"""Read-only Sonar quality gate status check."""

from __future__ import annotations

import argparse
import sys
from typing import Any, Dict, List, Optional

from _sonar_common import (
    api_get,
    emit_minimal,
    resolve_scope,
    resolve_token,
    resolve_url,
)


def condition_threshold(cond: Dict[str, Any], status: str) -> str:
    status_u = (status or "").upper()
    if status_u == "WARN":
        value = cond.get("warningThreshold")
        if value is not None:
            return str(value)
    value = cond.get("errorThreshold")
    if value is not None:
        return str(value)
    # fallback to whichever threshold exists
    for key in ("errorThreshold", "warningThreshold"):
        if cond.get(key) is not None:
            return str(cond[key])
    return ""


def format_failing(conditions: List[Dict[str, Any]]) -> List[str]:
    rows: List[str] = []
    for cond in conditions:
        status = (cond.get("status") or "").upper()
        if status in ("", "OK"):
            continue
        metric = cond.get("metricKey") or cond.get("metric") or "unknown"
        comparator = cond.get("comparator") or ""
        threshold = condition_threshold(cond, status)
        actual = cond.get("actualValue")
        if actual is None:
            actual = ""
        rows.append(f"{metric}:{status}:{comparator}:{threshold}:{actual}")
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Check Sonar quality gate status")
    parser.add_argument("project_key", help="Sonar project key")
    parser.add_argument("--branch", help="Branch name")
    parser.add_argument("--pr", help="Pull request number")
    parser.add_argument("--url", help="SonarQube base URL")
    parser.add_argument("--server", default="sonarqube", choices=["sonarqube", "sonarcloud"])
    parser.add_argument("--organization", help="SonarCloud organization (optional)")
    parser.add_argument("--minimal", action="store_true")
    args = parser.parse_args()

    url = resolve_url(args.url)
    if not url:
        # SonarCloud default host when server=sonarcloud and no URL provided
        if args.server == "sonarcloud":
            url = "https://sonarcloud.io"
        else:
            emit_minimal(
                {
                    "status": "UNKNOWN",
                    "project_key": args.project_key,
                    "error": "SONARQUBE_URL_missing",
                }
            )
            return 1

    token = resolve_token()
    params: Dict[str, Any] = {"projectKey": args.project_key}
    scope, scope_note = resolve_scope(args.branch or "", args.pr or "", url)
    params.update(scope)
    if args.organization:
        params["organization"] = args.organization

    try:
        data = api_get(url, "/api/qualitygates/project_status", params, token=token)
    except Exception as exc:  # noqa: BLE001
        emit_minimal(
            {
                "status": "UNKNOWN",
                "project_key": args.project_key,
                "branch": args.branch or "",
                "pr": args.pr or "",
                "server": args.server,
                "error": str(exc),
            }
        )
        return 1

    project_status = data.get("projectStatus") or {}
    status = (project_status.get("status") or "UNKNOWN").upper()
    if status not in ("OK", "ERROR", "WARN", "NONE", "UNKNOWN"):
        status = "UNKNOWN"

    failing = format_failing(project_status.get("conditions") or [])

    emit_minimal(
        {
            "status": status,
            "project_key": args.project_key,
            "branch": args.branch or "",
            "pr": args.pr or "",
            "scope": scope_note,
            "server": args.server,
            "failing_count": len(failing),
            "failing_conditions": ",".join(failing),
        }
    )
    # Exit 0 on successful API call regardless of gate verdict
    return 0


if __name__ == "__main__":
    sys.exit(main())
