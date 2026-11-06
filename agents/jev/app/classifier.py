from .schemas import ClassificationRequest, ClassificationResult

KEYWORDS = {
    "frontend": ["react", "css", "html", "frontend", "ui"],
    "backend": ["api", "backend", "server", "node.js", "express", "database"],
    "documentation": ["documentation", "docs", "readme", "tutorial"],
    "testing": ["test", "testing", "regression", "qa"],
    "security": ["security", "vulnerability", "cve", "authentication"],
    "ai_ml": ["machine learning", "model", "llm", "ai", "inference"]
}

def classify(item: ClassificationRequest) -> ClassificationResult:
    text = f"{item.title} {item.description}".lower()
    scores = {category: sum(1 for word in words if word in text) for category, words in KEYWORDS.items()}
    category = max(scores, key=scores.get) if max(scores.values(), default=0) else "other"
    matched = scores.get(category, 0)
    relevance = min(0.95, 0.45 + matched * 0.1) if matched else 0.35
    difficulty = "unknown"
    if any(word in text for word in ["simple", "typo", "small fix", "good first issue"]):
        difficulty = "easy"
    elif any(word in text for word in ["refactor", "architecture", "distributed", "performance"]):
        difficulty = "hard"
    elif matched:
        difficulty = "medium"
    priority = "high" if relevance >= 0.8 else "medium" if relevance >= 0.55 else "low"
    return ClassificationResult(
        opportunity_id=item.opportunity_id,
        category=category,
        technologies=sorted(set(item.technologies)),
        difficulty=difficulty,
        relevance_score=round(relevance, 2),
        priority=priority,
        confidence=0.55 if matched else 0.25,
        note="Baseline keyword classifier scaffold; replace with the trained JEV model before production use."
    )
