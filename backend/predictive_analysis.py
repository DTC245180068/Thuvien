"""
Module: predictive_analysis.py
Chức năng: Phân tích dự báo nhu cầu mượn sách và đề xuất kế hoạch nhập sách bằng Pandas.
Phương pháp: Simple Moving Average (SMA), Growth Trend Momentum & Shortage Gap Analysis.
Tác vụ: Đọc và gộp file log (Exam1.csv, Exam2.csv, Exam3.csv) bằng pd.read_csv, pd.concat, pd.merge,
        tính toán nhu cầu tháng tới, xác định 5 đầu sách có nguy cơ thiếu hụt cao nhất và lưu vào bảng ai_procurement.
"""

import os
import sys
import json
import random

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

import numpy as np
import pandas as pd
from sqlalchemy import text

# Thêm đường dẫn backend vào sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import db_manager
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix='/api/ai', tags=['AI Predictive Analysis'])

@router.get('/procurement-forecast')
def get_procurement_forecast():
    predictor = DemandPredictor()
    records = []
    try:
        eng = predictor.engine
        if eng:
            with eng.connect() as conn:
                res = conn.execute(text('SELECT * FROM ai_procurement ORDER BY id DESC LIMIT 5')).fetchall()
                for row in res:
                    d = dict(row._mapping)
                    for k, v in d.items():
                        if hasattr(v, 'isoformat'):
                            d[k] = v.isoformat()
                        elif isinstance(v, (int, float, str, bool)) or v is None:
                            pass
                        else:
                            d[k] = str(v)
                    records.append(d)
    except Exception as e:
        print(f'Error fetching procurement records: {e}')
    if not records:
        df = predictor.run_prediction_pipeline()
        records = df.to_dict(orient='records')
    return {'success': True, 'data': records}

@router.post('/procurement-forecast/run')
def trigger_procurement_forecast():
    predictor = DemandPredictor()
    df = predictor.run_prediction_pipeline()
    records = df.to_dict(orient='records')
    return {'success': True, 'data': records}


