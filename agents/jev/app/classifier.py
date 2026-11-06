import re

from .schemas import ClassificationRequest, ClassificationResult, EffortEstimate

KEYWORDS = {
    "frontend": ["react", "css", "html", "frontend", "ui", "vue", "svelte", "tailwind"],
    "backend": ["api", "backend", "server", "node.js", "express", "database", "sql", "endpoint"],
    "documentation": ["documentation", "docs", "readme", "tutorial"],
    "testing": ["test", "tests", "testing", "regression", "qa"],
    "security": ["security", "vulnerability", "cve", "authentication", "injection", "xss"],
    "ai_ml": ["machine learning", "model", "llm", "ai", "inference"],
    "smart_contracts": ["solidity", "smart contract", "evm", "erc20", "erc721"],
}

EASY_WORDS = ["simple", "typo", "small fix", "good first issue", "easy", "beginner", "first-timers-only"]
HARD_WORDS = ["refactor", "architecture", "distributed", "performance", "rewrite", "migration"]

# Scope words that usually mean multi-day work when they describe the task itself (title).
BIG_SCOPE = [
    "implement", "support", "integrate", "integration", "migrate", "port", "rewrite", "redesign",
    "framework", "suite", "architecture", "end-to-end", "e2e", "sdk", "plugin", "protocol",
    "new feature", "overhaul", "dashboard", "engine", "from scratch",
]
# Scope words that usually mean a contained change.
SMALL_SCOPE = [
    "typo", "docs", "readme", "rename", "bump", "flag", "option", "error message", "validate",
    "validation", "missing", "crash", "null", "off-by-one", "broken link", "fix", "handle", "timeout",
]

BASE_HOURS = {"easy": 4, "medium": 12, "hard": 32, "unknown": 14}


def _has(text: str, word: str) -> bool:
    """Whole-word match (avoids 'ui' matching 'build')."""
    return re.search(rf"(?<![a-z0-9]){re.escape(word)}(?![a-z0-9])", text) is not None


def _difficulty(text: str, matched: int) -> str:
    if any(_has(text, w) for w in EASY_WORDS):
        return "easy"
    if any(_has(text, w) for w in HARD_WORDS):
        return "hard"
    return "medium" if matched else "unknown"


def estimate_effort(item: ClassificationRequest, difficulty: str) -> EffortEstimate:
    title = item.title.lower()
    body = item.description
    body_l = body.lower()
    labels = " ".join(t.lower() for t in item.technologies)
    hours = float(BASE_HOURS[difficulty])
    reasons = [f"base {BASE_HOURS[difficulty]}h for {difficulty} difficulty"]

    big = [w for w in BIG_SCOPE if _has(title, w)]
    small = [w for w in SMALL_SCOPE if _has(title, w)]
    if big:
        hours += 12 * min(len(big), 3)
        reasons.append(f"broad scope in title: {', '.join(big[:3])}")
    if small and not big:
        hours *= 0.6
        reasons.append(f"contained change in title: {', '.join(small[:3])}")

    tasks = len(re.findall(r"^\s*[-*]\s*\[[ xX]\]", body, flags=re.MULTILINE))
    if tasks >= 3:
        hours += 2.5 * tasks
        reasons.append(f"{tasks} checklist items")

    if len(body) > 4000:
        hours += 8
        reasons.append("long spec (>4k chars)")
    elif 0 < len(body) < 300:
        reasons.append("very short description (scope unclear)")

    if "```" in body or "traceback" in body_l or re.search(r"\bat .+:\d+", body_l):
        hours = max(2, hours - 2)
        reasons.append("includes repro/stack trace")

    if any(_has(labels, w) or _has(title, w) for w in ["good first issue", "easy", "beginner"]):
        hours = min(hours, 6)
        reasons.append("labelled beginner-friendly")

    if any(_has(title, w) or _has(labels, w) for w in ["solidity", "smart contract", "audit"]):
        hours += 6
        reasons.append("smart-contract work needs extra testing/review")

    h = int(round(hours))
    bucket = "under_1_day" if h <= 8 else "1_2_days" if h <= 16 else "multi_day"
    # Keyword heuristics: confidence stays low until the trained model replaces this.
    confidence = 0.45 if len(reasons) >= 3 else 0.35
    return EffortEstimate(hours=h, bucket=bucket, doable_in_two_days=h <= 16, confidence=confidence, reasons=reasons)


def classify(item: ClassificationRequest) -> ClassificationResult:
    text = f"{item.title} {item.description}".lower()
    scores = {category: sum(1 for word in words if _has(text, word)) for category, words in KEYWORDS.items()}
    category = max(scores, key=scores.get) if max(scores.values(), default=0) else "other"
    matched = scores.get(category, 0)
    relevance = min(0.95, 0.45 + matched * 0.1) if matched else 0.35
    difficulty = _difficulty(text, matched)
    priority = "high" if relevance >= 0.8 else "medium" if relevance >= 0.55 else "low"
    return ClassificationResult(
        opportunity_id=item.opportunity_id,
        category=category,
        technologies=sorted(set(item.technologies)),
        difficulty=difficulty,
        relevance_score=round(relevance, 2),
        priority=priority,
        confidence=0.55 if matched else 0.25,
        effort=estimate_effort(item, difficulty),
        note="Baseline keyword classifier scaffold; replace with the trained JEV model before production use.",
    )
