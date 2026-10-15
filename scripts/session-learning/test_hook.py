import concurrent.futures
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from hook import handle, validate_closeout, write_json


class HookTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "repo"
        self.root.mkdir()
        self.storage = Path(self.temp.name) / "audit"

    def call(self, event, **extra):
        return handle({"cwd": str(self.root), "session_id": "test", "turn_id": "turn", "hook_event_name": event, **extra}, self.root, self.storage)

    def closeout(self):
        return next(self.storage.rglob("*.closeout.json"))

    def test_quiet_turns_and_explicit_closeout(self):
        self.assertEqual(self.call("UserPromptSubmit"), {})
        self.assertEqual(self.call("Stop"), {})
        self.assertEqual(list(self.storage.rglob("*.closeout.json")), [])
        result = self.call("Stop", explicit_closeout=True)
        self.assertIn("error", result)
        self.assertNotIn("decision", result)
        write_json(Path(result["closeout"]), {"disposition": "no_learning", "summary": "Explicit session finish"})
        self.assertEqual(self.call("Stop", explicit_closeout=True)["status"], "no_learning")

    def test_read_only_and_privacy(self):
        self.call("UserPromptSubmit", prompt="PRIVATE_PROMPT", transcript_path="PRIVATE_TRANSCRIPT")
        self.call("PreToolUse", tool_name="Bash", tool_input={"command": "PRIVATE_COMMAND"})
        self.call("PostToolUse", tool_name="Bash", tool_response="PRIVATE_RESULT")
        self.assertEqual(self.call("Stop"), {})
        self.assertNotIn("PRIVATE_", "".join(x.read_text() for x in self.storage.rglob("*.json")))

    def test_evidence_and_tampering(self):
        file = self.root / "projects/demo/memory/events/event.json"
        write_json(file, {"id": "example", "summary": "Quieter music"})
        ref = {"project_id": "demo", "path": str(file.relative_to(self.root)), "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}
        data = {"disposition": "evidence_linked", "summary": "Linked correction", "evidence": [ref]}
        self.assertIsNone(validate_closeout(data, self.root, ["demo"]))
        self.assertIsNotNone(validate_closeout(data, self.root, ["demo", "another"]))
        write_json(file, {"changed": True})
        self.assertIsNotNone(validate_closeout(data, self.root, ["demo"]))
        ref["path"] = "../../outside.json"
        self.assertIsNotNone(validate_closeout(data, self.root, []))

    def test_repo_scope_and_concurrency(self):
        self.assertEqual(handle({"cwd": "/", "hook_event_name": "Stop"}, self.root, self.storage), {})
        self.call("UserPromptSubmit")
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda i: self.call("PostToolUse", tool_use_id=str(i)), range(20)))
        self.assertEqual(len(list(self.storage.rglob("receipts/*.json"))), 21)

    def test_projects_do_not_get_guessed_or_lost(self):
        for project in ["one", "two"]:
            (self.root / "projects" / project).mkdir(parents=True)
        self.call("UserPromptSubmit")
        self.call("PreToolUse", tool_name="Bash", tool_input={"project_id": "one"})
        for project in ["one", "two"]:
            self.call("PostToolUse", tool_name="mcp__dreamcut__timeline_get", tool_input={"project_id": project})
        state = json.loads(next(self.storage.rglob("state.json")).read_text())
        self.assertEqual(state["projects"], ["one", "two"])


if __name__ == "__main__":
    unittest.main()
