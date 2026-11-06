from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"service": "jev", "status": "ok"}


def test_classify_frontend_easy():
    res = client.post("/classify", json={
        "opportunity_id": "opp-1",
        "title": "Fix React UI bug",
        "description": "small fix in css",
        "technologies": ["react", "react", "css"],
    })
    assert res.status_code == 200
    body = res.json()
    assert body["category"] == "frontend"
    assert body["difficulty"] == "easy"
    assert body["technologies"] == ["css", "react"]
    assert 0 <= body["relevance_score"] <= 0.95


def test_classify_unmatched_is_other_low():
    body = client.post("/classify", json={"opportunity_id": "opp-2", "title": "Zzz"}).json()
    assert body["category"] == "other"
    assert body["priority"] == "low"
    assert body["difficulty"] == "unknown"


def test_classify_rejects_missing_fields():
    assert client.post("/classify", json={"title": "no id"}).status_code == 422
