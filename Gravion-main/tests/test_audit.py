import json
import hashlib
from pathlib import Path
from backend.api.audit import AuditLogger, AUDIT_FILE
from backend.api.command import handle_command
from backend.api.documents import clear_all_documents
from backend.api.approvals import decide_approval, DecisionRequest
from backend.models.schemas import CommandRequest

def test_hash_integrity():
    AuditLogger.clear()
    AuditLogger.log("command", "User", "Test Action 1", "Detail 1", "ok")
    AuditLogger.log("system", "Sys", "Test Action 2", "Detail 2", "warn")
    
    events = AuditLogger._load()
    assert len(events) == 2
    
    # Check chain
    hash1 = events[0]["hash"]
    ev1_copy = dict(events[0])
    del ev1_copy["hash"]
    expected_hash1 = hashlib.sha256(("00000000" + json.dumps(ev1_copy, sort_keys=True)).encode()).hexdigest()[:8]
    assert hash1 == expected_hash1
    
    hash2 = events[1]["hash"]
    ev2_copy = dict(events[1])
    del ev2_copy["hash"]
    expected_hash2 = hashlib.sha256((hash1 + json.dumps(ev2_copy, sort_keys=True)).encode()).hexdigest()[:8]
    assert hash2 == expected_hash2
    
    print("Hash integrity test passed.")

def test_clear_behavior():
    AuditLogger.clear()
    AuditLogger.log("command", "User", "Test", "Detail", "ok")
    assert len(AuditLogger._load()) == 1
    
    clear_all_documents()
    assert len(AuditLogger._load()) == 0
    print("Clear behavior test passed.")

if __name__ == "__main__":
    test_hash_integrity()
    test_clear_behavior()
    print("All tests passed.")