class DemandPredictor:
    def __init__(self, log_dir: Optional[str] = None):
        self.log_dir = log_dir or os.path.join(backend_dir, "data", "logs")
        os.makedirs(self.log_dir, exist_ok=True)
        self.engine = (
            db_manager.mysql_mgr.engine 
            if (db_manager.mysql_mgr.is_connected() and db_manager.mysql_mgr.engine)
            else db_manager.mysql_mgr.sqlite_engine
        )

    def _ensure_sample_csv_logs(self):
        """
        Khởi tạo các file log Exam1.csv, Exam2.csv, Exam3.csv mẫu nếu chưa có
        để đảm bảo pipeline pd.read_csv và pd.merge luôn có dữ liệu phong phú để xử lý.
        """
        exam1_path = os.path.join(self.log_dir, "Exam1.csv")
        exam2_path = os.path.join(self.log_dir, "Exam2.csv")
        exam3_path = os.path.join(self.log_dir, "Exam3.csv")

        if os.path.exists(exam1_path) and os.path.exists(exam2_path) and os.path.exists(exam3_path):
            return [exam1_path, exam2_path, exam3_path]

        # Lấy danh sách sách từ DB
        db = db_manager.load_db()
        books = db.get("books", [])
        if not books:
            book_ids = list(range(1, 51))
        else:
            book_ids = [int(b.get("id")) for b in books if not b.get("isUpcoming")]

        # Tạo log tháng 7/2026 (Exam1.csv)
        rows_exam1 = []
        for i in range(1, 150):
            b_id = random.choice(book_ids[:20] * 3 + book_ids[20:])
            d = datetime(2026, 7, random.randint(1, 31), random.randint(8, 17), random.randint(0, 59))
            rows_exam1.append({
                "borrow_id": f"EX1-{i:04d}",
                "book_id": b_id,
                "user_id": random.randint(1, 15),
                "borrow_date": d.strftime("%Y-%m-%d %H:%M:%S"),
                "status": "Đã trả",
                "borrow_type": random.choice(["Mượn về nhà", "Đọc tại chỗ"])
            })
        pd.DataFrame(rows_exam1).to_csv(exam1_path, index=False, encoding="utf-8")

        # Tạo log tháng 8/2026 (Exam2.csv)
        rows_exam2 = []
        for i in range(1, 180):
            b_id = random.choice(book_ids[:15] * 4 + book_ids[15:])
            d = datetime(2026, 8, random.randint(1, 31), random.randint(8, 17), random.randint(0, 59))
            rows_exam2.append({
                "borrow_id": f"EX2-{i:04d}",
                "book_id": b_id,
                "user_id": random.randint(1, 20),
                "borrow_date": d.strftime("%Y-%m-%d %H:%M:%S"),
                "status": "Đã trả",
                "borrow_type": random.choice(["Mượn về nhà", "Đọc tại chỗ"])
            })
        pd.DataFrame(rows_exam2).to_csv(exam2_path, index=False, encoding="utf-8")

        # Tạo log tháng 9/2026 (Exam3.csv)
        rows_exam3 = []
        for i in range(1, 210):
            b_id = random.choice(book_ids[:10] * 5 + book_ids[10:])
            d = datetime(2026, 9, random.randint(1, 28), random.randint(8, 17), random.randint(0, 59))
            rows_exam3.append({
                "borrow_id": f"EX3-{i:04d}",
                "book_id": b_id,
                "user_id": random.randint(1, 25),
                "borrow_date": d.strftime("%Y-%m-%d %H:%M:%S"),
                "status": random.choice(["Đã trả", "Đang mượn"]),
                "borrow_type": "Mượn về nhà"
            })
        pd.DataFrame(rows_exam3).to_csv(exam3_path, index=False, encoding="utf-8")

        return [exam1_path, exam2_path, exam3_path]

    def _ensure_procurement_table(self):
        """Khởi tạo bảng ai_procurement nếu chưa tồn tại"""
        create_sql = """
        CREATE TABLE IF NOT EXISTS ai_procurement (
            id INT AUTO_INCREMENT PRIMARY KEY,
            book_id INT NOT NULL,
            book_title VARCHAR(255) NOT NULL,
            category VARCHAR(100),
            current_inventory INT NOT NULL DEFAULT 0,
            available_copies INT NOT NULL DEFAULT 0,
            recent_monthly_avg FLOAT NOT NULL DEFAULT 0.0,
            projected_demand INT NOT NULL DEFAULT 0,
            shortage_risk VARCHAR(50) NOT NULL DEFAULT 'HIGH',
            recommended_procurement INT NOT NULL DEFAULT 0,
            confidence_score FLOAT NOT NULL DEFAULT 0.0,
            analysis_date DATETIME NOT NULL,
            notes TEXT,
            created_at DATETIME NOT NULL
        );
        """
        sqlite_create_sql = """
        CREATE TABLE IF NOT EXISTS ai_procurement (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            book_title VARCHAR(255) NOT NULL,
            category VARCHAR(100),
            current_inventory INTEGER NOT NULL DEFAULT 0,
            available_copies INTEGER NOT NULL DEFAULT 0,
            recent_monthly_avg REAL NOT NULL DEFAULT 0.0,
            projected_demand INTEGER NOT NULL DEFAULT 0,
            shortage_risk VARCHAR(50) NOT NULL DEFAULT 'HIGH',
            recommended_procurement INTEGER NOT NULL DEFAULT 0,
            confidence_score REAL NOT NULL DEFAULT 0.0,
            analysis_date DATETIME NOT NULL,
            notes TEXT,
            created_at DATETIME NOT NULL
        );
        """
        try:
            if db_manager.mysql_mgr.is_connected() and db_manager.mysql_mgr.engine:
                with db_manager.mysql_mgr.engine.connect() as conn:
                    conn.execute(text(create_sql))
                    conn.commit()
        except Exception as e:
            print(f"[PredictiveAnalysis] MySQL create table notice: {e}")

        try:
            if db_manager.mysql_mgr.sqlite_engine:
                with db_manager.mysql_mgr.sqlite_engine.connect() as conn:
                    conn.execute(text(sqlite_create_sql))
                    conn.commit()
        except Exception as e:
            print(f"[PredictiveAnalysis] SQLite create table notice: {e}")

    def run_prediction_pipeline(self) -> pd.DataFrame:
        """
        Thực thi trọn vẹn quy trình phân tích và dự báo nhu cầu nhập sách bằng Pandas:
        1. Đọc Exam1.csv, Exam2.csv, Exam3.csv bằng pd.read_csv
        2. Gộp nối các tập log bằng pd.concat
        3. Kết hợp thông tin danh mục sách bằng pd.merge
        4. Gom nhóm theo book_id & chu kỳ tháng
        5. Áp dụng Simple Moving Average (SMA-3) & Trend Momentum
        6. Đánh giá khoảng thiếu hụt (Shortage Gap) và xếp hạng rủi ro
        7. Lưu kết quả Top 5 sách cần nhập vào bảng ai_procurement
        """
        print("=" * 80)
        print("  SMARTLIB AI DEMAND FORECASTING & PROCUREMENT PIPELINE (PANDAS)")
        print("=" * 80)

        # -------------------------------------------------------------
        # BƯỚC 1: ĐỌC DỮ LIỆU TỪ CÁC FILE CSV LOG (Exam1, Exam2, Exam3)
        # -------------------------------------------------------------
        csv_files = self._ensure_sample_csv_logs()
        print(f"\n[BƯỚC 1] Đọc các file log mượn trả bằng pd.read_csv:")
        dfs = []
        for file_path in csv_files:
            df_part = pd.read_csv(file_path)
            print(f"  -> Đã đọc '{os.path.basename(file_path)}': {len(df_part)} dòng, {len(df_part.columns)} cột")
            dfs.append(df_part)

        # Gộp tất cả các bảng log theo chiều dọc
        df_logs = pd.concat(dfs, ignore_index=True)
        print(f"  => Tổng số bản ghi log sau khi pd.concat: {len(df_logs)} dòng.")

        # Nạp thêm các phiếu mượn thực tế từ CSDL nếu có
        try:
            db = db_manager.load_db()
            live_borrows = db.get("borrowRecords", [])
            if live_borrows:
                df_live = pd.DataFrame(live_borrows)
                df_live = df_live.rename(columns={"id": "borrow_id", "bookId": "book_id", "borrowDate": "borrow_date"})
                keep_cols = [c for c in ["borrow_id", "book_id", "user_id", "borrow_date", "status", "borrow_type"] if c in df_live.columns]
                df_live = df_live[keep_cols]
                df_logs = pd.concat([df_logs, df_live], ignore_index=True)
                print(f"  => Tích hợp thêm {len(df_live)} phiếu mượn từ Live Database. Tổng: {len(df_logs)} dòng.")
        except Exception as e:
            print(f"  [Lưu ý] Đọc Live Database: {e}")

        # -------------------------------------------------------------
        # BƯỚC 2: TIỀN XỬ LÝ & MERGE VỚI DANH MỤC SÁCH (pd.merge)
        # -------------------------------------------------------------
        print(f"\n[BƯỚC 2] Tiền xử lý dữ liệu và pd.merge với danh mục sách:")
        # Chuẩn hóa thời gian mượn
        df_logs["borrow_date"] = pd.to_datetime(df_logs["borrow_date"], errors="coerce")
        df_logs = df_logs.dropna(subset=["borrow_date", "book_id"])
        df_logs["book_id"] = df_logs["book_id"].astype(int)
        df_logs["year_month"] = df_logs["borrow_date"].dt.to_period("M").astype(str)

        # Lọc trạng thái hợp lệ (loại bỏ phiếu hủy hoặc từ chối)
        if "status" in df_logs.columns:
            df_logs = df_logs[~df_logs["status"].isin(["Từ chối", "Đã hủy", "Cancelled"])]

        # Lấy danh mục sách từ Database
        db = db_manager.load_db()
        books_data = db.get("books", [])
        df_books = pd.DataFrame(books_data)
        if not df_books.empty:
            df_books = df_books.rename(columns={"id": "book_id", "available": "available_copies"})
            df_books["book_id"] = df_books["book_id"].astype(int)
            df_books["quantity"] = pd.to_numeric(df_books.get("quantity", 1), errors="coerce").fillna(1).astype(int)
            df_books["available_copies"] = pd.to_numeric(df_books.get("available_copies", 1), errors="coerce").fillna(1).astype(int)
            book_meta_cols = ["book_id", "title", "category", "quantity", "available_copies"]
            df_books = df_books[[c for c in book_meta_cols if c in df_books.columns]]
        else:
            # Fallback nếu bảng sách trống
            df_books = pd.DataFrame({
                "book_id": list(range(1, 21)),
                "title": [f"Sách Chuyên Khảo #{i}" for i in range(1, 21)],
                "category": ["Công nghệ"] * 10 + ["Kinh tế"] * 10,
                "quantity": [5] * 20,
                "available_copies": [1] * 20
            })

        # pd.merge: Kết nối tập log mượn với metadata của sách
        df_merged = pd.merge(df_logs, df_books, on="book_id", how="inner")
        print(f"  -> pd.merge hoàn tất: {len(df_merged)} giao dịch đã được khớp thông tin đầu sách.")
        print(f"  -> Các chu kỳ tháng ghi nhận: {sorted(df_merged['year_month'].unique())}")

        # -------------------------------------------------------------
        # BƯỚC 3: GOM NHÓM & TÍNH TOÁN XU HƯỚNG (SMA & MOMENTUM)
        # -------------------------------------------------------------
        print(f"\n[BƯỚC 3] Gom nhóm theo book_id & tháng, áp dụng Simple Moving Average (SMA):")
        # Pivot table: Hàng là từng đầu sách, Cột là số lượt mượn từng tháng
        monthly_matrix = df_merged.pivot_table(
            index=["book_id", "title", "category"],
            columns="year_month",
            values="borrow_id",
            aggfunc="count",
            fill_value=0
        )

        month_cols = sorted([c for c in monthly_matrix.columns])
        print(f"  -> Ma trận nhu cầu theo tháng ({len(monthly_matrix)} đầu sách x {len(month_cols)} tháng).")

        # Tính Simple Moving Average (lấy tối đa 3 tháng gần nhất)
        recent_window = month_cols[-3:] if len(month_cols) >= 3 else month_cols
        monthly_matrix["sma_3"] = monthly_matrix[recent_window].mean(axis=1).round(2)

        # Tính tốc độ tăng trưởng nhu cầu (Growth Momentum giữa 2 tháng gần nhất)
        if len(month_cols) >= 2:
            prev_m = monthly_matrix[month_cols[-2]]
            curr_m = monthly_matrix[month_cols[-1]]
            monthly_matrix["growth_rate"] = ((curr_m - prev_m) / prev_m.replace(0, 1)).clip(-0.3, 0.6).round(3)
        else:
            monthly_matrix["growth_rate"] = 0.0

        # Dự báo nhu cầu tháng tiếp theo (Projected Demand):
        # Kết hợp SMA và hệ số gia tốc tăng trưởng
        monthly_matrix["projected_demand"] = np.ceil(
            monthly_matrix["sma_3"] * (1 + monthly_matrix["growth_rate"])
        ).astype(int).clip(lower=1)

        # Đưa index trở lại cột
        analysis_df = monthly_matrix.reset_index()

        # Merge lại thông tin tồn kho hiện tại (quantity, available_copies)
        analysis_df = pd.merge(analysis_df, df_books[["book_id", "quantity", "available_copies"]], on="book_id", how="left")
        analysis_df["quantity"] = analysis_df["quantity"].fillna(1).astype(int)
        analysis_df["available_copies"] = analysis_df["available_copies"].fillna(0).astype(int)

        # -------------------------------------------------------------
        # BƯỚC 4: TÍNH TOÁN KHOẢNG THIẾU HỤT & XẾP HẠNG RỦI RO
        # -------------------------------------------------------------
        print(f"\n[BƯỚC 4] Phân tích khoảng thiếu hụt tồn kho (Shortage Gap):")
        # Khoảng thiếu hụt = Nhu cầu dự báo - Lượng sách hiện còn sẵn
        analysis_df["shortage_gap"] = analysis_df["projected_demand"] - analysis_df["available_copies"]

        # Phân loại mức độ rủi ro (Shortage Risk)
        def determine_risk(row):
            gap = row["shortage_gap"]
            avail = row["available_copies"]
            proj = row["projected_demand"]
            if avail == 0 or (avail <= 1 and proj >= 3):
                return "CRITICAL"
            elif gap > 0:
                return "HIGH"
            elif avail <= proj:
                return "MEDIUM"
            else:
                return "LOW"

        analysis_df["shortage_risk"] = analysis_df.apply(determine_risk, axis=1)

        # Tính số lượng đề xuất nhập thêm (có đệm an toàn buffer 20%):
        # recommended = max(0, ceil(projected_demand * 1.2) - available_copies)
        analysis_df["recommended_procurement"] = (
            np.ceil(analysis_df["projected_demand"] * 1.2) - analysis_df["available_copies"]
        ).clip(lower=0).astype(int)

        # Điểm tin cậy dự báo (Confidence Score) dựa trên độ ổn định dữ liệu
        analysis_df["confidence_score"] = (
            0.75 + (analysis_df["sma_3"] / (analysis_df["sma_3"] + 5)) * 0.2
        ).round(2)

        # Lọc ra 5 cuốn sách có nguy cơ thiếu hụt cao nhất (Sắp xếp theo Risk & Shortage Gap giảm dần)
        risk_priority = {"CRITICAL": 3, "HIGH": 2, "MEDIUM": 1, "LOW": 0}
        analysis_df["risk_weight"] = analysis_df["shortage_risk"].map(risk_priority)

        top5_shortage = (
            analysis_df
            .sort_values(by=["risk_weight", "shortage_gap", "projected_demand"], ascending=[False, False, False])
            .head(5)
            .copy()
        )

        # Ghi chú đề xuất chi tiết
        def generate_notes(row):
            return (
                f"Dự báo nhu cầu tháng tới đạt {row['projected_demand']} lượt mượn "
                f"(SMA-3: {row['sma_3']:.1f}/tháng). Kho hiện chỉ còn {row['available_copies']}/{row['quantity']} cuốn. "
                f"Khuyến nghị bổ sung khẩn cấp {row['recommended_procurement']} cuốn."
            )

        top5_shortage["notes"] = top5_shortage.apply(generate_notes, axis=1)

        # -------------------------------------------------------------
        # BƯỚC 5: LƯU KẾT QUẢ ĐỀ XUẤT VÀO BẢNG AI_PROCUREMENT
        # -------------------------------------------------------------
        print(f"\n[BƯỚC 5] Lưu 5 kết quả đề xuất vào bảng 'ai_procurement' trong CSDL:")
        self._ensure_procurement_table()

        now = datetime.utcnow()
        inserted_count = 0

        # Chuẩn bị danh sách bản ghi
        records_to_insert = []
        for _, row in top5_shortage.iterrows():
            rec = {
                "book_id": int(row["book_id"]),
                "book_title": str(row["title"]),
                "category": str(row["category"]),
                "current_inventory": int(row["quantity"]),
                "available_copies": int(row["available_copies"]),
                "recent_monthly_avg": float(row["sma_3"]),
                "projected_demand": int(row["projected_demand"]),
                "shortage_risk": str(row["shortage_risk"]),
                "recommended_procurement": int(row["recommended_procurement"]),
                "confidence_score": float(row["confidence_score"]),
                "analysis_date": now,
                "notes": str(row["notes"]),
                "created_at": now
            }
            records_to_insert.append(rec)

        insert_sql = """
        INSERT INTO ai_procurement (
            book_id, book_title, category, current_inventory, available_copies,
            recent_monthly_avg, projected_demand, shortage_risk,
            recommended_procurement, confidence_score, analysis_date, notes, created_at
        ) VALUES (
            :book_id, :book_title, :category, :current_inventory, :available_copies,
            :recent_monthly_avg, :projected_demand, :shortage_risk,
            :recommended_procurement, :confidence_score, :analysis_date, :notes, :created_at
        );
        """

        # Thực thi insert vào MySQL nếu có kết nối
        if db_manager.mysql_mgr.is_connected() and db_manager.mysql_mgr.engine:
            try:
                with db_manager.mysql_mgr.engine.connect() as conn:
                    for r in records_to_insert:
                        conn.execute(text(insert_sql), r)
                    conn.commit()
                print("  -> Đã lưu 5 bản ghi vào máy chủ MySQL thành công.")
            except Exception as e:
                print(f"  [Lỗi MySQL Insert]: {e}")

        # Đồng thời lưu vào SQLite mirror
        if db_manager.mysql_mgr.sqlite_engine:
            try:
                with db_manager.mysql_mgr.sqlite_engine.connect() as conn:
                    for r in records_to_insert:
                        conn.execute(text(insert_sql), r)
                    conn.commit()
                print("  -> Đã đồng bộ 5 bản ghi vào SQLite persistent mirror (ai_procurement) thành công.")
            except Exception as e:
                print(f"  [Lỗi SQLite Insert]: {e}")

        # In bảng kết quả ra Terminal
        print("\n" + "=" * 100)
        print("   TOP 5 ĐẦU SÁCH CÓ NGUY CƠ THIẾU HỤT CAO NHẤT (BẢNG AI_PROCUREMENT)")
        print("=" * 100)
        display_cols = [
            "book_id", "title", "category", "available_copies", 
            "sma_3", "projected_demand", "shortage_gap", "shortage_risk", "recommended_procurement"
        ]
        
        # Định dạng hiển thị bảng
        output_df = top5_shortage[display_cols].copy()
        output_df.columns = [
            "Mã Sách", "Tên Sách", "Thể Loại", "Còn Sẵn", 
            "TB Mượn/Tháng (SMA)", "Dự Báo Tháng Tới", "Khoảng Thiếu", "Mức Rủi Ro", "Đề Xuất Nhập"
        ]
        print(output_df.to_string(index=False))
        print("=" * 100)

        # Xuất file CSV dự báo lưu trữ
        export_csv_path = os.path.join(self.log_dir, "AI_Procurement_Forecast_Report.csv")
        output_df.to_csv(export_csv_path, index=False, encoding="utf-8-sig")
        print(f"\n[XUẤT BÁO CÁO] Đã lưu báo cáo dự báo nhu cầu ra file: {export_csv_path}")

        return top5_shortage


if __name__ == "__main__":
    predictor = DemandPredictor()
    results = predictor.run_prediction_pipeline()
    print("\n✓ Hoàn thành phân tích dự báo nhu cầu bằng Pandas!")

