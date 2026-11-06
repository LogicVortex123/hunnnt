from fastapi import FastAPI
from .schemas import ClassificationRequest
from .classifier import classify

app = FastAPI(title="OpportunityOS JEV Classifier", version="0.1.0")

@app.get("/health")
def health():
    return {"service": "jev", "status": "ok"}

@app.post("/classify")
def classify_opportunity(payload: ClassificationRequest):
    return classify(payload).model_dump()
