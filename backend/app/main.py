from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError, OperationalError
import pandas as pd
import time
import os
import numpy as np
from app.engine.reconciler import run_reconciliation
from app.engine.evaluate import evaluate_metrics
from app.db.session import engine
from app.agent.llm import (
    handle_chat,
    _generate_journal_entry_impl,
    get_conversation_history,
    clear_conversation_history,
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

app = FastAPI(title="Vyaya AI Finance Controller")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _run_and_persist_reconciliation():
    """Shared logic used by both the API endpoint and the startup hook."""
    start_time = time.time()

    merged_ledger = run_reconciliation(DATA_DIR)
    reconciled = merged_ledger[merged_ledger['exception_category'] == "RECONCILED"]
    exceptions = merged_ledger[merged_ledger['exception_category'] != "RECONCILED"]

    with engine.begin() as conn:
        merged_ledger.to_sql("ledger", conn, if_exists="replace", index=False)
        exceptions.to_sql("exceptions", conn, if_exists="replace", index=False)

    elapsed = time.time() - start_time

    return {
        "status": "success",
        "telemetry": {
            "records_processed": len(merged_ledger),
            "time_seconds": round(elapsed, 2),
            "auto_matched_pct": round((len(reconciled) / len(merged_ledger)) * 100, 1)
        }
    }


@app.on_event("startup")
def run_reconciliation_on_boot():
    try:
        result = _run_and_persist_reconciliation()
        print(f"[startup] Reconciliation ran automatically: {result['telemetry']}")
    except Exception as e:
        print(f"[startup] WARNING: automatic reconciliation failed: {e}")


@app.post("/api/run-reconciliation")
def trigger_reconciliation():
    return _run_and_persist_reconciliation()


def _safe_read_sql(query, params=None):
    try:
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params=params or {})
        return df, None
    except (ProgrammingError, OperationalError):
        return None, JSONResponse(
            status_code=503,
            content={"error": "Reconciliation has not been run yet. Try POST /api/run-reconciliation."}
        )


@app.get("/api/ledger")
def get_ledger(page: int = 1, limit: int = 50):
    offset = (page - 1) * limit
    query = text("SELECT * FROM ledger WHERE exception_category = 'RECONCILED' LIMIT :limit OFFSET :offset")
    df, error = _safe_read_sql(query, {"limit": limit, "offset": offset})
    if error:
        return error

    df = df.replace({np.nan: None})
    return df.to_dict(orient="records")


@app.get("/api/exceptions")
def get_exceptions(category: str = None, order_id: str = None, page: int = 1, limit: int = 50):
    offset = (page - 1) * limit

    conditions = []
    params = {"limit": limit, "offset": offset}

    if category:
        conditions.append("exception_category = :category")
        params["category"] = category
    if order_id:
        conditions.append("order_id = :order_id")
        params["order_id"] = order_id

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = text(f"SELECT * FROM exceptions {where_clause} LIMIT :limit OFFSET :offset")

    df, error = _safe_read_sql(query, params)
    if error:
        return error

    df = df.replace({np.nan: None})
    return df.to_dict(orient="records")


@app.get("/api/metrics")
def get_metrics():
    try:
        metrics_df = evaluate_metrics(DATA_DIR)
    except (ProgrammingError, OperationalError):
        return JSONResponse(
            status_code=503,
            content={"error": "Reconciliation has not been run yet. Try POST /api/run-reconciliation."}
        )
    return {"precision_recall": metrics_df.to_dict(orient="records")}


@app.get("/api/exceptions/summary")
def get_exceptions_summary():
    query = text("SELECT exception_category, COUNT(*) as count FROM exceptions GROUP BY exception_category")
    df, error = _safe_read_sql(query, {})
    if error:
        return error

    return dict(zip(df['exception_category'], df['count']))


@app.get("/api/audit-export")
def get_audit_export():
    query = text("""
        SELECT utr, settlement_id, order_id, gross_amount, expected_mdr,
               expected_gst_on_mdr, expected_tds, expected_net_amount, exception_category
        FROM ledger
    """)
    df, error = _safe_read_sql(query)
    if error:
        return error

    export_path = os.path.join(DATA_DIR, "audit_export.csv")
    df.to_csv(export_path, index=False)
    return FileResponse(export_path, media_type="text/csv", filename="Vyaya_Audit_Export.csv")


# ---------------------------------------------------------
# AI Agent & Resolution Endpoints (Spec Sections 12 & 13)
# ---------------------------------------------------------

class JournalRequest(BaseModel):
    order_id: str


class ChatRequest(BaseModel):
    message: str
    conversation_id: str = "default"


@app.post("/api/journal-entry")
def create_journal_entry(request: JournalRequest):
    resolution_data = _generate_journal_entry_impl(request.order_id)

    if isinstance(resolution_data, dict) and "error" in resolution_data:
        return resolution_data

    query = text("SELECT exception_category FROM exceptions WHERE order_id = :oid LIMIT 1")
    df, error = _safe_read_sql(query, {"oid": request.order_id})
    category = df.iloc[0]["exception_category"] if (df is not None and not df.empty) else None

    return {
        "order_id": request.order_id,
        "category": category,
        "resolution": resolution_data
    }


@app.post("/api/agent/chat")
def agent_chat(request: ChatRequest):
    reply = handle_chat(request.message, conversation_id=request.conversation_id)
    return JSONResponse(
        content={"reply": reply},
        media_type="application/json; charset=utf-8"
    )


@app.get("/api/agent/chat/history")
def get_chat_history(conversation_id: str = "default"):
    """Returns the stored clean user/assistant turns for a conversation,
    so the frontend can reload a chat after the drawer is closed and
    reopened (or the page is refreshed), instead of starting blank."""
    history = get_conversation_history(conversation_id)
    return {"conversation_id": conversation_id, "messages": history}


@app.delete("/api/agent/chat/history")
def delete_chat_history(conversation_id: str = "default"):
    """Optional: lets the frontend offer a 'clear chat' action."""
    clear_conversation_history(conversation_id)
    return {"status": "cleared", "conversation_id": conversation_id}