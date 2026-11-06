from pydantic import BaseModel, Field
from typing import Literal

EffortBucket = Literal["under_1_day", "1_2_days", "multi_day"]


class ClassificationRequest(BaseModel):
    opportunity_id: str
    title: str
    description: str = ""
    technologies: list[str] = Field(default_factory=list)
    # Optional activity signals (do not change effort, used only for context notes).
    comments: int = 0
    age_days: int = 0


class EffortEstimate(BaseModel):
    hours: int
    bucket: EffortBucket
    doable_in_two_days: bool
    confidence: float
    reasons: list[str]


class ClassificationResult(BaseModel):
    opportunity_id: str
    category: str
    technologies: list[str]
    difficulty: Literal["easy", "medium", "hard", "unknown"]
    relevance_score: float
    priority: Literal["low", "medium", "high"]
    confidence: float
    effort: EffortEstimate
    note: str
