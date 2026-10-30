#!/usr/bin/env python3
"""Fetch SonarQube issues/hotspots and cache rule guidance for fixing."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from _sonar_common import (
    CACHE_ROOT,
    SKIPPED_RULES,
    api_get,
    cache_rule,
    detect_branch,
    detect_pr,
    detect_project_key,
    detect_tech_stack,
    emit_minimal,
    ensure_cache_dirs,
    paginate,
    resolve_scope,
    resolve_token,
    resolve_url,
    safe_filename,
    supports_branch_analysis,
)


def _scope_params(branch: str, pr: str, url: Optional[str] = None) -> Dict[str, Any]:
    params, _note = resolve_scope(branch, pr, url)
    return params


def fetch_issues(
    url: str,
    project_key: str,
    branch: str,
    pr: str,
    token: Optional[str],
    organization: Optional[str],
) -> List[Dict[str, Any]]:
    params: Dict[str, Any] = {
        "componentKeys": project_key,
        "statuses": "OPEN,CONFIRMED,REOPENED",
        "types": "CODE_SMELL,BUG,VULNERABILITY",
        "additionalFields": "rules",
    }
    params.update(_scope_params(branch, pr, url))
    if organization:
        params["organization"] = organization
    return paginate(url, "/api/issues/search", params, "issues", token)


def fetch_hotspots(
    url: str,
    project_key: str,
    branch: str,
    pr: str,
    token: Optional[str],
    organization: Optional[str],
) -> List[Dict[str, Any]]:
    params: Dict[str, Any] = {
        "projectKey": project_key,
        "status": "TO_REVIEW",
    }
    params.update(_scope_params(branch, pr, url))
    if organization:
        params["organization"] = organization
    try:
        return paginate(url, "/api/hotspots/search", params, "hotspots", token)
    except RuntimeError:
        # Older servers may use different params; retry without status filter.
        params.pop("status", None)
        return paginate(url, "/api/hotspots/search", params, "hotspots", token)


def normalize_issue(issue: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "key": issue.get("key"),
        "rule": issue.get("rule"),
        "severity": issue.get("severity"),
        "type": issue.get("type"),
        "message": issue.get("message"),
        "component": issue.get("component"),
        "path": (issue.get("component") or "").split(":", 1)[-1],
        "line": issue.get("line"),
        "status": issue.get("status"),
        "effort": issue.get("effort"),
        "tags": issue.get("tags") or [],
    }


def normalize_hotspot(hotspot: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "key": hotspot.get("key"),
        "rule": hotspot.get("ruleKey") or hotspot.get("rule"),
        "message": hotspot.get("message"),
        "component": hotspot.get("component"),
        "path": (hotspot.get("component") or "").split(":", 1)[-1],
        "line": hotspot.get("line"),
        "status": hotspot.get("status"),
        "securityCategory": hotspot.get("securityCategory"),
        "vulnerabilityProbability": hotspot.get("vulnerabilityProbability"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch and analyze SonarQube findings")
    parser.add_argument("--project", help="Sonar project key")
    parser.add_argument("--branch", help="Branch name")
    parser.add_argument("--pr", help="Pull request number")
    parser.add_argument("--url", help="SonarQube base URL")
    parser.add_argument("--organization", help="SonarCloud organization (optional)")
    parser.add_argument("--repo", default=".", help="Path to the target repository")
    parser.add_argument("--server", default="sonarqube", choices=["sonarqube", "sonarcloud"])
    parser.add_argument("--minimal", action="store_true")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    url = resolve_url(args.url)
    if not url:
        emit_minimal({"error": "SONARQUBE_URL_missing", "passed": False})
        return 1

    token = resolve_token()
    project_key = args.project or detect_project_key(repo, url)
    branch = args.branch or detect_branch(repo)
    pr = args.pr or detect_pr(repo)
    _scope, scope_note = resolve_scope(branch, pr, url)

    if not project_key:
        emit_minimal({"error": "project_key_missing", "passed": False})
        return 1
    # A server without branch analysis is queried at default-branch scope, so a
    # detached HEAD with no PR is fine there.
    if not pr and not branch and supports_branch_analysis(url):
        emit_minimal({"error": "branch_or_pr_required", "passed": False})
        return 1

    try:
        raw_issues = fetch_issues(url, project_key, branch, pr, token, args.organization)
        raw_hotspots = fetch_hotspots(url, project_key, branch, pr, token, args.organization)
    except Exception as exc:  # noqa: BLE001
        emit_minimal({"error": str(exc), "passed": False})
        return 1

    issues: List[Dict[str, Any]] = []
    skipped = 0
    rule_keys = set()

    for issue in raw_issues:
        rule = issue.get("rule") or ""
        if rule in SKIPPED_RULES:
            skipped += 1
            continue
        issues.append(normalize_issue(issue))
        if rule:
            rule_keys.add(rule)

    hotspots: List[Dict[str, Any]] = []
    for hotspot in raw_hotspots:
        status = (hotspot.get("status") or "").upper()
        if status and status not in ("TO_REVIEW",):
            continue
        rule = hotspot.get("ruleKey") or hotspot.get("rule") or ""
        if rule in SKIPPED_RULES:
            skipped += 1
            continue
        hotspots.append(normalize_hotspot(hotspot))
        if rule:
            rule_keys.add(rule)

    for rule_key in sorted(rule_keys):
        cache_rule(url, rule_key, token)

    tech_stack = detect_tech_stack(repo)
    ensure_cache_dirs()
    findings_path = CACHE_ROOT / "findings" / f"{safe_filename(project_key)}.json"
    techstack_path = CACHE_ROOT / "techstack" / f"{safe_filename(project_key)}.json"

    payload = {
        "project_key": project_key,
        "branch": branch,
        "pr": pr,
        "scope": scope_note,
        "server": args.server,
        "url": url,
        "issues": issues,
        "hotspots": hotspots,
        "skipped_rules": sorted(SKIPPED_RULES),
        "skipped_count": skipped,
        "tech_stack": tech_stack,
    }
    findings_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    techstack_path.write_text(json.dumps({"project_key": project_key, "tech_stack": tech_stack}, indent=2), encoding="utf-8")

    emit_minimal(
        {
            "passed": True,
            "project_key": project_key,
            "branch": branch,
            "pr": pr,
            "scope": scope_note,
            "server": args.server,
            "issue_count": len(issues),
            "hotspot_count": len(hotspots),
            "skipped_count": skipped,
            "tech_stack": tech_stack,
            "findings_path": str(findings_path),
            "techstack_path": str(techstack_path),
        }
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
