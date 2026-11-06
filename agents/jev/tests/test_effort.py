from app.classifier import _has, classify
from app.schemas import ClassificationRequest as R


def effort(title, description="", technologies=None):
    return classify(R(opportunity_id="t", title=title, description=description, technologies=technologies or [])).effort


def test_whole_word_matching():
    assert _has("fix the ui", "ui")
    assert not _has("fix the build", "ui")


def test_small_fix_is_quick():
    e = effort("Fix crash when config file is missing", "```\nTraceback ...\n```")
    assert e.doable_in_two_days
    assert e.bucket == "under_1_day"


def test_beginner_label_caps_effort():
    e = effort("Add new option to CLI", technologies=["good first issue"])
    assert e.hours <= 6


def test_broad_feature_is_multi_day():
    e = effort("Implement WearOS support and integrate the sync protocol")
    assert not e.doable_in_two_days
    assert e.bucket == "multi_day"


def test_checklist_adds_effort():
    body = "\n".join(f"- [ ] task {i}" for i in range(8))
    assert effort("Fix validation", body).hours > effort("Fix validation").hours


def test_old_contested_issue_is_multi_day():
    e = classify(R(opportunity_id="t", title="WearOS Support", comments=191, age_days=1400)).effort
    assert not e.doable_in_two_days


def test_solidity_not_classified_frontend():
    r = classify(R(opportunity_id="t", title="Fix InterestRateModel in Solidity contract build"))
    assert r.category == "smart_contracts"
    assert r.effort.reasons
