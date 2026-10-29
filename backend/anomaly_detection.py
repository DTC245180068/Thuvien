"""
Module: anomaly_detection.py
Chức năng: Phát hiện giao dịch mượn trả bất thường (Anomaly Detection) dựa trên bảng Borrow_Records.
Quy tắc vi phạm:
  1. Thời gian mượn - trả dưới 15 phút (< 15 mins).
  2. Một độc giả mượn liên tục 5 cuốn sách ở trạng thái 'Báo mất' (BaoMat).
Hệ thống chạy background task định kỳ, tự động cập nhật is_flagged = True, anomaly_score > 0.8 vào database.
"""

import os
import sys
import time
import asyncio
import threading
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel
from sqlalchemy import text

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import db_manager
from auth_dependency import verify_admin_role

router = APIRouter(prefix="/api/ai", tags=["AI Anomaly Detection"], dependencies=[Depends(verify_admin_role)])

# Biến cờ kiểm soát background task
_bg_thread = None
_stop_event = threading.Event()


class AnomalyRecordResponse(BaseModel):
    id: int
    book_id: int
    book_title: str
    user_id: int
    reader_name: str
    borrow_date: Optional[str] = None
    due_date: Optional[str] = None
    actual_return_date: Optional[str] = None
    borrow_type: str = "Mượn về nhà"
    status: str
    is_flagged: bool = True
    anomaly_score: float = 0.0
    anomaly_reason: str = ""


def _parse_iso_dt(dt_str: Optional[str]) -> Optional[datetime]:
    if not dt_str:
        return None
    try:
        clean = str(dt_str).strip().replace("Z", "").replace(" ", "T")
        if "+" in clean:
            clean = clean.split("+")[0]
        return datetime.fromisoformat(clean)
    except Exception:
        return None


def run_anomaly_detection_scan() -> Dict[str, Any]:
    """
    Thực thi quy tắc kiểm tra bất thường trên bảng borrow_records:
    - Quy tắc 1: Mượn - trả dưới 15 phút
    - Quy tắc 2: Một user có 5 cuốn sách trở lên ở trạng thái Báo mất
    """
    db = db_manager.load_db()
    borrows = db.get("borrowRecords", [])
    users = {u.get("id"): u.get("fullName") or u.get("username") for u in db.get("users", [])}
    books = {b.get("id"): b.get("title") for b in db.get("books", [])}

    flagged_ids = {}  # record_id -> (score, reason)

    # -------------------------------------------------------------
    # QUY TẮC 1: THỜI GIAN MƯỢN - TRẢ DƯỚI 15 PHÚT
    # -------------------------------------------------------------
    for r in borrows:
        b_date_str = r.get("borrowDate")
        r_date_str = r.get("actualReturnDate") or r.get("returnDate")
        r_status = r.get("status", "")

        if r_status in ["Đã trả", "Completed"] and b_date_str and r_date_str:
            b_dt = _parse_iso_dt(b_date_str)
            r_dt = _parse_iso_dt(r_date_str)
            if b_dt and r_dt:
                duration_minutes = (r_dt - b_dt).total_seconds() / 60.0

                # Nếu mượn và trả trong vòng dưới 15 phút
                if 0 <= duration_minutes < 15:
                    score = round(min(0.98, 0.85 + (15 - duration_minutes) * 0.01), 2)
                    flagged_ids[r.get("id")] = (
                        score,
                        f"Bất thường thời gian: Mượn và trả sách chỉ trong {duration_minutes:.1f} phút (< 15 phút)."
                    )

    # -------------------------------------------------------------
    # QUY TẮC 2: MỘT USER CÓ 5 CUỐN LIÊN TIẾP BÁO MẤT (BaoMat)
    # -------------------------------------------------------------
    user_lost_records = {}  # user_id -> list of records
    for r in borrows:
        status_val = (r.get("status") or "").lower()
        notes_val = (r.get("notes") or "").lower()
        is_lost = any(kw in status_val for kw in ["baomat", "báo mất", "mất", "lost"]) or "báo mất" in notes_val
        
        if is_lost:
            u_id = r.get("userId") or r.get("readerId")
            if u_id:
                if u_id not in user_lost_records:
                    user_lost_records[u_id] = []
                user_lost_records[u_id].append(r)

    for u_id, lost_list in user_lost_records.items():
        if len(lost_list) >= 5:
            user_name = users.get(u_id, f"Độc giả #{u_id}")
            for rec in lost_list:
                rec_id = rec.get("id")
                flagged_ids[rec_id] = (
                    0.96,
                    f"Rủi ro gian lận cao: Độc giả '{user_name}' (ID: {u_id}) có {len(lost_list)} cuốn sách liên tiếp ở trạng thái Báo mất!"
                )

    # Cập nhật kết quả vào Database (cả MySQL và SQLite)
    updated_count = 0
    now = datetime.utcnow()

    engine = (
        db_manager.mysql_mgr.engine
        if (db_manager.mysql_mgr.is_connected() and db_manager.mysql_mgr.engine)
        else db_manager.mysql_mgr.sqlite_engine
    )

    if engine and flagged_ids:
        update_sql = """
        UPDATE borrow_records 
        SET is_flagged = :is_flagged, 
            anomaly_score = :anomaly_score, 
            anomaly_reason = :anomaly_reason
        WHERE id = :id;
        """
        try:
            with engine.connect() as conn:
                for rid, (score, reason) in flagged_ids.items():
                    conn.execute(text(update_sql), {
                        "id": rid,
                        "is_flagged": True,
                        "anomaly_score": score,
                        "anomaly_reason": reason
                    })
                    updated_count += 1
                conn.commit()
        except Exception as e:
            print(f"[AnomalyDetection] Error updating records: {e}")

    # Đồng bộ bộ nhớ đệm RAM / Local JSON
    for r in borrows:
        rid = r.get("id")
        if rid in flagged_ids:
            score, reason = flagged_ids[rid]
            r["is_flagged"] = True
            r["isFlagged"] = True
            r["anomaly_score"] = score
            r["anomalyScore"] = score
            r["anomaly_reason"] = reason
            r["anomalyReason"] = reason

    return {
        "scan_time": now.isoformat(),
        "total_checked": len(borrows),
        "total_anomalies_detected": len(flagged_ids),
        "flagged_record_ids": list(flagged_ids.keys())
    }


