"""Foot & Frequency -- FastAPI service exposing the loyalty analytics layer."""
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .analytics import get_engine

app = FastAPI(
    title="Foot & Frequency API",
    description="Customer Loyalty, Segmentation & Churn Analytics Suite "
                "(Starbucks Capstone dataset).",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _warm():
    # Build RFM / segments / churn model / CLV once at startup.
    get_engine()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/overview")
def overview():
    return get_engine().overview()


@app.get("/api/segments")
def segments():
    return {"segments": get_engine().segments()}


@app.get("/api/customers")
def customers(
    segment: str | None = None,
    risk: str | None = None,
    search: str | None = None,
    sort_by: str = "churn_prob",
    descending: bool = True,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return get_engine().customers_table(
        segment=segment, risk=risk, search=search, sort_by=sort_by,
        descending=descending, limit=limit, offset=offset)


@app.get("/api/customers/{person_id}")
def customer_360(person_id: str):
    result = get_engine().customer_360(person_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return result


@app.get("/api/churn/drivers")
def churn_drivers():
    return get_engine().churn_drivers()


@app.get("/api/uplift")
def uplift():
    return get_engine().uplift()


class CampaignRequest(BaseModel):
    offer_type: str
    target_segment: str | None = None
    audience_size: int = 1000


@app.post("/api/campaign/simulate")
def simulate(req: CampaignRequest):
    if req.audience_size < 1 or req.audience_size > 1_000_000:
        raise HTTPException(status_code=400, detail="audience_size out of range")
    return get_engine().simulate_campaign(
        offer_type=req.offer_type,
        target_segment=req.target_segment,
        audience_size=req.audience_size)
