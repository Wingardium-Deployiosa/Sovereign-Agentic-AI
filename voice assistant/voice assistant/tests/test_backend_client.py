import httpx

from app.assistant.client import AssistantClient, BackendError
from app.config import BackendConfig


def _build_client(handler) -> AssistantClient:
    transport = httpx.MockTransport(handler)
    cfg = BackendConfig(url="http://test", timeout_seconds=5, session_id="s1")
    return AssistantClient(cfg, client=httpx.Client(transport=transport))


def test_query_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path == "/api/v1/assistant/query"
        body = request.read().decode()
        assert "voice" in body
        return httpx.Response(
            200,
            json={
                "response": "hello back",
                "sources": [],
                "artifacts": [],
            },
        )

    client = _build_client(handler)
    data = client.query("hello")
    assert data["response"] == "hello back"
    client.close()


def test_query_backend_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    client = _build_client(handler)
    with __import__("pytest").raises(BackendError):
        client.query("hello")
    client.close()


def test_query_unreachable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no network")

    client = _build_client(handler)
    with __import__("pytest").raises(BackendError):
        client.query("hello")
    client.close()