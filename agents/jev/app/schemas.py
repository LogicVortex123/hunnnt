from pydantic import BaseModel, Field
from typing import Literal

class ClassificationRequest(BaseModel):
    opportunity_id: str
    title: str
    description: str = ""
    technologies: list[str] = Field(default_factory=list)

class ClassificationResult(BaseModel):
    opportunity_id: str
    category: str
    technologies: list[str]
    difficulty: Literal["easy", "medium", "hard", "unknown"]
    relevance_score: float
    priority: Literal["low", "medium", "high"]
    confidence: float
    note: str
