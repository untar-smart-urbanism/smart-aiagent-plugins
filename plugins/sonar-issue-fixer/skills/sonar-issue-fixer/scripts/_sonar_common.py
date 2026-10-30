#!/usr/bin/env python3
"""Shared helpers for sonar-issue-fixer scripts."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

SKIPPED_RULES = {"java:S6204"}
SKILL_ROOT = Path(__file__).resolve().parent.parent
CACHE_ROOT = SKILL_ROOT / "cache"
PLUGIN_ROOT = SKILL_ROOT.parent.parent
PLATFORM_CONFIG_PATH = PLUGIN_ROOT / "data" / "platform-sonar.json"

_platform_config: Optional[Dict[str, Any]] = None


def platform_config() -> Dict[str, Any]:
    """Company SonarQube defaults from data/platform-sonar.json ({} if unreadable)."""
    global _platform_config
    if _platform_config is None:
        try:
            _platform_config = json.loads(
                PLATFORM_CONFIG_PATH.read_text(encoding="utf-8")
            )
        except (OSError, json.JSONDecodeError):
            _platform_config = {}
    return _platform_config


def _host_of(url: str) -> str:
    try:
        return (urllib.parse.urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def is_platform_server(url: Optional[str]) -> bool:
    """True when url points at the company SonarQube server."""
    if not url:
        return False
    configured = (platform_config().get("server") or {}).get("url") or ""
    if not configured:
        return False
    return _host_of(url) == _host_of(configured)


def supports_branch_analysis(url: Optional[str]) -> bool:
    """False on the company server: Community Build has no branch/PR analysis.

    SONAR_ASSUME_BRANCH_ANALYSIS=1 overrides, for a future paid edition.
    """
    if (os.environ.get("SONAR_ASSUME_BRANCH_ANALYSIS") or "").strip() in {"1", "true", "yes"}:
        return True
    if not is_platform_server(url):
        return True
    edition = platform_config().get("edition") or {}
    return bool(edition.get("supportsBranchAnalysis", True))


def resolve_scope(
    branch: str, pr: str, url: Optional[str] = None
) -> Tuple[Dict[str, Any], str]:
    """Return (query params, human note) for the analysis scope to query.

    On a server without branch analysis, a pullRequest or branch scope matches
    no analysis at all, which reads as "no issues" rather than as an error. Force
    default-branch scope there and say why, instead of reporting a false all-clear.
    """
    if not supports_branch_analysis(url):
        note = (
            "default-branch scope forced: this SonarQube is Community Build, which "
            "analyses main/master only (no branch or pull-request analysis)"
        )
        details = []
        if pr:
            details.append(f"PR #{pr}")
        if branch:
            details.append(f"branch {branch}")
        if details:
            note += f"; ignoring {' and '.join(details)}"
        return {}, note
    if pr:
        return {"pullRequest": pr}, f"pull-request scope (PR #{pr})"
    if branch:
        return {"branch": branch}, f"branch scope ({branch})"
    return {}, "default-branch scope"


def emit_minimal(values: Dict[str, Any]) -> None:
    for key, value in values.items():
        if value is None:
            value = ""
        elif isinstance(value, bool):
            value = "true" if value else "false"
        elif isinstance(value, (list, tuple)):
            value = ",".join(str(v) for v in value)
        print(f"{key}={value}")


def run_cmd(args: List[str], cwd: Optional[Path] = None) -> Tuple[int, str, str]:
    try:
        proc = subprocess.run(
            args,
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            check=False,
        )
        return proc.returncode, (proc.stdout or "").strip(), (proc.stderr or "").strip()
    except FileNotFoundError:
        return 127, "", f"command not found: {args[0]}"


def which_ok(cmd: str) -> bool:
    code, _, _ = run_cmd(["where" if os.name == "nt" else "which", cmd])
    return code == 0


def normalize_url(url: str) -> str:
    return url.rstrip("/")


def resolve_url(cli_url: Optional[str] = None) -> Optional[str]:
    """--url, else SONARQUBE_URL, else the company server from platform-sonar.json."""
    url = (cli_url or os.environ.get("SONARQUBE_URL") or "").strip()
    if not url:
        server = platform_config().get("server") or {}
        if server.get("useAsDefault"):
            url = (server.get("url") or "").strip()
    if not url:
        return None
    return normalize_url(url)


def resolve_token() -> Optional[str]:
    for key in ("SONARQUBE_TOKEN", "SONARCLOUD_TOKEN", "SONAR_TOKEN"):
        value = (os.environ.get(key) or "").strip()
        if value:
            return value
    return None


def auth_mode(token: Optional[str]) -> str:
    if token:
        return "token"
    return "disabled"


def api_get(
    base_url: str,
    path: str,
    params: Optional[Dict[str, Any]] = None,
    token: Optional[str] = None,
    timeout: int = 30,
) -> Dict[str, Any]:
    query = ""
    if params:
        cleaned = {k: v for k, v in params.items() if v is not None and v != ""}
        query = "?" + urllib.parse.urlencode(cleaned, doseq=True)
    url = f"{normalize_url(base_url)}{path}{query}"
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} for {path}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Request failed for {path}: {exc}") from exc


def detect_branch(repo: Path) -> str:
    code, out, _ = run_cmd(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=repo)
    if code == 0 and out and out != "HEAD":
        return out
    return ""


def detect_pr(repo: Path) -> str:
    if not which_ok("gh"):
        return ""
    code, out, _ = run_cmd(
        ["gh", "pr", "view", "--json", "number", "-q", ".number"],
        cwd=repo,
    )
    if code == 0 and out.isdigit():
        return out
    return ""


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def detect_app_name(repo: Path) -> str:
    """The platform application id — the git remote's repo name, else the directory name."""
    code, out, _ = run_cmd(["git", "remote", "get-url", "origin"], cwd=repo)
    if code == 0 and out:
        name = out.rstrip("/").rsplit("/", 1)[-1]
        if name.endswith(".git"):
            name = name[: -len(".git")]
        if name:
            return name
    return repo.name


