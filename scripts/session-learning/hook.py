"""Local Codex closeout guard. No editor, network, model, export or learning calls."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def write_json(file, value):
    file.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".pending-", dir=file.parent)
    try:
        with os.fdopen(fd, "w") as output:
            json.dump(value, output, indent=2)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, file)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def read_json(file, default):
    return json.loads(file.read_text()) if file.exists() else default


def validate_closeout(closeout, root, projects):
    """Verify real file references; interpreting the feedback is still agent work."""
    if not isinstance(closeout, dict) or not isinstance(closeout.get("summary"), str) or not closeout["summary"].strip():
        return "Explain what was handled in summary."
    disposition = closeout.get("disposition")
    if disposition in ("no_learning", "unresolved"):
        return None
    if disposition != "evidence_linked":
        return "Use evidence_linked, no_learning or unresolved."
    evidence = closeout.get("evidence", [])
    if not isinstance(evidence, list) or not evidence:
        return "Link saved project evidence, or explicitly record unresolved."
    linked = set()
    for ref in evidence:
        if not isinstance(ref, dict):
            return "Evidence references must be objects."
        project = ref.get("project_id", "")
        if not isinstance(project, str) or not re.fullmatch(r"[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}", project) or ".." in project:
            return "Invalid project_id."
        project_root = (root / "projects" / project).resolve()
        if not project_root.is_relative_to((root / "projects").resolve()) or not project_root.is_dir():
            return "Project does not exist in this checkout."
        file = (root / str(ref.get("path", ""))).resolve()
        allowed = [project_root / "memory/events", project_root / "history", project_root / "proposals"]
        if file.suffix != ".json" or not any(file.is_relative_to(folder) for folder in allowed) or not file.is_file():
            return "Evidence must be an existing project memory event, history or proposal JSON."
        if hashlib.sha256(file.read_bytes()).hexdigest() != ref.get("sha256"):
            return "Evidence hash is absent or does not match the saved file."
        json.loads(file.read_text())
        linked.add(project)
    if set(projects) - linked:
        return "Link evidence for every observed project, or record unresolved with the gap."
    return None



def default_storage():
    """Audit receipts live in ~/.codex/dreamcut-audit. Keep using the folder created
    under the OpenEdit name when it is the only one, so open cycles are not lost."""
    current = Path.home() / ".codex" / "dreamcut-audit"
    legacy = Path.home() / ".codex" / "openedit-audit"
    return legacy if legacy.exists() and not current.exists() else current

def handle(payload, root=ROOT, storage=None):
    cwd = Path(payload.get("cwd", "")).resolve()
    if not cwd.is_relative_to(root.resolve()):
        return {}
    event = payload.get("hook_event_name")
    if event not in {"SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"}:
        return {}
    session = payload.get("session_id")
    if not isinstance(session, str) or not session:
        raise ValueError("Missing session_id; no verified audit receipt.")
    storage = storage or default_storage()
    directory = storage / digest(str(root.resolve()))[:20] / digest(session)[:24]
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (directory / "lock").open("a") as lock:
        os.chmod(directory / "lock", 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        state_path = directory / "state.json"
        state = read_json(state_path, {"cycle": None, "closed": True, "repairs": 0, "projects": [], "turns": []})
        # A repair is itself a new user turn. Do not reset an unresolved cycle,
        # otherwise Stop could repeatedly renew its continuation allowance.
        if state["closed"] and event != "SessionStart":
            state = {"cycle": uuid.uuid4().hex, "closed": False, "repairs": 0, "projects": [], "turns": []}
        turn = payload.get("turn_id")
        if isinstance(turn, str) and turn not in state["turns"]:
            state["turns"].append(turn)
        name = str(payload.get("tool_name", ""))
        args = payload.get("tool_input")
        if isinstance(args, dict) and name.startswith("mcp__") and re.search(r"sequence|timeline|assembly|proposal|editing_memory|frame_tag", name):
            project = args.get("project_id")
            if isinstance(project, str) and re.fullmatch(r"[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}", project) and ".." not in project and (root / "projects" / project).is_dir():
                if project not in state["projects"]:
                    state["projects"].append(project)
        receipt = {"at": time.time(), "event": event, "turn_id": turn, "tool_name": name,
                   "tool_use_id": payload.get("tool_use_id"), "cycle": state["cycle"]}
        write_json(directory / "receipts" / (uuid.uuid4().hex + ".json"), receipt)
        # No prompt, transcript, arguments or tool result is retained.
        closeout = directory / ((state["cycle"] or "pending") + ".closeout.json")
        guidance = f"DreamCut learning closeout: {closeout}. Follow docs/standards/session-learning-hooks.md. Reuse saved project evidence; do not manufacture lessons, export, run retros, or change preferences/skills for closeout."
        output = {}
        if event == "SessionStart":
            output = {"hookSpecificOutput": {"hookEventName": event, "additionalContext": "Read applicable personal style before editorial work. Learning bookkeeping is quiet; close out only when the user explicitly finishes the session."}}
        elif event == "UserPromptSubmit":
            # Older trusted registrations can still invoke this event. Stay quiet.
            pass
        elif event == "Stop" and payload.get("explicit_closeout") is True:
            error = validate_closeout(read_json(closeout, {}), root, state["projects"])
            if error:
                state["status"] = "incomplete"
                output = {"closeout": str(closeout), "error": error}
            else:
                state.update(closed=True, status=read_json(closeout, {})["disposition"])
                output = {"closeout": str(closeout), "status": state["status"]}
        write_json(state_path, state)
        return output


if __name__ == "__main__":
    try:
        print(json.dumps(handle(json.load(sys.stdin))))
    except Exception as error:
        print(json.dumps({"systemMessage": "DreamCut audit hook failed; this is NOT a verified closeout: " + str(error)}))
        sys.exit(1)