def _background_worker():
    """Vòng lặp background task chạy định kỳ kiểm tra bất thường mỗi 60 giây"""
    print("[AnomalyDetection] Background task dinh ky da duoc kich hoat (chu ky 60s).")
    while not _stop_event.is_set():
        try:
            res = run_anomaly_detection_scan()
            if res.get("total_anomalies_detected", 0) > 0:
                print(f"[AnomalyDetection] Phat hien {res['total_anomalies_detected']} giao dich bat thuong trong CSDL!")
        except Exception as e:
            print(f"[AnomalyDetection Worker Error]: {e}")
        # Chờ 60 giây hoặc cho đến khi có tín hiệu dừng
        _stop_event.wait(60)


def start_background_detector():
    global _bg_thread
    if _bg_thread is None or not _bg_thread.is_alive():
        _stop_event.clear()
        _bg_thread = threading.Thread(target=_background_worker, daemon=True, name="AnomalyDetectorWorker")
        _bg_thread.start()


# Khởi động background worker
start_background_detector()


# ================= API ENDPOINTS CHO FRONTEND =================

@router.get("/anomalies", response_model=List[AnomalyRecordResponse])
def get_flagged_anomalies():
    """
    API lấy danh sách toàn bộ các giao dịch mượn trả có is_flagged = True
    để hiển thị trên Component AlertQueue.
    """
    db = db_manager.load_db()
    borrows = db.get("borrowRecords", [])
    users = {u.get("id"): u.get("fullName") or u.get("username") for u in db.get("users", [])}
    books = {b.get("id"): b.get("title") for b in db.get("books", [])}

    flagged_list = []
    for r in borrows:
        if r.get("is_flagged") or r.get("isFlagged"):
            score = float(r.get("anomaly_score") or r.get("anomalyScore") or 0.85)
            reason = r.get("anomaly_reason") or r.get("anomalyReason") or "Giao dịch có dấu hiệu bất thường"
            u_id = r.get("userId") or r.get("readerId") or 1
            b_id = r.get("bookId") or 1

            flagged_list.append(AnomalyRecordResponse(
                id=r.get("id"),
                book_id=b_id,
                book_title=r.get("bookTitle") or books.get(b_id, f"Sách #{b_id}"),
                user_id=u_id,
                reader_name=r.get("readerName") or users.get(u_id, f"Độc giả #{u_id}"),
                borrow_date=r.get("borrowDate"),
                due_date=r.get("dueDate") or r.get("returnDate"),
                actual_return_date=r.get("actualReturnDate"),
                borrow_type=r.get("borrowType") or "Mượn về nhà",
                status=r.get("status") or "Đang mượn",
                is_flagged=True,
                anomaly_score=score,
                anomaly_reason=reason
            ))

    # Sắp xếp theo mức độ nguy hiểm (anomaly_score giảm dần)
    flagged_list.sort(key=lambda x: x.anomaly_score, reverse=True)
    return flagged_list


@router.post("/anomalies/scan")
def trigger_manual_scan():
    """API cho phép Admin kích hoạt quét bất thường thủ công ngay lập tức"""
    result = run_anomaly_detection_scan()
    return {
        "success": True,
        "message": "Đã quét thành công",
        "data": result
    }


@router.post("/anomalies/{record_id}/resolve")
def resolve_anomaly(record_id: int):
    """API gỡ cờ cảnh báo (đánh dấu Admin đã kiểm tra và xử lý an toàn)"""
    engine = (
        db_manager.mysql_mgr.engine
        if (db_manager.mysql_mgr.is_connected() and db_manager.mysql_mgr.engine)
        else db_manager.mysql_mgr.sqlite_engine
    )

    if engine:
        try:
            with engine.connect() as conn:
                conn.execute(
                    text("UPDATE borrow_records SET is_flagged = 0, anomaly_score = 0.0, anomaly_reason = NULL WHERE id = :id;"),
                    {"id": record_id}
                )
                conn.commit()
        except Exception as e:
            print(f"[AnomalyDetection] Error resolving anomaly: {e}")

    # Đồng bộ bộ nhớ RAM
    db = db_manager.load_db()
    for r in db.get("borrowRecords", []):
        if r.get("id") == record_id:
            r["is_flagged"] = False
            r["isFlagged"] = False
            r["anomaly_score"] = 0.0
            r["anomalyScore"] = 0.0
            r["anomaly_reason"] = ""
            r["anomalyReason"] = ""

    return {"success": True, "message": f"Đã gỡ cờ cảnh báo cho phiếu mượn #{record_id}."}