def detect_project_key(repo: Path, url: Optional[str] = None) -> str:
    props = repo / "sonar-project.properties"
    if props.exists():
        for line in _read_text(props).splitlines():
            line = line.strip()
            if line.startswith("sonar.projectKey="):
                return line.split("=", 1)[1].strip()

    # On the company server the platform registers every app as acme:<app>, so prefer that
    # over Maven coordinates or a package name — those would miss the project.
    # An explicit sonar-project.properties above still wins: the pipeline used it too.
    if is_platform_server(url):
        pattern = ((platform_config().get("projectKey") or {}).get("pattern") or "").strip()
        app = detect_app_name(repo)
        if pattern and app:
            return pattern.replace("<app>", app)

    cloud = repo / ".sonarcloud.properties"
    if cloud.exists():
        for line in _read_text(cloud).splitlines():
            line = line.strip()
            if line.startswith("sonar.projectKey="):
                return line.split("=", 1)[1].strip()

    pom = repo / "pom.xml"
    if pom.exists():
        try:
            root = ET.fromstring(_read_text(pom))
            ns = ""
            if root.tag.startswith("{"):
                ns = root.tag.split("}")[0] + "}"
            group = root.findtext(f"{ns}groupId") or ""
            artifact = root.findtext(f"{ns}artifactId") or ""
            # parent groupId fallback
            if not group:
                parent = root.find(f"{ns}parent")
                if parent is not None:
                    group = parent.findtext(f"{ns}groupId") or ""
            if group and artifact:
                return f"{group}:{artifact}"
            if artifact:
                return artifact
        except ET.ParseError:
            pass

    pkg = repo / "package.json"
    if pkg.exists():
        try:
            data = json.loads(_read_text(pkg) or "{}")
            name = data.get("name")
            if isinstance(name, str) and name:
                return name.lstrip("@").replace("/", ":")
        except json.JSONDecodeError:
            pass

    return repo.name


def detect_tech_stack(repo: Path) -> List[str]:
    tags: List[str] = []

    def add(*items: str) -> None:
        for item in items:
            if item not in tags:
                tags.append(item)

    if (repo / "pom.xml").exists() or any(repo.rglob("*.java")):
        add("java")
        if (repo / "pom.xml").exists():
            add("maven")
    if (repo / "build.gradle").exists() or (repo / "build.gradle.kts").exists():
        add("java", "gradle")
    if (repo / "package.json").exists():
        add("node")
    if (repo / "tsconfig.json").exists():
        add("typescript")
    if (repo / "go.mod").exists():
        add("go")
    if (repo / "pyproject.toml").exists() or (repo / "requirements.txt").exists():
        add("python")
    if (repo / "Cargo.toml").exists():
        add("rust")
    if list(repo.glob("*.csproj")):
        add("dotnet")
    return tags


def ensure_cache_dirs() -> None:
    for sub in ("rules", "findings", "techstack"):
        (CACHE_ROOT / sub).mkdir(parents=True, exist_ok=True)


def safe_filename(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", value)


def paginate(
    base_url: str,
    path: str,
    params: Dict[str, Any],
    list_key: str,
    token: Optional[str],
    page_size: int = 500,
) -> List[Dict[str, Any]]:
    page = 1
    items: List[Dict[str, Any]] = []
    while True:
        payload = api_get(
            base_url,
            path,
            {**params, "p": page, "ps": page_size},
            token=token,
        )
        batch = payload.get(list_key) or []
        if not isinstance(batch, list):
            break
        items.extend(batch)
        paging = payload.get("paging") or {}
        total = int(paging.get("total") or len(items))
        if len(items) >= total or not batch:
            break
        page += 1
    return items


def html_to_text(value: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    text = re.sub(r"</p\s*>", "\n\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    text = text.replace("&quot;", '"').replace("&#39;", "'")
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def cache_rule(
    base_url: str,
    rule_key: str,
    token: Optional[str],
) -> Path:
    ensure_cache_dirs()
    lang = rule_key.split(":", 1)[0] if ":" in rule_key else "unknown"
    out = CACHE_ROOT / "rules" / f"{safe_filename(lang)}_{safe_filename(rule_key)}.md"
    if out.exists():
        return out
    try:
        data = api_get(base_url, "/api/rules/show", {"key": rule_key}, token=token)
        rule = data.get("rule") or {}
        name = rule.get("name") or rule_key
        severity = rule.get("severity") or ""
        html_desc = rule.get("htmlDesc") or rule.get("mdDesc") or ""
        desc = html_to_text(html_desc) if "<" in html_desc else html_desc
        body = (
            f"# {rule_key}\n\n"
            f"**Name:** {name}\n\n"
            f"**Severity:** {severity}\n\n"
            f"## Description\n\n{desc or '_No description returned by API._'}\n"
        )
    except Exception as exc:  # noqa: BLE001 — cache a stub so agents can continue
        body = (
            f"# {rule_key}\n\n"
            f"_Failed to fetch rule details: {exc}_\n\n"
            "Apply a minimal, idiomatic fix for this Sonar rule.\n"
        )
    out.write_text(body, encoding="utf-8")
    return out
