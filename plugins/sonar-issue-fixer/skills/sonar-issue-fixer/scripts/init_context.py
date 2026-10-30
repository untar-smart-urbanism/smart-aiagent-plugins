#!/usr/bin/env python3
"""Initialize SonarQube fix context: prerequisites, branch/PR/project detection."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from _sonar_common import (
    api_get,
    auth_mode,
    detect_branch,
    detect_pr,
    detect_project_key,
    emit_minimal,
    resolve_scope,
    resolve_token,
    resolve_url,
    supports_branch_analysis,
    which_ok,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Initialize SonarQube issue-fixer context")
    parser.add_argument("--url", help="SonarQube base URL (overrides SONARQUBE_URL)")
    parser.add_argument("--repo", default=".", help="Path to the target git repository")
    parser.add_argument("--minimal", action="store_true", help="Emit key=value lines")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    errors = []

    python_ok = True
    gh_ok = which_ok("gh")
    if not gh_ok:
        errors.append("gh_missing")

    url = resolve_url(args.url)
    if not url:
        errors.append("SONARQUBE_URL_missing")

    token = resolve_token()
    auth = auth_mode(token)

    branch = detect_branch(repo) if (repo / ".git").exists() or (repo / ".git").is_file() else ""
    if not branch:
        # still try even without .git marker (worktrees / unusual layouts)
        branch = detect_branch(repo)
    # A server without branch analysis is always queried at default-branch scope,
    # so an undetected branch (detached HEAD) is not a prerequisite failure there.
    if not branch and supports_branch_analysis(url):
        errors.append("branch_undetected")

    pr = detect_pr(repo)
    project_key = detect_project_key(repo, url)
    _scope, scope_note = resolve_scope(branch, pr, url)

    sonar_ok = False
    if url:
        try:
            status = api_get(url, "/api/system/status", token=token, timeout=15)
            sonar_ok = (status.get("status") or "").upper() == "UP"
            if not sonar_ok:
                errors.append(f"sonar_status_{(status.get('status') or 'unknown').lower()}")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"sonar_unreachable:{exc}")

    # gh is recommended but not hard-fail when PR is empty and branch is known
    hard_errors = [e for e in errors if e not in ("gh_missing",)]
    if "gh_missing" in errors and not branch:
        hard_errors.append("gh_missing")

    passed = len(hard_errors) == 0 and bool(url) and sonar_ok and bool(project_key)

    values = {
        "passed": passed,
        "sonar_server": "sonarqube",
        "url": url or "",
        "branch": branch,
        "pr": pr,
        "scope": scope_note,
        "project_key": project_key,
        "auth": auth,
        "python": "ok" if python_ok else "missing",
        "gh": "ok" if gh_ok else "missing",
        "errors": ";".join(hard_errors + (["gh_missing"] if "gh_missing" in errors and "gh_missing" not in hard_errors else [])),
    }

    emit_minimal(values)
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
