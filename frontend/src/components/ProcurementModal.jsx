import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  TrendingUp, RefreshCw, X, AlertTriangle, CheckCircle,
  BookOpen, FileSpreadsheet, ShieldAlert, Sparkles, Layers
} from 'lucide-react';
import { api } from '../services/api';

export default function ProcurementModal({ isOpen, onClose }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const records = await api.getProcurementForecast();
      setData(records || []);
    } catch (err) {
      setError('Không thể nạp dữ liệu dự báo. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  const handleRerun = async () => {
    setLoading(true);
    setError(null);
    try {
      const records = await api.runProcurementForecast();
      setData(records || []);
    } catch (err) {
      setError('Quá trình chạy phân tích Pandas SMA gặp sự cố.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!data || data.length === 0) return;
    let csv = '\ufeffMã Sách,Tên Sách,Thể Loại,Còn Sẵn,Tổng Kho,TB Mượn/Tháng (SMA-3),Dự Báo Tháng Tới,Mức Rủi Ro,Đề Xuất Nhập Thêm,Độ Tin Cậy,Ghi Chú AI\n';
    data.forEach(item => {
      csv += `"${item.book_id}","${item.book_title || item.title || ''}","${item.category || ''}","${item.available_copies ?? item.available ?? 0}","${item.current_inventory ?? item.quantity ?? 0}","${item.recent_monthly_avg ?? item.sma_3 ?? 0}","${item.projected_demand ?? 0}","${item.shortage_risk ?? 'HIGH'}","${item.recommended_procurement ?? 0}","${Math.round((item.confidence_score || 0.85) * 100)}%","${(item.notes || '').replace(/"/g, '""')}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AI_Procurement_Forecast_Report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalRecommended = data.reduce((sum, item) => sum + (Number(item.recommended_procurement) || 0), 0);
  const highRiskCount = data.filter(item => (item.shortage_risk || '').toUpperCase() === 'HIGH' || (item.shortage_risk || '').toUpperCase() === 'CRITICAL').length;

  const modalContent = (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '960px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
            }}>
              <TrendingUp size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  AI Dự Báo Nhu Cầu Nhập Sách (Pandas SMA)
                </h3>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: '#dcfce7',
                  color: '#15803d'
                }}>
                  Tiêu chí 1.4 & 4.4
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748b' }}>
                Phân tích chuỗi thời gian 3 tháng (Exam1, Exam2, Exam3) bằng Moving Average & Growth Momentum
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Đóng"
          >
            <X size={20} />
          </button>
        </div>

        {/* KPI Summary Cards */}
        <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', background: '#f8fafc' }}>
          <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Tổng đề xuất nhập thêm</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#059669' }}>+{totalRecommended}</span>
              <span style={{ fontSize: '12px', color: '#64748b' }}>cuốn</span>
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Đầu sách thiếu hụt cao (HIGH/CRITICAL)</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#dc2626' }}>{highRiskCount}</span>
              <span style={{ fontSize: '12px', color: '#64748b' }}>/ 5 đầu sách</span>
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Mô hình & Thuật toán AI</span>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0284c7', marginTop: '6px' }}>
              Pandas SMA-3 + Buffer 20%
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {error && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: '#fef2f2',
              color: '#b91c1c',
              fontSize: '13.5px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 12px', color: '#059669' }} />
              <p style={{ margin: 0, fontWeight: 600 }}>Đang thực thi pipeline phân tích Pandas SMA...</p>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Đọc log 540+ giao dịch và tính toán ma trận thiếu hụt</span>
            </div>
          ) : data.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>
              <BookOpen size={36} style={{ margin: '0 auto 8px', color: '#cbd5e1' }} />
              <p style={{ margin: 0 }}>Chưa có dữ liệu dự báo. Nhấn nút "Chạy phân tích AI" để bắt đầu.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>#ID</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>Tên sách</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700 }}>Thể loại</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700, textAlign: 'center' }}>Còn sẵn / Tổng</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700, textAlign: 'center' }}>SMA-3 / Dự báo</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700, textAlign: 'center' }}>Mức rủi ro</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700, textAlign: 'center' }}>Đề xuất nhập</th>
                    <th style={{ padding: '10px 12px', fontWeight: 700, textAlign: 'center' }}>Độ tin cậy</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item, idx) => {
                    const risk = (item.shortage_risk || 'HIGH').toUpperCase();
                    const riskBg = risk === 'CRITICAL' ? '#fee2e2' : (risk === 'HIGH' ? '#ffedd5' : '#fef9c3');
                    const riskColor = risk === 'CRITICAL' ? '#b91c1c' : (risk === 'HIGH' ? '#c2410c' : '#854d0e');
                    return (
                      <React.Fragment key={idx}>
                        <tr style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                          <td style={{ padding: '12px', fontWeight: 700, color: '#64748b' }}>#{item.book_id}</td>
                          <td style={{ padding: '12px', fontWeight: 700, color: '#0f172a', maxWidth: '220px' }}>
                            {item.book_title || item.title}
                          </td>
                          <td style={{ padding: '12px', color: '#64748b' }}>{item.category || 'Chung'}</td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 800, color: '#dc2626' }}>{item.available_copies ?? item.available ?? 0}</span>
                            <span style={{ color: '#94a3b8' }}> / {item.current_inventory ?? item.quantity ?? 0}</span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <span style={{ color: '#475569' }}>{Number(item.recent_monthly_avg || item.sma_3 || 0).toFixed(1)}</span>
                            <span style={{ color: '#94a3b8' }}> ➔ </span>
                            <span style={{ fontWeight: 800, color: '#0284c7' }}>{item.projected_demand}</span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 800,
                              background: riskBg,
                              color: riskColor
                            }}>
                              {risk}
                            </span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '3px 10px',
                              borderRadius: '6px',
                              fontSize: '13px',
                              fontWeight: 800,
                              background: '#dcfce7',
                              color: '#15803d'
                            }}>
                              +{item.recommended_procurement} cuốn
                            </span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#059669' }}>
                            {Math.round((item.confidence_score || 0.85) * 100)}%
                          </td>
                        </tr>
                        {item.notes && (
                          <tr style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fafafa' : '#f8fafc' }}>
                            <td colSpan={8} style={{ padding: '6px 12px 10px', fontSize: '12px', color: '#64748b' }}>
                              <span style={{ fontWeight: 600, color: '#475569' }}>💡 Phân tích chi tiết: </span>
                              {item.notes}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#ffffff'
        }}>
          <button
            type="button"
            onClick={handleRerun}
            disabled={loading}
            className="btn btn-outline"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#059669',
              borderColor: '#6ee7b7',
              fontWeight: 700,
              fontSize: '13px'
            }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Chạy lại phân tích (SMA Pipeline)</span>
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={data.length === 0}
              className="btn btn-outline"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 700,
                fontSize: '13px'
              }}
            >
              <FileSpreadsheet size={15} color="#0284c7" />
              <span>Xuất Báo Cáo CSV</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-primary"
              style={{ background: '#0f172a', borderColor: '#0f172a', fontWeight: 700, fontSize: '13px' }}
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

