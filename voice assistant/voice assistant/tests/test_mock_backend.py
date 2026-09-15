from fastapi.testclient import TestClient

from mock_backend.server import app


client = TestClient(app)


def test_root() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["service"] == "sovereign-voice-mock-backend"


def test_healthz() -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_query_inspection() -> None:
    response = client.post(
        "/api/v1/assistant/query",
        json={
            "session_id": "s1",
            "message": "Analyze the inspection report",
            "document_ids": [],
            "source": "voice",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "inspection" in body["response"].lower()


def test_query_empty_message_rejected() -> None:
    response = client.post(
        "/api/v1/assistant/query",
        json={
            "session_id": "s1",
            "message": "   ",
            "document_ids": [],
            "source": "voice",
        },
    )
    assert response.status_code == 400