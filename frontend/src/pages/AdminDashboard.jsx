import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import { exportApi } from '../services/exportApi';
import BookCard from '../components/BookCard';
import BookDetailModal from '../components/BookDetailModal';
import AddEditBookModal from '../components/AddEditBookModal';
import AddEditUpcomingBookModal from '../components/AddEditUpcomingBookModal';
import AddEditReaderModal from '../components/AddEditReaderModal';
import BorrowModal from '../components/BorrowModal';
import ExportReportModal from '../components/ExportReportModal';
import BookAIUpload from '../components/BookAIUpload';
import AdminChatbot from '../components/AdminChatbot';
import AlertQueue from '../components/AlertQueue';
import ReceiptQRScannerModal from '../components/ReceiptQRScannerModal';
import { UPCOMING_BOOKS } from '../components/UpcomingBooksSection';
import {
  BookOpen, Users, Clock, AlertTriangle, CheckCircle, Search, Plus,
  FileSpreadsheet, Filter, Grid, List, Check, X, Edit2, Trash2, BookMarked, Eye,
  BookmarkCheck, XCircle, QrCode, Lock, Unlock,
  SlidersHorizontal, DollarSign, Calendar, Building2, CreditCard, Save, RotateCcw, ShieldCheck,
  PackageCheck, Sparkles, Star, ShieldAlert
} from 'lucide-react';


const getReaderCode = (id) => {
  if (!id) return 'DG-001';
  const num = id === 2 ? 1 : (typeof id === 'number' ? id - 1 : parseInt(id) || 1);
  return `DG-${String(Math.max(1, num)).padStart(3, '0')}`;
};

function MonthlyTrendChart() {
  const baseData = [38, 65, 76, 62, 92, 85, 110, 98, 120, 105, 88, 130];
  const months = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [animProgress, setAnimProgress] = useState(0);

  useEffect(() => {
    let start = null;
    const duration = 1200;
    let frameId;

    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimProgress(eased);
      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const width = 360;
  const height = 180;
  const paddingLeft = 30;
  const paddingRight = 14;
  const paddingTop = 20;
  const paddingBottom = 26;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;
  const maxY = 140;
  const baselineY = paddingTop + chartH;

  // Tính tọa độ động theo tiến trình sóng lượn (staggered wave)
  const points = baseData.map((val, idx) => {
    const x = paddingLeft + idx * (chartW / (baseData.length - 1));
    const pointProgress = Math.max(0, Math.min(1, (animProgress - (idx / baseData.length) * 0.35) / 0.65));
    const currentVal = val * pointProgress;
    const y = baselineY - (currentVal / maxY) * chartH;
    return { x, y, val, month: months[idx], pointProgress };
  });

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPoints = `${points[0].x},${baselineY} ` + polylinePoints + ` ${points[points.length - 1].x},${baselineY}`;

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '16px',
      border: '1px solid #eef2f6',
      padding: '20px 22px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      opacity: Math.min(1, animProgress * 1.5),
      transform: `translateY(${(1 - animProgress) * 14}px)`,
      transition: 'box-shadow 0.2s ease, border-color 0.2s ease'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Xu hướng Mượn theo Tháng</h3>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>Năm 2026</span>
      </div>

      <div style={{ width: '100%', position: 'relative' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
          <defs>
            <linearGradient id="trendAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {[140, 105, 70, 35, 0].map(level => {
            const y = paddingTop + chartH - (level / maxY) * chartH;
            return (
              <g key={level}>
                <text x={paddingLeft - 8} y={y + 3.5} textAnchor="end" fontSize="9.5" fill="#94a3b8" fontWeight="500">
                  {level}
                </text>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeDasharray={level === 0 ? 'none' : '3 3'}
                  strokeWidth="1"
                />
              </g>
            );
          })}

          {/* Vùng diện tích gradient lượn sóng */}
          <polygon
            points={areaPoints}
            fill="url(#trendAreaGradient)"
            style={{ opacity: animProgress }}
          />

          {/* Đường biểu đồ sóng vẽ mượt */}
          <polyline
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePoints}
          />

          {points.map((p, i) => {
            const slotW = chartW / (baseData.length - 1);
            return (
              <g
                key={i}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Vùng cảm ứng rộng giúp di chuột dễ dàng và mượt mà */}
                <rect
                  x={p.x - slotW / 2}
                  y={paddingTop}
                  width={slotW}
                  height={chartH + paddingBottom}
                  fill="transparent"
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={(hoveredIndex === i ? 6 : 3.5) * p.pointProgress}
                  fill={hoveredIndex === i ? '#2563eb' : '#ffffff'}
                  stroke="#2563eb"
                  strokeWidth={hoveredIndex === i ? 3 : 2}
                  style={{ transition: 'all 0.15s ease' }}
                />
                <text
                  x={p.x}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill={hoveredIndex === i ? '#2563eb' : '#64748b'}
                  fontWeight={hoveredIndex === i ? '700' : '500'}
                  opacity={Math.min(1, p.pointProgress * 1.5)}
                >
                  {p.month}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredIndex !== null && (
          <div
            style={{
              position: 'absolute',
              top: '0',
              left: `${(points[hoveredIndex].x / width) * 100}%`,
              transform: 'translate(-50%, -10px)',
              background: '#0f172a',
              color: '#ffffff',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              pointerEvents: 'none',
              boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
              whiteSpace: 'nowrap',
              zIndex: 10
            }}
          >
            {points[hoveredIndex].month}: {points[hoveredIndex].val} lượt
          </div>
        )}
      </div>
    </div>
  );
}

function getDonutArcPath(cx, cy, innerR, outerR, startAngle, endAngle) {
  const delta = Math.min(Math.max(endAngle - startAngle, 0.01), 359.99);
  const rad = Math.PI / 180;
  const startRad = (startAngle - 90) * rad;
  const endRad = (startAngle + delta - 90) * rad;

  const x1 = cx + outerR * Math.cos(startRad);
  const y1 = cy + outerR * Math.sin(startRad);
  const x2 = cx + outerR * Math.cos(endRad);
  const y2 = cy + outerR * Math.sin(endRad);

  const x3 = cx + innerR * Math.cos(endRad);
  const y3 = cy + innerR * Math.sin(endRad);
  const x4 = cx + innerR * Math.cos(startRad);
  const y4 = cy + innerR * Math.sin(startRad);

  const largeArcFlag = delta > 180 ? 1 : 0;

  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${outerR} ${outerR} 0 ${largeArcFlag} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
}

function CategoryDonutChart() {
  const categories = [
    { name: 'Khoa học', color: '#06b6d4', percent: 22, count: 11 },
    { name: 'Kỳ ảo', color: '#8b5cf6', percent: 14, count: 7 },
    { name: 'Lịch sử', color: '#10b981', percent: 18, count: 9 },
    { name: 'Phát triển', color: '#f59e0b', percent: 18, count: 9 },
    { name: 'Tiểu thuyết', color: '#3b82f6', percent: 28, count: 14 }
  ];

  const totalCount = categories.reduce((sum, c) => sum + c.count, 0);

  const [animProgress, setAnimProgress] = useState(0);
  const [hoveredCat, setHoveredCat] = useState(null);

  useEffect(() => {
    let start = null;
    const duration = 1200;
    let frameId;

    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimProgress(eased);
      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const defaultInnerR = 48;
  const defaultOuterR = 70;
  const hoveredInnerR = 44;
  const hoveredOuterR = 76;
  const gap = 2.5;

  let accumulatedAngle = 0;
  const slices = categories.map((cat, i) => {
    const sweepAngle = (cat.percent / 100) * 360 * animProgress;
    const startAngle = accumulatedAngle + gap / 2;
    const endAngle = accumulatedAngle + Math.max(0.1, sweepAngle - gap / 2);
    accumulatedAngle += sweepAngle;
    return { ...cat, index: i, startAngle, endAngle };
  });

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '16px',
      border: '1px solid #eef2f6',
      padding: '20px 22px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      position: 'relative',
      opacity: Math.min(1, animProgress * 1.5),
      transform: `translateY(${(1 - animProgress) * 14}px)`,
      transition: 'box-shadow 0.2s ease, border-color 0.2s ease'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Tỉ lệ Thể loại Sách</h3>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>5 thể loại</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '180px', position: 'relative' }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ overflow: 'visible' }}
        >
          {slices.map((slice) => {
            const isHovered = hoveredCat === slice.index;
            const innerR = isHovered ? hoveredInnerR : defaultInnerR;
            const outerR = isHovered ? hoveredOuterR : defaultOuterR;
            const pathD = getDonutArcPath(cx, cy, innerR, outerR, slice.startAngle, slice.endAngle);

            return (
              <path
                key={slice.index}
                d={pathD}
                fill={slice.color}
                opacity={hoveredCat === null || isHovered ? 1 : 0.4}
                onMouseEnter={() => setHoveredCat(slice.index)}
                onMouseLeave={() => setHoveredCat(null)}
                style={{
                  transition: 'opacity 0.2s ease',
                  cursor: 'pointer',
                  filter: isHovered ? `drop-shadow(0 3px 8px ${slice.color}60)` : 'none'
                }}
              />
            );
          })}
        </svg>

        {/* Thông số ở tâm vòng tròn: Hiển thị mượt mà thông số của mục tương ứng khi di chuột */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          textAlign: 'center',
          width: '84px',
          height: '84px',
          zIndex: 5
        }}>
          {hoveredCat !== null ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '18px', fontWeight: 800, color: categories[hoveredCat].color, lineHeight: 1.1 }}>
                {categories[hoveredCat].count} cuốn
              </span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a', marginTop: '3px' }}>
                {categories[hoveredCat].name}
              </span>
              <span style={{ fontSize: '10.5px', fontWeight: 700, color: categories[hoveredCat].color, marginTop: '1px' }}>
                {categories[hoveredCat].percent}%
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {totalCount}
              </span>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748b', marginTop: '2px' }}>
                Tổng số sách
              </span>
              <span style={{ fontSize: '9.5px', fontWeight: 500, color: '#94a3b8' }}>
                5 thể loại
              </span>
            </div>
          )}
        </div>

        {/* Tooltip nổi bật gắn thẻ khi di chuột */}
        {hoveredCat !== null && (
          <div
            style={{
              position: 'absolute',
              top: '-6px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#0f172a',
              color: '#ffffff',
              padding: '4px 10px',
              borderRadius: '7px',
              fontSize: '11.5px',
              fontWeight: 600,
              pointerEvents: 'none',
              boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
              whiteSpace: 'nowrap',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: categories[hoveredCat].color, display: 'inline-block' }} />
            <span>{categories[hoveredCat].name}: <strong>{categories[hoveredCat].count} cuốn</strong> ({categories[hoveredCat].percent}%)</span>
          </div>
        )}
      </div>

      {/* Danh sách các mục thể loại bên dưới: Di chuột vào mục nào sẽ làm nổi bật mục đó và hiện thông số trên biểu đồ */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 8px', marginTop: '8px', opacity: animProgress }}>
        {categories.map((cat, i) => {
          const isHovered = hoveredCat === i;
          return (
            <div
              key={i}
              onMouseEnter={() => setHoveredCat(i)}
              onMouseLeave={() => setHoveredCat(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11.5px',
                fontWeight: isHovered ? 700 : 500,
                color: isHovered ? '#0f172a' : '#475569',
                cursor: 'pointer',
                padding: '3px 8px',
                borderRadius: '8px',
                border: isHovered ? `1.5px solid ${cat.color}` : '1.5px solid #f1f5f9',
                background: isHovered ? `${cat.color}15` : '#f8fafc',
                transform: isHovered ? 'scale(1.06)' : 'scale(1)',
                boxShadow: isHovered ? `0 2px 8px ${cat.color}25` : 'none',
                transition: 'all 0.18s ease'
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
              <span>{cat.name}</span>
              <span style={{ fontWeight: 700, color: isHovered ? cat.color : '#334155' }}>({cat.count})</span>
              {isHovered && (
                <span style={{ fontSize: '10px', fontWeight: 700, color: cat.color, marginLeft: '2px' }}>• {cat.percent}%</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoryBorrowBarChart() {
  const data = [
    { name: 'Tiểu thuyết', value: 35, color: '#3b82f6' },
    { name: 'Khoa học', value: 21, color: '#06b6d4' },
    { name: 'Lịch sử', value: 15, color: '#10b981' },
    { name: 'Phát triển', value: 19, color: '#f59e0b' },
    { name: 'Kỳ ảo', value: 12, color: '#8b5cf6' }
  ];

  const [animProgress, setAnimProgress] = useState(0);

  useEffect(() => {
    let start = null;
    const duration = 1200;
    let frameId;

    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimProgress(eased);
      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const width = 310;
  const height = 180;
  const paddingLeft = 30;
  const paddingRight = 14;
  const paddingTop = 15;
  const paddingBottom = 26;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;
  const maxY = 36;
  const [hoveredBar, setHoveredBar] = useState(null);

  const barWidth = 18;

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '16px',
      border: '1px solid #eef2f6',
      padding: '20px 22px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      position: 'relative',
      opacity: Math.min(1, animProgress * 1.5),
      transform: `translateY(${(1 - animProgress) * 14}px)`,
      transition: 'box-shadow 0.2s ease, border-color 0.2s ease'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Lượt Mượn theo Thể loại</h3>
      </div>

      <div style={{ width: '100%', position: 'relative' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
          {[36, 27, 18, 9, 0].map(level => {
            const y = paddingTop + chartH - (level / maxY) * chartH;
            return (
              <g key={level}>
                <text x={paddingLeft - 8} y={y + 3.5} textAnchor="end" fontSize="9.5" fill="#94a3b8" fontWeight="500">
                  {level}
                </text>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeDasharray={level === 0 ? 'none' : '3 3'}
                  strokeWidth="1"
                />
              </g>
            );
          })}

          {data.map((item, i) => {
            const slotW = chartW / data.length;
            const slotX = paddingLeft + i * slotW;
            const x = slotX + (slotW - barWidth) / 2;
            // Hiệu ứng mọc cột so le (staggered bar growth)
            const barProgress = Math.max(0, Math.min(1, (animProgress - (i / data.length) * 0.35) / 0.65));
            const bHeight = Math.max(0, (item.value / maxY) * chartH * barProgress);
            const y = paddingTop + chartH - bHeight;
            const isHovered = hoveredBar === i;

            return (
              <g
                key={i}
                onMouseEnter={() => setHoveredBar(i)}
                onMouseLeave={() => setHoveredBar(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Vùng cảm ứng bao quát cả cột giúp di chuột nhạy */}
                <rect
                  x={slotX}
                  y={paddingTop}
                  width={slotW}
                  height={chartH + paddingBottom}
                  fill="transparent"
                />
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={bHeight}
                  rx="5"
                  ry="5"
                  fill={item.color}
                  opacity={hoveredBar === null || isHovered ? 1 : 0.45}
                  style={{
                    transform: isHovered ? 'scale(1.06)' : 'scale(1)',
                    transformOrigin: `${x + barWidth / 2}px ${paddingTop + chartH}px`,
                    filter: isHovered ? `drop-shadow(0 3px 6px ${item.color}60)` : 'none',
                    transition: 'all 0.18s ease'
                  }}
                />
                <text
                  x={x + barWidth / 2}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill={isHovered ? item.color : '#64748b'}
                  fontWeight={isHovered ? '700' : '500'}
                  opacity={Math.min(1, barProgress * 1.5)}
                >
                  {item.name}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredBar !== null && (
          <div
            style={{
              position: 'absolute',
              top: '0',
              left: `${((paddingLeft + hoveredBar * (chartW / data.length) + chartW / data.length / 2) / width) * 100}%`,
              transform: 'translate(-50%, -10px)',
              background: '#0f172a',
              color: '#ffffff',
              padding: '4px 9px',
              borderRadius: '7px',
              fontSize: '11.5px',
              fontWeight: 600,
              pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
              whiteSpace: 'nowrap',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: data[hoveredBar].color, display: 'inline-block' }} />
            <span>{data[hoveredBar].name}: <strong>{data[hoveredBar].value} lượt</strong></span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard({ activeTab, onTabChange, isLibrarian = false }) {
  const [stats, setStats] = useState(null);
  const [books, setBooks] = useState(() => (api.getCachedBooks ? api.getCachedBooks() : []));
  const [readers, setReaders] = useState([]);
  const [borrowRecords, setBorrowRecords] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [fines, setFines] = useState([]);
  const [activeBorrowView, setActiveBorrowView] = useState('borrows'); // 'borrows' | 'reservations' | 'fines'
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [bookSearch, setBookSearch] = useState('');
  const [bookCategory, setBookCategory] = useState('All');
  const [bookViewMode, setBookViewMode] = useState('table'); // 'table' | 'grid'
  const [borrowStatusFilter, setBorrowStatusFilter] = useState('All');
  const [borrowSearch, setBorrowSearch] = useState('');
  const [readerSearch, setReaderSearch] = useState('');

  // Refs for smooth scroll to tables
  const borrowTableRef = useRef(null);
  const booksTableRef = useRef(null);

  const [pendingQueueModalOpen, setPendingQueueModalOpen] = useState(false);

  const handleFilterAndScrollBorrows = (status) => {
    setActiveBorrowView('borrows');
    setBorrowStatusFilter(status);
    setBorrowSearch('');
    setTimeout(() => {
      const target = borrowTableRef.current || document.getElementById('borrow-records-table');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
  };

  // Modals state
  const [selectedBook, setSelectedBook] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [aiUploadOpen, setAiUploadOpen] = useState(false);
  const [chatbotOpen, setChatbotOpen] = useState(false);
  const [alertQueueOpen, setAlertQueueOpen] = useState(false);
  const [receiptScannerOpen, setReceiptScannerOpen] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [readerModalOpen, setReaderModalOpen] = useState(false);
  const [editingReader, setEditingReader] = useState(null);
  const [borrowModalOpen, setBorrowModalOpen] = useState(false);
  const [borrowTargetBook, setBorrowTargetBook] = useState(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [adminReturnRecord, setAdminReturnRecord] = useState(null);
  const [isReturning, setIsReturning] = useState(false);
  const [bookToDelete, setBookToDelete] = useState(null);
  const [deleteBookError, setDeleteBookError] = useState('');

  // Upcoming Books Management State (Tab Sách đặt trước)
  const [upcomingSearch, setUpcomingSearch] = useState('');
  const [upcomingCategoryFilter, setUpcomingCategoryFilter] = useState('All');
  const [upcomingMonthFilter, setUpcomingMonthFilter] = useState('All');
  const [upcomingViewMode, setUpcomingViewMode] = useState('table'); // 'table' | 'grid'
  const [upcomingBookModalOpen, setUpcomingBookModalOpen] = useState(false);
  const [editingUpcomingBook, setEditingUpcomingBook] = useState(null);
  const [upcomingBookToDelete, setUpcomingBookToDelete] = useState(null);
  const [isDeletingUpcomingBook, setIsDeletingUpcomingBook] = useState(false);
  const [deleteUpcomingBookError, setDeleteUpcomingBookError] = useState('');
  const [viewingQueueBook, setViewingQueueBook] = useState(null);
  const [receiveStockBook, setReceiveStockBook] = useState(null);
  const [receiveStockQty, setReceiveStockQty] = useState(20);
  const [isReceivingStock, setIsReceivingStock] = useState(false);
  const [earliestBooksModalOpen, setEarliestBooksModalOpen] = useState(false);
  const [preOrderReadersModalOpen, setPreOrderReadersModalOpen] = useState(false);
  const [topRatedModalOpen, setTopRatedModalOpen] = useState(false);

  // System Settings state
  const [systemSettings, setSystemSettings] = useState({
    borrowHomeDays: 14,
    borrowLibraryDays: 7,
    maxBorrowBooks: 3,
    maxReservations: 3,
    finePerDay: 2000,
    gracePeriodDays: 0,
    autoLockAfterDays: 3,
    lostBookFine: 200000,
    vnpayTmnCode: '',
    vnpayHashSecret: '',
    vnpayAccountNumber: '0987654321',
    vnpayBankName: 'Ngân hàng TMCP Quân Đội (MBBank)',
    vnpayBankBin: '970422',
    vnpayAccountName: 'THU VIEN SMARTLIB',
    vnpayTimeoutMinutes: 15,
    libraryName: 'SmartLib - Thư viện Thông minh',
    libraryAddress: 'Hà Nội, Việt Nam',
    libraryPhone: '0987 654 321',
    libraryEmail: 'support@smartlib.edu.vn',
    libraryHours: '07:30 - 17:30 (Thứ 2 - Thứ 7)'
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [isDeletingBook, setIsDeletingBook] = useState(false);
  const [readerToDelete, setReaderToDelete] = useState(null);
  const [deleteReaderError, setDeleteReaderError] = useState('');
  const [isDeletingReader, setIsDeletingReader] = useState(false);
  const [borrowActionModal, setBorrowActionModal] = useState(null); // { type: 'approve' | 'reject', record }
  const [isProcessingBorrowAction, setIsProcessingBorrowAction] = useState(false);
  const [borrowActionError, setBorrowActionError] = useState('');
  const [fineActionModal, setFineActionModal] = useState(null); // { type: 'approve' | 'reject', fine, reason: '' }
  const [isProcessingFineAction, setIsProcessingFineAction] = useState(false);
  const [fineActionError, setFineActionError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handlePayFine = async (fineId) => {
    try {
      await api.payFine(fineId);
      showToast('✓ Đã xác nhận thu tiền phạt thành công!');
      loadData(true);
    } catch (e) {
      showToast('Lỗi khi cập nhật nộp phạt: ' + (e.message || 'Lỗi'));
    }
  };

  const handleApproveFine = async (fineId) => {
    try {
      const res = await api.approveFinePayment(fineId);
      showToast('🎉 ' + (res?.message || 'Đã duyệt nộp phạt thành công! Tài khoản độc giả đã được mở khóa.'));
      loadData(true);
    } catch (e) {
      showToast('Lỗi khi duyệt nộp phạt: ' + (e.message || 'Lỗi'));
    }
  };

  const handleRejectFineWithReason = async (fineId, reason) => {
    const finalReason = reason || 'Chưa nhận được giao dịch chuyển khoản hoặc thông tin sai lệch';
    const res = await api.rejectFinePayment(fineId, finalReason);
    showToast('✓ ' + (res?.message || 'Đã từ chối giao dịch nộp phạt.'));
    loadData(true);
  };

  const handleToggleReaderLock = async (reader) => {
    try {
      const nextLocked = !reader.isLocked;
      const reason = nextLocked ? 'Khóa thủ công bởi Quản trị viên' : '';
      await api.toggleReaderLock(reader.id, nextLocked, reason);
      showToast(nextLocked ? `🔒 Đã khóa tài khoản độc giả "${reader.fullName}"` : `🔓 Đã mở khóa tài khoản độc giả "${reader.fullName}"`);
      loadData(true);
    } catch (e) {
      showToast('Lỗi khi cập nhật trạng thái khóa: ' + (e.message || 'Lỗi'));
    }
  };

  const handleLockReaderFromAlert = async (userId, reason) => {
    try {
      const reader = readers.find(r => Number(r.id) === Number(userId));
      const name = reader ? reader.fullName : `Độc giả #${userId}`;
      await api.toggleReaderLock(userId, true, reason || 'Phát hiện hành vi gian lận bởi AI Anomaly Detection');
      showToast(`🔒 Đã khóa tài khoản "${name}" do phát hiện vi phạm bất thường!`);
      loadData(true);
    } catch (e) {
      showToast('Lỗi khi khóa độc giả: ' + (e.message || 'Lỗi'));
    }
  };

  const handleMarkOverdue = async (record) => {
    try {
      await api.updateBorrowStatus(record.id, 'Quá hạn');
      showToast(`⚠️ Đã chuyển phiếu mượn #${record.id} ("${record.bookTitle}") sang trạng thái Quá hạn. Dữ liệu đã chuyển sang mục Quá hạn.`);
      window.dispatchEvent(new CustomEvent('smartlib:data-updated'));
      try {
        localStorage.setItem('smartlib_last_update', String(Date.now()));
      } catch (err) {}
      await loadData(true);
    } catch (e) {
      showToast('Lỗi khi chuyển trạng thái quá hạn: ' + (e.message || 'Lỗi'));
    }
  };

  const handleCancelReservation = async (resId) => {
    try {
      // Cập nhật giao diện phản hồi tức thì 0ms (60fps)
      setReservations(prev => prev.filter(r => Number(r.id) !== Number(resId)));
      showToast('✓ Đã hủy đặt trước sách thành công!');
      await api.cancelReservation(resId);
      loadData(true);
    } catch (e) {
      showToast('Lỗi khi hủy đặt trước: ' + (e.message || 'Lỗi'));
      loadData(true);
    }
  };

  const handleUpdateReservationStatus = async (resId, newStatus) => {
    try {
      setReservations(prev => prev.map(r => Number(r.id) === Number(resId) ? { ...r, status: newStatus } : r));
      if (newStatus === 'Ready') {
        showToast('✓ Đã chuyển trạng thái: Sách đã sẵn sàng cho độc giả!');
      } else if (newStatus === 'Fulfilled') {
        showToast('✓ Đã hoàn tất mượn sách đặt trước!');
      } else {
        showToast('✓ Đã cập nhật trạng thái đặt trước thành công!');
      }
      await api.updateReservation(resId, { status: newStatus });
      loadData(true);
    } catch (e) {
      showToast('Lỗi khi cập nhật đặt trước: ' + (e.message || 'Lỗi'));
      loadData(true);
    }
  };

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [sRes, bRes, rRes, brRes, resvRes, finesRes] = await Promise.all([
        api.getStats().catch(() => null),
        api.getBooks().catch(() => []),
        api.getReaders().catch(() => []),
        api.getBorrowRecords().catch(() => []),
        api.getReservations ? api.getReservations().catch(() => []) : [],
        api.getFines ? api.getFines().catch(() => []) : []
      ]);
      setStats(sRes);
      setBooks(bRes || []);
      setReaders(rRes || []);
      setBorrowRecords(brRes || []);
      setReservations(resvRes || []);
      setFines(finesRes || []);
    } catch (e) {
      console.error('Error loading admin data:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Cập nhật chỉ dữ liệu giao dịch (siêu nhẹ, không tải lại 1.25MB sách)
  const loadDynamicData = async () => {
    try {
      const [sRes, brRes, resvRes, finesRes] = await Promise.all([
        api.getStats().catch(() => null),
        api.getBorrowRecords().catch(() => []),
        api.getReservations ? api.getReservations().catch(() => []) : [],
        api.getFines ? api.getFines().catch(() => []) : []
      ]);
      if (sRes) setStats(sRes);
      if (brRes) {
        setBorrowRecords(prev => {
          if (
            prev.length === brRes.length &&
            prev.every((p, idx) => p.id === brRes[idx]?.id && p.status === brRes[idx]?.status)
          ) {
            return prev;
          }
          return brRes;
        });
      }
      if (resvRes) {
        setReservations(prev => {
          if (
            prev.length === resvRes.length &&
            prev.every((p, idx) => p.id === resvRes[idx]?.id && p.status === resvRes[idx]?.status)
          ) {
            return prev;
          }
          return resvRes;
        });
      }
      if (finesRes) {
        setFines(prev => {
          if (
            prev.length === finesRes.length &&
            prev.every((p, idx) => p.id === finesRes[idx]?.id && p.status === finesRes[idx]?.status)
          ) {
            return prev;
          }
          return finesRes;
        });
      }
    } catch (e) {
      console.error('Error polling dynamic admin data:', e);
    }
  };

  useEffect(() => {
    loadData();

    // 1. Đồng bộ tức thì khi có sự kiện cập nhật từ NotificationDropdown hoặc component khác
    const handleDataUpdate = () => {
      loadData(true);
    };
    window.addEventListener('smartlib:data-updated', handleDataUpdate);

    // 2. Đồng bộ giữa các tab trình duyệt khác nhau qua storage event
    const handleStorageUpdate = (e) => {
      if (e.key === 'smartlib_last_update') {
        loadDynamicData();
      }
    };
    window.addEventListener('storage', handleStorageUpdate);

    // 3. Polling ngầm CHỈ tải dữ liệu động nhẹ (stats, borrows, reservations), chu kỳ 6s
    const interval = setInterval(loadDynamicData, 6000);

    return () => {
      window.removeEventListener('smartlib:data-updated', handleDataUpdate);
      window.removeEventListener('storage', handleStorageUpdate);
      clearInterval(interval);
    };
  }, []);

  // Khi chuyển tab, chỉ cập nhật dữ liệu động
  useEffect(() => {
    if (isLibrarian && activeTab === 'settings') {
      onTabChange('dashboard');
      return;
    }
    loadDynamicData();
    if (activeTab === 'settings' && !isLibrarian) {
      loadSettings();
    }
  }, [activeTab, isLibrarian, onTabChange]);

  const loadSettings = async () => {
    try {
      setSettingsLoading(true);
      const data = await api.getSettings();
      if (data) {
        setSystemSettings(prev => ({ ...prev, ...data }));
      }
    } catch (e) {
      console.error('Error loading settings:', e);
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault();
    try {
      setSettingsSaving(true);
      await api.updateSettings(systemSettings);
      showToast('✓ Cập nhật cấu hình hệ thống thành công!');
    } catch (e) {
      showToast('❌ Lỗi lưu cài đặt: ' + (e.message || 'Vui lòng thử lại'));
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleResetSettingsDefault = async () => {
    if (window.confirm('Bạn có chắc chắn muốn đặt lại toàn bộ thông số về giá trị mặc định của hệ thống không?')) {
      const defaults = {
        borrowHomeDays: 14,
        borrowLibraryDays: 7,
        maxBorrowBooks: 3,
        maxReservations: 3,
        finePerDay: 2000,
        gracePeriodDays: 0,
        autoLockAfterDays: 3,
        lostBookFine: 200000,
        vnpayTmnCode: '',
        vnpayHashSecret: '',
        vnpayAccountNumber: '0987654321',
        vnpayBankName: 'Ngân hàng TMCP Quân Đội (MBBank)',
        vnpayBankBin: '970422',
        vnpayAccountName: 'THU VIEN SMARTLIB',
        vnpayTimeoutMinutes: 15,
        libraryName: 'SmartLib - Thư viện Thông minh',
        libraryAddress: 'Hà Nội, Việt Nam',
        libraryPhone: '0987 654 321',
        libraryEmail: 'support@smartlib.edu.vn',
        libraryHours: '07:30 - 17:30 (Thứ 2 - Thứ 7)'
      };
      setSystemSettings(defaults);
      try {
        await api.updateSettings(defaults);
        showToast('✓ Đã khôi phục cài đặt mặc định ban đầu thành công!');
      } catch (err) {
        console.error('Lỗi khôi phục cài đặt:', err);
        showToast('❌ Không thể lưu cài đặt lên server, nhưng giao diện đã cập nhật.');
      }
    }
  };

  // Book Handlers (Thêm / Sửa / Xóa lưu trực tiếp vào database)
  const handleSaveBook = async (bookData) => {
    try {
      if (editingBook) {
        const res = await api.updateBook(editingBook.id, bookData);
        showToast('✓ Đã cập nhật sách vào cơ sở dữ liệu thành công!');
        const updated = (res && res.book) || { ...editingBook, ...bookData };
        setBooks(prev => prev.map(b => Number(b.id) === Number(editingBook.id) ? { ...b, ...updated } : b));
      } else {
        const res = await api.createBook(bookData);
        showToast('✓ Đã thêm sách mới vào cơ sở dữ liệu thành công!');
        const newBook = (res && res.book) || bookData;
        setBooks(prev => [newBook, ...prev]);
      }
      setBookModalOpen(false);
      setEditingBook(null);
      await loadData();
      window.dispatchEvent(new CustomEvent('smartlib:data-updated'));
    } catch (err) {
      console.error('Lỗi lưu sách:', err);
      throw err;
    }
  };

  const handleConfirmDeleteBook = async () => {
    if (!bookToDelete) return;
    setIsDeletingBook(true);
    setDeleteBookError('');
    try {
      const activeBorrowsForBook = (borrowRecords || []).filter(
        r => (Number(r.bookId) === Number(bookToDelete.id) || Number(r.book_id) === Number(bookToDelete.id)) &&
             ['Chờ duyệt', 'Đang mượn', 'Quá hạn'].includes(r.status)
      );
      if (activeBorrowsForBook.length > 0) {
        throw new Error(`Không thể xóa sách này vì đang có ${activeBorrowsForBook.length} lượt mượn đang diễn ra hoặc chờ duyệt!`);
      }
      await api.deleteBook(bookToDelete.id);
      setBookToDelete(null);
      showToast('✓ Đã xóa sách khỏi cơ sở dữ liệu thành công!');
      await loadData();
      window.dispatchEvent(new CustomEvent('smartlib:data-updated'));
    } catch (err) {
      setDeleteBookError(err.message || 'Không thể xóa cuốn sách này.');
    } finally {
      setIsDeletingBook(false);
    }
  };

  // Upcoming Book Handlers (Thêm / Sửa / Xóa / Nhập kho sách đặt trước)
  const handleSaveUpcomingBook = async (bookData) => {
    try {
      if (editingUpcomingBook) {
        const res = await api.updateBook(editingUpcomingBook.id, bookData);
        showToast('✓ Đã cập nhật thông tin sách đặt trước thành công!');
        const updated = (res && res.book) || { ...editingUpcomingBook, ...bookData };
        setBooks(prev => prev.map(b => Number(b.id) === Number(editingUpcomingBook.id) ? { ...b, ...updated } : b));
      } else {
        const res = await api.createBook(bookData);
        showToast('✓ Đã thêm sách mới vào kho đặt trước thành công!');
        const newBook = (res && res.book) || bookData;
        setBooks(prev => [newBook, ...prev]);
      }
      setUpcomingBookModalOpen(false);
      setEditingUpcomingBook(null);
      await loadData();
      window.dispatchEvent(new CustomEvent('smartlib:data-updated'));
    } catch (err) {
      console.error('Lỗi lưu sách đặt trước:', err);
      throw err;
    }
  };

  const handleConfirmDeleteUpcomingBook = async () => {
    if (!upcomingBookToDelete) return;
    setIsDeletingUpcomingBook(true);
    setDeleteUpcomingBookError('');
    try {
      await api.deleteBook(upcomingBookToDelete.id);
      setUpcomingBookToDelete(null);
      showToast('✓ Đã xóa sách đặt trước khỏi cơ sở dữ liệu thành công!');
      await loadData();
      window.dispatchEvent(new CustomEvent('smartlib:data-updated'));
    } catch (err) {
      setDeleteUpcomingBookError(err.message || 'Không thể xóa cuốn sách này.');
    } finally {
      setIsDeletingUpcomingBook(false);
    }
  };

  const handleConfirmReceiveStock = async () => {
    if (!receiveStockBook) return;
    setIsReceivingStock(true);
    try {
      const newQty = Math.max(1, Number(receiveStockQty) || 20);
      await api.updateBook(receiveStockBook.id, {
        status: 'Sẵn sàng',
        quantity: newQty,
        available: newQty,
        isUpcoming: false
      });
      showToast(`✓ Đã nhập kho thành công! Cuốn sách "${receiveStockBook.title}" đã chuyển sang kho sách chính thức (${newQty} cuốn).`);
      setReceiveStockBook(null);
      await loadData();
      window.dispatchEvent(new CustomEvent('smartlib:data-updated'));
    } catch (err) {
      showToast('Lỗi khi nhập kho: ' + (err.message || ''));
    } finally {
      setIsReceivingStock(false);
    }
  };

  // Reader Handlers
  const handleSaveReader = async (readerData) => {
    try {
      if (editingReader) {
        await api.updateReader(editingReader.id, readerData);
      } else {
        await api.createReader(readerData);
      }
      await loadData();
    } catch (err) {
      console.error('Lỗi lưu thông tin độc giả:', err);
      throw err;
    }
  };

  const handleConfirmDeleteReader = async () => {
    if (!readerToDelete) return;
    setIsDeletingReader(true);
    setDeleteReaderError('');
    try {
      // Kiểm tra xem độc giả có sách đang mượn chưa trả hoặc chờ duyệt không
      const activeBorrows = (borrowRecords || []).filter(
        b => (Number(b.readerId) === Number(readerToDelete.id) || Number(b.reader_id) === Number(readerToDelete.id) || Number(b.userId) === Number(readerToDelete.id)) &&
             ['Chờ duyệt', 'Đang mượn', 'Quá hạn', 'Pending', 'Approved'].includes(b.status)
      );
      if (activeBorrows.length > 0) {
        throw new Error(`Không thể xóa độc giả này vì đang có ${activeBorrows.length} sách đang mượn hoặc chờ duyệt!`);
      }
      await api.deleteReader(readerToDelete.id);
      setReaderToDelete(null);
      showToast('✓ Đã xóa tài khoản độc giả thành công!');
      await loadData();
    } catch (err) {
      setDeleteReaderError(err.message || 'Không thể xóa độc giả này.');
    } finally {
      setIsDeletingReader(false);
    }
  };

  // Borrow Handlers (Duyệt / Không duyệt dùng DIV Modal xác nhận)
  const handleConfirmBorrowAction = async () => {
    if (!borrowActionModal) return;
    setIsProcessingBorrowAction(true);
    setBorrowActionError('');
    try {
      if (borrowActionModal.type === 'approve') {
        await api.approveBorrow(borrowActionModal.record.id);
        showToast('✓ Đã phê duyệt cho mượn sách thành công!');
      } else {
        await api.rejectBorrow(borrowActionModal.record.id);
        showToast('✓ Đã từ chối yêu cầu mượn sách!');
      }
      setBorrowActionModal(null);
      await loadData();
    } catch (err) {
      setBorrowActionError(err.message || 'Lỗi khi xử lý yêu cầu mượn sách.');
    } finally {
      setIsProcessingBorrowAction(false);
    }
  };

  // Renew Handlers (Duyệt / Từ chối gia hạn mượn sách)
  const handleApproveRenew = async (record) => {
    const days = Number(record.pendingRenewDays) || 7;
    // Cập nhật giao diện tức thì 60fps (optimistic update)
    setBorrowRecords(prev => prev.map(r => {
      if (Number(r.id) === Number(record.id)) {
        let baseDate = new Date();
        if (r.returnDate || r.dueDate) {
          const parsed = new Date(r.returnDate || r.dueDate);
          if (!isNaN(parsed.getTime())) baseDate = parsed;
        }
        const newDueDate = new Date(baseDate.getTime() + days * 86400000).toISOString().substring(0, 10);
        return {
          ...r,
          returnDate: newDueDate,
          dueDate: newDueDate,
          renewCount: (Number(r.renewCount) || 0) + 1,
          renewStatus: null,
          pendingRenewDays: null,
          pendingRenewNotes: null
        };
      }
      return r;
    }));

    showToast(`✓ Đã duyệt gia hạn +${days} ngày cho độc giả "${record.readerName || 'Độc giả'}" mượn "${record.bookTitle}"!`);

    try {
      await api.approveRenewBorrow(record.id);
      await loadData(true);
    } catch (err) {
      console.error('Lỗi khi duyệt gia hạn:', err);
      showToast('Có lỗi xảy ra khi duyệt gia hạn: ' + (err.message || ''));
      await loadData(true);
    }
  };

  const handleRejectRenew = async (record) => {
    // Cập nhật giao diện tức thì 60fps (optimistic update)
    setBorrowRecords(prev => prev.map(r => 
      Number(r.id) === Number(record.id)
        ? { ...r, renewStatus: null, pendingRenewDays: null, pendingRenewNotes: null }
        : r
    ));

    showToast(`✓ Đã từ chối gia hạn mượn sách "${record.bookTitle}".`);

    try {
      await api.rejectRenewBorrow(record.id);
      await loadData(true);
    } catch (err) {
      console.error('Lỗi khi từ chối gia hạn:', err);
      showToast('Có lỗi xảy ra khi từ chối gia hạn: ' + (err.message || ''));
      await loadData(true);
    }
  };

  const handleConfirmReturn = async () => {
    if (!adminReturnRecord) return;
    const targetId = adminReturnRecord.id;
    const targetTitle = adminReturnRecord.bookTitle;
    const targetReader = adminReturnRecord.readerName;
    setIsReturning(true);

    // Cập nhật giao diện ngay lập tức
    setBorrowRecords(prev => prev.map(r => 
      Number(r.id) === Number(targetId) 
        ? { ...r, status: 'Đã trả', actualReturnDate: new Date().toISOString().substring(0, 10) }
        : r
    ));
    setAdminReturnRecord(null);

    try {
      await api.updateBorrowStatus(targetId, 'Đã trả');
      showToast(`✓ Đã xác nhận độc giả "${targetReader}" trả cuốn sách "${targetTitle}" về kho thành công!`);
      await loadData(true);
    } catch (err) {
      console.error('Lỗi khi trả sách:', err);
      showToast('Có lỗi xảy ra khi thực hiện trả sách.');
      await loadData(true);
    } finally {
      setIsReturning(false);
    }
  };

  const handleOpenBookByTitleOrId = (bookTitle, bookId) => {
    const found = books.find(b =>
      (bookId && Number(b.id) === Number(bookId)) ||
      (bookTitle && b.title && b.title.trim().toLowerCase() === bookTitle.trim().toLowerCase())
    );
    if (found) {
      setSelectedBook(found);
      setDetailModalOpen(true);
    } else {
      setSelectedBook({
        id: bookId || 0,
        title: bookTitle || 'Thông tin sách',
        author: 'Chưa rõ tác giả',
        category: 'Tài liệu thư viện',
        quantity: 1,
        borrowed: 0,
        desc: 'Thông tin chi tiết về cuốn sách trong hệ thống SmartLib.'
      });
      setDetailModalOpen(true);
    }
  };

  const handleCreateBorrowConfirm = async (formData) => {
    await api.createBorrowRecord(formData);
    loadData();
  };

  // Chỉ tính các đầu sách thực tế trong kho thư viện (loại trừ 10 cuốn sách sắp về / sắp phát hành)
  const actualBooks = books.filter(b => 
    b.status !== 'Upcoming' && 
    b.status !== 'Sắp phát hành' && 
    b.status !== 'Sắp có' && 
    !b.isUpcoming
  );

  // Danh sách sách đặt trước / sắp về (tự động fallback sang UPCOMING_BOOKS nếu CSDL chưa nạp hoặc đang chạy trên GitHub Pages)
  const dbUpcoming = books.filter(b => 
    b.isUpcoming || 
    b.status === 'Sắp phát hành' || 
    b.status === 'Sắp có' || 
    b.status === 'Upcoming' || 
    (Number(b.id) >= 51 && b.isUpcoming !== false && b.status !== 'Sẵn sàng' && b.status !== 'Hết sách' && b.status !== 'Bảo trì')
  );
  const upcomingBooksList = (dbUpcoming.length > 0 ? dbUpcoming : UPCOMING_BOOKS).map(ub => {
    const matchedDb = (books || []).find(b => Number(b.id) === Number(ub.id));
    return matchedDb ? { ...ub, ...matchedDb } : ub;
  });

  // Filtered Lists
  const filteredBooks = actualBooks.filter(b => {
    const matchSearch = b.title.toLowerCase().includes(bookSearch.toLowerCase()) || (b.author && b.author.toLowerCase().includes(bookSearch.toLowerCase()));
    const matchCat = bookCategory === 'All' || b.category === bookCategory;
    return matchSearch && matchCat;
  });

  const filteredBorrows = borrowRecords.filter(r => {
    const readerCode = r.readerId ? getReaderCode(r.readerId) : '';
    const matchSearch = (r.bookTitle && r.bookTitle.toLowerCase().includes(borrowSearch.toLowerCase())) ||
                        (r.readerName && r.readerName.toLowerCase().includes(borrowSearch.toLowerCase())) ||
                        (readerCode && readerCode.toLowerCase().includes(borrowSearch.toLowerCase()));
    const matchStatus = borrowStatusFilter === 'All' || 
                        r.status === borrowStatusFilter ||
                        (borrowStatusFilter === 'Chờ duyệt' && r.renewStatus === 'Chờ duyệt gia hạn') ||
                        (borrowStatusFilter === 'Chờ duyệt gia hạn' && r.renewStatus === 'Chờ duyệt gia hạn');
    return matchSearch && matchStatus;
  });

  const filteredReaders = readers.filter(r => {
    const code = getReaderCode(r.id);
    return code.toLowerCase().includes(readerSearch.toLowerCase()) ||
           r.fullName.toLowerCase().includes(readerSearch.toLowerCase()) ||
           (r.phone && r.phone.includes(readerSearch)) ||
           (r.email && r.email.toLowerCase().includes(readerSearch.toLowerCase()));
  });

  const categories = ['All', ...new Set(actualBooks.map(b => b.category).filter(Boolean))];

  return (
    <div style={{ padding: '28px 32px', flex: 1, background: '#ffffff' }}>
      {/* TAB 1: DASHBOARD & STATS */}
      {activeTab === 'dashboard' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>Tổng quan Thư viện & Duyệt Mượn Trả</h2>
              <p style={{ color: '#64748b', fontSize: '13.5px', marginTop: '2px' }}>Theo dõi chỉ số kho sách và quản lý các phiếu mượn</p>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setReceiptScannerOpen(true)}
                className="btn btn-outline"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)',
                  borderColor: '#93c5fd',
                  color: '#1d4ed8',
                  fontWeight: 700,
                  boxShadow: '0 2px 8px rgba(29, 78, 216, 0.08)'
                }}
                title="Quét mã QR trên phiếu mượn PDF để duyệt hoặc nhận trả sách"
              >
                <QrCode size={16} color="#2563eb" />
                <span>Quét mã QR Phiếu</span>
              </button>
              <button
                type="button"
                onClick={() => setAlertQueueOpen(true)}
                className="btn btn-outline"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  background: 'linear-gradient(135deg, #fff1f2, #ffe4e6)',
                  borderColor: '#fecdd3',
                  color: '#e11d48',
                  fontWeight: 700,
                  boxShadow: '0 2px 8px rgba(225, 29, 72, 0.08)'
                }}
                title="Hàng đợi Cảnh báo Bất thường (Mượn trả < 15 phút, Báo mất liên tiếp)"
              >
                <ShieldAlert size={16} color="#e11d48" />
                <span>Cảnh báo bất thường</span>
              </button>

              <button
                type="button"
                onClick={() => setChatbotOpen(true)}
                className="btn btn-outline"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  background: 'linear-gradient(135deg, #ede9fe, #f5f3ff)',
                  borderColor: '#c4b5fd',
                  color: '#6d28d9',
                  fontWeight: 700,
                  boxShadow: '0 2px 8px rgba(109, 40, 217, 0.08)'
                }}
                title="Hỏi đáp và truy vấn CSDL bằng tiếng Việt tự nhiên"
              >
                <Sparkles size={16} color="#7c3aed" />
                <span>Trợ lý Text-to-SQL</span>
              </button>

              <button onClick={() => setExportModalOpen(true)} className="btn btn-primary">
                <FileSpreadsheet size={16} />
                <span>Xuất báo cáo</span>
              </button>
            </div>
          </div>

          {/* Top 4 Stat Cards (Chính xác theo Ảnh 1 với hiệu ứng hover nhẹ phù hợp từng mục) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '22px' }}>
            <style>{`
              .kpi-card {
                background: #ffffff;
                border-radius: 16px;
                padding: 18px 22px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                cursor: pointer;
                transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
              }
              .kpi-card .kpi-icon-box {
                transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
              }
              .kpi-card:hover {
                transform: translateY(-3px);
              }
              .kpi-card:hover .kpi-icon-box {
                transform: scale(1.06);
              }

              /* 1. Kho sách - Theme Xanh Dương */
              .kpi-card-books {
                border: 1px solid #eef2f6;
                box-shadow: 0 2px 8px rgba(0,0,0,0.02);
              }
              .kpi-card-books:hover {
                border-color: #93c5fd;
                box-shadow: 0 10px 24px -4px rgba(37, 99, 235, 0.12), 0 4px 8px -2px rgba(37, 99, 235, 0.05);
              }
              .kpi-card-books:hover .kpi-icon-box {
                background-color: #dbeafe !important;
              }

              /* 2. Độc giả hoạt động - Theme Tím */
              .kpi-card-readers {
                border: 1px solid #eef2f6;
                box-shadow: 0 2px 8px rgba(0,0,0,0.02);
              }
              .kpi-card-readers:hover {
                border-color: #c4b5fd;
                box-shadow: 0 10px 24px -4px rgba(124, 58, 237, 0.12), 0 4px 8px -2px rgba(124, 58, 237, 0.05);
              }
              .kpi-card-readers:hover .kpi-icon-box {
                background-color: #ede9fe !important;
              }

              /* 3. Sách đang mượn - Theme Xanh Sky / Cyan */
              .kpi-card-borrowing {
                border: 1px solid #eef2f6;
                box-shadow: 0 2px 8px rgba(0,0,0,0.02);
              }
              .kpi-card-borrowing.active {
                border: 2px solid #0284c7;
                box-shadow: 0 4px 14px rgba(2, 132, 199, 0.15);
              }
              .kpi-card-borrowing:hover {
                border-color: #7dd3fc;
                box-shadow: 0 10px 24px -4px rgba(2, 132, 199, 0.14), 0 4px 8px -2px rgba(2, 132, 199, 0.05);
              }
              .kpi-card-borrowing.active:hover {
                border-color: #0284c7;
              }
              .kpi-card-borrowing:hover .kpi-icon-box {
                background-color: #bae6fd !important;
              }

              /* 4. Sách quá hạn - Theme Hổ Phách / Cảnh Báo */
              .kpi-card-overdue {
                border: 1px solid #eef2f6;
                box-shadow: 0 2px 8px rgba(0,0,0,0.02);
              }
              .kpi-card-overdue.active {
                border: 2px solid #ef4444;
                box-shadow: 0 4px 14px rgba(239, 68, 68, 0.15);
              }
              .kpi-card-overdue:hover {
                border-color: #fcd34d;
                box-shadow: 0 10px 24px -4px rgba(217, 119, 6, 0.14), 0 4px 8px -2px rgba(217, 119, 6, 0.05);
              }
              .kpi-card-overdue.has-overdue:hover {
                border-color: #fca5a5;
                box-shadow: 0 10px 24px -4px rgba(239, 68, 68, 0.14), 0 4px 8px -2px rgba(239, 68, 68, 0.05);
              }
              .kpi-card-overdue.active:hover {
                border-color: #ef4444;
              }
              .kpi-card-overdue:hover .kpi-icon-box {
                background-color: #fde68a !important;
              }
              .kpi-card-overdue.has-overdue:hover .kpi-icon-box {
                background-color: #fee2e2 !important;
              }
            `}</style>

            {/* Card 1: Kho sách */}
            <div
              onClick={() => {
                onTabChange('books');
                setTimeout(() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }, 100);
              }}
              className="kpi-card kpi-card-books"
              title="Nhấn để chuyển đến Quản lý Kho sách"
            >
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Kho sách
                </div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', margin: '4px 0 0 0', lineHeight: 1 }}>
                  {stats?.totalBooks || actualBooks.length}
                </div>
              </div>
              <div className="kpi-icon-box" style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', flexShrink: 0 }}>
                <BookOpen size={20} />
              </div>
            </div>

            {/* Card 2: Độc giả hoạt động */}
            <div
              onClick={() => {
                onTabChange('readers');
                setTimeout(() => {
                  document.getElementById('readers-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
              }}
              className="kpi-card kpi-card-readers"
              title="Nhấn để xem danh sách độc giả"
            >
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Độc giả hoạt động
                </div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', margin: '4px 0 0 0', lineHeight: 1 }}>
                  {readers.length}
                </div>
              </div>
              <div className="kpi-icon-box" style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed', flexShrink: 0 }}>
                <Users size={20} />
              </div>
            </div>

            {/* Card 3: Sách đang mượn */}
            <div
              onClick={() => handleFilterAndScrollBorrows('Đang mượn')}
              className={`kpi-card kpi-card-borrowing ${borrowStatusFilter === 'Đang mượn' ? 'active' : ''}`}
              title="Nhấn để cuộn xuống bảng sách đang mượn"
            >
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Sách đang mượn
                </div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', margin: '4px 0 0 0', lineHeight: 1 }}>
                  {borrowRecords.filter(r => r.status === 'Đang mượn').length}
                </div>
              </div>
              <div className="kpi-icon-box" style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7', flexShrink: 0 }}>
                <BookmarkCheck size={20} />
              </div>
            </div>

            {/* Card 4: Sách quá hạn */}
            <div
              onClick={() => handleFilterAndScrollBorrows('Quá hạn')}
              className={`kpi-card kpi-card-overdue ${borrowStatusFilter === 'Quá hạn' ? 'active' : ''} ${borrowRecords.filter(r => r.status === 'Quá hạn').length > 0 ? 'has-overdue' : ''}`}
              title="Nhấn để cuộn xuống bảng sách quá hạn"
            >
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Sách quá hạn
                </div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: borrowRecords.filter(r => r.status === 'Quá hạn').length > 0 ? '#ef4444' : '#0f172a', margin: '4px 0 0 0', lineHeight: 1 }}>
                  {borrowRecords.filter(r => r.status === 'Quá hạn').length}
                </div>
              </div>
              <div className="kpi-icon-box" style={{ width: '42px', height: '42px', borderRadius: '12px', background: borrowRecords.filter(r => r.status === 'Quá hạn').length > 0 ? '#fee2e2' : '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: borrowRecords.filter(r => r.status === 'Quá hạn').length > 0 ? '#ef4444' : '#d97706', flexShrink: 0 }}>
                <AlertTriangle size={20} />
              </div>
            </div>
          </div>

          {/* 3 Statistical Charts Section (Chính xác theo Ảnh 1) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '18px', marginBottom: '24px' }}>
            <MonthlyTrendChart />
            <CategoryDonutChart />
            <CategoryBorrowBarChart />
          </div>

          {/* Banner thông báo khi có yêu cầu mượn hoặc gia hạn chờ duyệt */}
          {(borrowRecords.filter(r => r.status === 'Chờ duyệt').length > 0 || borrowRecords.filter(r => r.renewStatus === 'Chờ duyệt gia hạn').length > 0) && (
            <div
              onClick={() => {
                setPendingQueueModalOpen(true);
                handleFilterAndScrollBorrows('Chờ duyệt');
              }}
              style={{
                background: '#fffbeb',
                border: borrowStatusFilter === 'Chờ duyệt' ? '2px solid #f59e0b' : '1px solid #fde68a',
                borderRadius: '14px',
                padding: '14px 20px',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.08)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fef3c7'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#fffbeb'; }}
              title="Nhấn để xem ngay danh sách và xử lý phê duyệt"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#b45309', fontSize: '13.5px', fontWeight: 600 }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Clock size={20} color="#d97706" />
                </div>
                <div>
                  <div style={{ fontSize: '14px' }}>
                    Đang có <strong style={{ color: '#92400e', fontSize: '15px' }}>{borrowRecords.filter(r => r.status === 'Chờ duyệt').length} yêu cầu mượn</strong>
                    {borrowRecords.filter(r => r.renewStatus === 'Chờ duyệt gia hạn').length > 0 && (
                      <span> và <strong style={{ color: '#b45309', fontSize: '15px' }}>{borrowRecords.filter(r => r.renewStatus === 'Chờ duyệt gia hạn').length} yêu cầu gia hạn</strong></span>
                    )} chờ thủ thư phê duyệt!
                  </div>
                  <div style={{ fontSize: '12px', color: '#b45309', fontWeight: 500, marginTop: '2px' }}>
                    Nhấn vào đây để xem ngay danh sách và xử lý phê duyệt
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingQueueModalOpen(true);
                  handleFilterAndScrollBorrows('Chờ duyệt');
                }}
                style={{
                  background: '#f59e0b',
                  color: '#ffffff',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  padding: '7px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(245, 158, 11, 0.35)',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#d97706'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#f59e0b'; }}
              >
                <span>Xem danh sách chờ duyệt</span>
                <span>»</span>
              </button>
            </div>
          )}

          {/* Borrow Records Table Section */}
          <div
            ref={borrowTableRef}
            id="borrow-records-table"
            className="card"
            style={{ scrollMarginTop: '24px' }}
          >
            {/* View Selector Tabs (Phiếu Mượn, Đặt Trước, Tiền Phạt) */}
            <div style={{ padding: '16px 20px 0 20px', display: 'flex', gap: '8px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
              <button
                type="button"
                onClick={() => {
                  setActiveBorrowView('borrows');
                  setBorrowStatusFilter('All');
                }}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px 10px 0 0',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderBottom: 'none',
                  borderColor: activeBorrowView === 'borrows' ? '#e2e8f0' : 'transparent',
                  background: activeBorrowView === 'borrows' ? '#ffffff' : 'transparent',
                  color: activeBorrowView === 'borrows' ? '#2563eb' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>Mượn - Trả sách</span>
                <span className="badge badge-info" style={{ fontSize: '11px', padding: '1px 6px' }}>{borrowRecords.length}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveBorrowView('reservations')}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px 10px 0 0',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderBottom: 'none',
                  borderColor: activeBorrowView === 'reservations' ? '#e2e8f0' : 'transparent',
                  background: activeBorrowView === 'reservations' ? '#ffffff' : 'transparent',
                  color: activeBorrowView === 'reservations' ? '#d97706' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>Đặt trước sách</span>
                <span className="badge badge-warning" style={{ fontSize: '11px', padding: '1px 6px' }}>
                  {reservations.filter(r => r.status === 'Waiting').length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveBorrowView('fines')}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px 10px 0 0',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderBottom: 'none',
                  borderColor: activeBorrowView === 'fines' ? '#e2e8f0' : 'transparent',
                  background: activeBorrowView === 'fines' ? '#ffffff' : 'transparent',
                  color: activeBorrowView === 'fines' ? '#dc2626' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>Quá hạn</span>
                {fines.filter(f => f.status === 'Chờ duyệt' || f.status === 'Chờ duyệt nộp phạt').length > 0 && (
                  <span className="badge" style={{ fontSize: '11px', padding: '1px 6px', background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', fontWeight: 800 }}>
                    {fines.filter(f => f.status === 'Chờ duyệt' || f.status === 'Chờ duyệt nộp phạt').length} Chờ duyệt
                  </span>
                )}
                <span className="badge badge-danger" style={{ fontSize: '11px', padding: '1px 6px' }}>
                  {fines.filter(f => f.status === 'Chưa nộp').length}
                </span>
              </button>
            </div>

            {/* TAB CONTENT 1: PHIẾU MƯỢN TRẢ */}
            {activeBorrowView === 'borrows' && (
              <>
                <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span>
                      Danh sách Phiếu Mượn ({filteredBorrows.length})
                    </span>
                    {borrowStatusFilter !== 'All' && (
                      <button
                        type="button"
                        onClick={() => setBorrowStatusFilter('All')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#2563eb',
                          border: '1px solid #bfdbfe',
                          background: '#eff6ff',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                        title="Xóa bộ lọc trạng thái để xem toàn bộ danh sách"
                      >
                        <span>Đang lọc: {borrowStatusFilter}</span>
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setReceiptScannerOpen(true)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                        color: '#ffffff',
                        border: 'none',
                        padding: '0 14px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        height: '34px',
                        boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
                        whiteSpace: 'nowrap'
                      }}
                      title="Quét mã QR trên phiếu mượn PDF để duyệt hoặc nhận trả sách"
                    >
                      <QrCode size={15} /> Quét mã QR phiếu
                    </button>
                    <div style={{ position: 'relative', width: '250px' }}>
                      <input
                        type="text"
                        placeholder="Tìm tên sách / độc giả..."
                        value={borrowSearch}
                        onChange={(e) => setBorrowSearch(e.target.value)}
                        style={{ paddingLeft: '32px', height: '34px', fontSize: '13px' }}
                      />
                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                    </div>
                  </div>
                </div>

                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ whiteSpace: 'nowrap', width: '55px' }}>Mã</th>
                        <th>Tên Sách</th>
                        <th style={{ whiteSpace: 'nowrap', width: '120px' }}>Độc Giả</th>
                        <th style={{ whiteSpace: 'nowrap', width: '100px' }}>Hình Thức</th>
                        <th style={{ whiteSpace: 'nowrap', width: '90px' }}>Ngày Mượn</th>
                        <th style={{ whiteSpace: 'nowrap', width: '90px' }}>Hạn Trả</th>
                        <th style={{ whiteSpace: 'nowrap', textAlign: 'center', width: '90px' }}>Tiền Phạt</th>
                        <th style={{ whiteSpace: 'nowrap', width: '95px' }}>Trạng Thái</th>
                        <th style={{ textAlign: 'center', whiteSpace: 'nowrap', width: '210px' }}>Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBorrows.length === 0 ? (
                        <tr>
                          <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                            Không tìm thấy phiếu mượn nào phù hợp với điều kiện lọc.
                          </td>
                        </tr>
                      ) : (
                        filteredBorrows.map(r => (
                          <tr key={r.id}>
                            <td style={{ fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>#{r.id}</td>
                            <td
                              style={{ fontWeight: 600, color: '#2563eb', cursor: 'pointer', transition: 'all 0.15s ease' }}
                              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                              onClick={() => handleOpenBookByTitleOrId(r.bookTitle, r.bookId)}
                              title={`Xem chi tiết sách: ${r.bookTitle}`}
                            >
                              {r.bookTitle}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.readerName}</div>
                              {r.readerId && (
                                <div style={{ fontSize: '11px', color: '#2563eb', fontWeight: 700 }}>
                                  {getReaderCode(r.readerId)}
                                </div>
                              )}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: '12px', color: '#64748b' }}>{r.borrowType || 'Mượn về nhà'}</span>
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>{r.borrowDate ? r.borrowDate.substring(0, 10) : '-'}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{r.returnDate ? r.returnDate.substring(0, 10) : '-'}</td>
                            <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {(Number(r.fine_amount || r.fineAmount || 0)) > 0 ? (
                                <span style={{
                                  background: '#fef2f2',
                                  color: '#dc2626',
                                  border: '1px solid #fca5a5',
                                  borderRadius: '6px',
                                  padding: '2px 7px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
                                  display: 'inline-block'
                                }}
                                title={`Trễ ${r.overdue_days || r.overdueDays || 0} ngày`}
                                >
                                  {Number(r.fine_amount || r.fineAmount).toLocaleString('vi-VN')} đ
                                </span>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
                              )}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                <span className={`badge ${
                                  r.status === 'Đang mượn' ? 'badge-success' :
                                  r.status === 'Chờ duyệt' ? 'badge-warning' :
                                  r.status === 'Quá hạn' ? 'badge-danger' :
                                  r.status === 'Đã trả' ? 'badge-info' : 'badge-neutral'
                                }`} style={{ whiteSpace: 'nowrap' }}>
                                  {r.status}
                                </span>
                                {r.renewStatus === 'Chờ duyệt gia hạn' && (
                                  <span 
                                    className="badge" 
                                    style={{ 
                                      background: '#fef3c7', 
                                      color: '#92400e', 
                                      border: '1px solid #fde68a',
                                      fontSize: '11px',
                                      padding: '2px 6px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      fontWeight: 600
                                    }}
                                    title={r.pendingRenewNotes ? `Ghi chú độc giả: ${r.pendingRenewNotes}` : `Xin gia hạn +${r.pendingRenewDays || 7} ngày`}
                                  >
                                    ⏳ Xin gia hạn (+{r.pendingRenewDays || 7}n)
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap' }}>
                                {r.status === 'Chờ duyệt' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setBorrowActionModal({ type: 'approve', record: r })}
                                      className="btn btn-approve btn-table-action"
                                      title="Duyệt cho mượn"
                                    >
                                      <Check size={14} /> Duyệt
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setBorrowActionModal({ type: 'reject', record: r })}
                                      className="btn btn-reject btn-table-action"
                                      title="Từ chối"
                                    >
                                      <X size={14} /> Từ chối
                                    </button>
                                  </>
                                )}

                                {r.renewStatus === 'Chờ duyệt gia hạn' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleApproveRenew(r)}
                                      className="btn btn-approve btn-table-action"
                                      style={{ background: '#059669', color: '#ffffff', borderColor: '#059669' }}
                                      title={`Duyệt gia hạn thêm ${r.pendingRenewDays || 7} ngày`}
                                    >
                                      <Check size={14} /> Duyệt GH (+{r.pendingRenewDays || 7}n)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRejectRenew(r)}
                                      className="btn btn-reject btn-table-action"
                                      title="Từ chối yêu cầu gia hạn"
                                    >
                                      <X size={14} /> Từ chối GH
                                    </button>
                                  </>
                                )}

                                {r.status === 'Đang mượn' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setAdminReturnRecord(r)}
                                      className="btn btn-return btn-table-action"
                                      title="Xác nhận trả sách"
                                    >
                                      <CheckCircle size={14} /> Trả sách
                                    </button>
                                    {r.renewStatus !== 'Chờ duyệt gia hạn' && (
                                      <button
                                        type="button"
                                        onClick={() => handleMarkOverdue(r)}
                                        className="btn btn-overdue btn-table-action"
                                        title="Xác nhận độc giả chưa trả sách và chuyển sang mục Quá hạn"
                                      >
                                        <AlertTriangle size={13} /> Quá hạn
                                      </button>
                                    )}
                                  </>
                                )}

                                {r.status === 'Quá hạn' && (
                                  <button
                                    type="button"
                                    onClick={() => setAdminReturnRecord(r)}
                                    className="btn btn-return btn-table-action"
                                    title="Xác nhận trả sách"
                                  >
                                    <CheckCircle size={14} /> Trả sách
                                  </button>
                                )}

                                {r.status === 'Đã trả' && (
                                  <span style={{ fontSize: '12px', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '98px', height: '32px' }}>—</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* TAB CONTENT 2: HÀNG CHỜ ĐẶT TRƯỚC (RESERVATIONS - FIFO) */}
            {activeBorrowView === 'reservations' && (
              <>
                <div className="card-header">
                  <div>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>Danh sách Đặt Trước Sách (Cơ chế FIFO 48h)</span>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                      Tự động xếp hàng độc giả theo thứ tự thời gian khi sách trong kho tạm hết
                    </p>
                  </div>
                </div>
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ whiteSpace: 'nowrap' }}>Mã Đặt</th>
                        <th style={{ minWidth: '220px' }}>Tên Sách</th>
                        <th style={{ whiteSpace: 'nowrap' }}>Độc Giả</th>
                        <th style={{ whiteSpace: 'nowrap' }}>Ngày Đặt</th>
                        <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>Thứ Tự Hàng Chờ</th>
                        <th style={{ whiteSpace: 'nowrap' }}>Hạn Giữ Chỗ</th>
                        <th style={{ whiteSpace: 'nowrap' }}>Trạng Thái</th>
                        <th style={{ textAlign: 'right', minWidth: '110px', whiteSpace: 'nowrap' }}>Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reservations.length === 0 ? (
                        <tr>
                          <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                            Hiện chưa có độc giả nào đặt trước sách trong hàng chờ.
                          </td>
                        </tr>
                      ) : (
                        reservations.map(res => (
                          <tr key={res.id}>
                            <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>#{res.id}</td>
                            <td style={{ fontWeight: 600, color: '#2563eb', minWidth: '220px' }}>{res.bookTitle}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <strong style={{ display: 'block' }}>{res.readerName}</strong>
                              <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Mã: DG-{String(res.readerId || 1).padStart(3, '0')}</span>
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>{res.reservedAt ? res.reservedAt.substring(0, 10) : '-'}</td>
                            <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <span style={{
                                background: res.priority === 1 ? '#dcfce7' : '#eff6ff',
                                color: res.priority === 1 ? '#15803d' : '#1d4ed8',
                                border: '1px solid',
                                borderColor: res.priority === 1 ? '#86efac' : '#bfdbfe',
                                borderRadius: '6px',
                                padding: '2px 8px',
                                fontSize: '12px',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                                display: 'inline-block'
                              }}>
                                Ưu tiên #{res.priority || 1}
                              </span>
                            </td>
                            <td style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                              {res.expiresAt ? res.expiresAt.substring(0, 16).replace('T', ' ') : '48 giờ sau khi có sách'}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <span className={`badge ${res.status === 'Waiting' ? 'badge-warning' : res.status === 'Ready' ? 'badge-success' : 'badge-neutral'}`} style={{ whiteSpace: 'nowrap' }}>
                                {res.status === 'Waiting' ? 'Đang xếp hàng' : res.status === 'Ready' ? 'Sách đã sẵn sàng' : res.status === 'Fulfilled' ? 'Đã hoàn tất' : res.status}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: '140px' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                {res.status === 'Waiting' && (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateReservationStatus(res.id, 'Ready')}
                                    className="btn btn-approve btn-table-action"
                                    title="Báo sách đã về kho và sẵn sàng cho độc giả này mượn"
                                  >
                                    <Check size={14} /> Báo sách về
                                  </button>
                                )}
                                {res.status === 'Ready' && (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateReservationStatus(res.id, 'Fulfilled')}
                                    className="btn btn-approve btn-table-action"
                                    title="Độc giả đã nhận sách, đánh dấu hoàn tất lượt đặt trước"
                                  >
                                    <Check size={14} /> Hoàn tất
                                  </button>
                                )}
                                {(res.status === 'Waiting' || res.status === 'Ready') && (
                                  <button
                                    type="button"
                                    onClick={() => handleCancelReservation(res.id)}
                                    className="btn btn-reject btn-table-action"
                                    title="Hủy lượt đặt trước này"
                                  >
                                    <X size={14} /> Hủy đặt
                                  </button>
                                )}
                                {res.status !== 'Waiting' && res.status !== 'Ready' && (
                                  <span style={{ color: '#94a3b8', fontSize: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '98px', height: '32px' }}>—</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* TAB CONTENT 3: QUẢN LÝ TIỀN PHẠT (FINES) */}
            {activeBorrowView === 'fines' && (
              <>
                <div className="card-header">
                  <div>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>Danh Sách Độc Giả Bị Phạt Quá Hạn (2.000 đ / ngày)</span>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                      Theo dõi và xác nhận thu tiền phạt trễ hạn khi độc giả hoàn trả sách
                    </p>
                  </div>
                </div>
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ whiteSpace: 'nowrap', width: '65px' }}>Mã Phạt</th>
                        <th style={{ whiteSpace: 'nowrap', width: '85px' }}>Phiếu Mượn</th>
                        <th>Tên Sách</th>
                        <th style={{ whiteSpace: 'nowrap', width: '120px' }}>Độc Giả</th>
                        <th style={{ whiteSpace: 'nowrap', width: '90px' }}>Hạn Trả</th>
                        <th style={{ whiteSpace: 'nowrap', width: '90px' }}>Ngày Trả</th>
                        <th style={{ whiteSpace: 'nowrap', width: '90px', textAlign: 'center' }}>Tiền Phạt</th>
                        <th style={{ whiteSpace: 'nowrap', width: '100px' }}>Phương Thức</th>
                        <th style={{ whiteSpace: 'nowrap', width: '90px' }}>Trạng Thái</th>
                        <th style={{ textAlign: 'center', whiteSpace: 'nowrap', width: '190px' }}>Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fines.length === 0 ? (
                        <tr>
                          <td colSpan="10" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                            Tuyệt vời! Hiện không có khoản tiền phạt quá hạn nào chưa thanh toán.
                          </td>
                        </tr>
                      ) : (
                        fines.map(f => (
                          <tr key={f.id}>
                            <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>#{f.id}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>#{f.borrowRecordId || '-'}</td>
                            <td style={{ fontWeight: 600, color: '#2563eb' }}>{f.bookTitle}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <strong style={{ display: 'block' }}>{f.readerName}</strong>
                              <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Mã: DG-{String(f.readerId || 1).padStart(3, '0')}</span>
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>{f.dueDate ? f.dueDate.substring(0, 10) : '-'}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{f.actualReturnDate ? f.actualReturnDate.substring(0, 10) : '-'}</td>
                            <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                              <span style={{
                                background: '#fef2f2',
                                color: '#dc2626',
                                border: '1px solid #fca5a5',
                                borderRadius: '6px',
                                padding: '3px 8px',
                                fontSize: '12.5px',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                                display: 'inline-block'
                              }}>
                                {Number(f.fineAmount || 0).toLocaleString('vi-VN')} đ
                              </span>
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {f.paymentMethod ? (
                                <div style={{ whiteSpace: 'nowrap' }}>
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    background: f.paymentMethod === 'VNPay' ? '#eff6ff' : '#f8fafc',
                                    color: f.paymentMethod === 'VNPay' ? '#1d4ed8' : '#475569',
                                    border: f.paymentMethod === 'VNPay' ? '1px solid #bfdbfe' : '1px solid #cbd5e1',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {f.paymentMethod === 'VNPay' ? '💳 VNPay' : '💵 Tiền mặt'}
                                  </span>
                                  {f.transactionRef && (
                                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontFamily: 'monospace' }}>
                                      {f.transactionRef}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: '12px' }}>-</span>
                              )}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <span
                                className={`badge ${f.status === 'Đã nộp' ? 'badge-success' : (f.status === 'Chờ duyệt' || f.status === 'Chờ duyệt nộp phạt') ? 'badge-warning' : 'badge-danger'}`}
                                style={f.status === 'Chờ duyệt' || f.status === 'Chờ duyệt nộp phạt' ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', fontWeight: 700, whiteSpace: 'nowrap' } : { whiteSpace: 'nowrap' }}
                              >
                                {f.status === 'Chờ duyệt' || f.status === 'Chờ duyệt nộp phạt' ? '⏳ Chờ duyệt' : (f.status || 'Chưa nộp')}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {f.status === 'Chờ duyệt' || f.status === 'Chờ duyệt nộp phạt' ? (
                                <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap' }}>
                                  <button
                                    type="button"
                                    onClick={() => setFineActionModal({ type: 'approve', fine: f })}
                                    className="btn btn-approve btn-table-action"
                                    title="Duyệt giao dịch nộp phạt và mở khóa tài khoản độc giả"
                                  >
                                    <Check size={14} /> Duyệt
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setFineActionModal({ type: 'reject', fine: f, reason: 'Chưa nhận được giao dịch chuyển khoản hoặc thông tin sai lệch' })}
                                    className="btn btn-reject btn-table-action"
                                    title="Từ chối giao dịch nộp phạt"
                                  >
                                    <X size={14} /> Từ chối
                                  </button>
                                </div>
                              ) : f.status !== 'Đã nộp' ? (
                                <button
                                  type="button"
                                  onClick={() => handlePayFine(f.id)}
                                  className="btn btn-success btn-table-action"
                                  title="Xác nhận độc giả đã nộp đủ tiền phạt"
                                >
                                  Thu phạt
                                </button>
                              ) : (
                                <span style={{ color: '#16a34a', fontSize: '12.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '32px' }}>
                                  ✓ Đã thu
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: QUẢN LÝ KHO SÁCH */}
      {activeTab === 'books' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>Quản lý Kho Sách Thư Viện</h2>
              <p style={{ color: '#64748b', fontSize: '13.5px', marginTop: '2px' }}>
                Quản lý chi tiết toàn bộ {actualBooks.length} đầu sách thực tế, tồn kho và cập nhật trực tiếp vào cơ sở dữ liệu
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setAiUploadOpen(true)}
                className="btn btn-outline"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  background: 'linear-gradient(135deg, #ede9fe, #f5f3ff)',
                  borderColor: '#c4b5fd',
                  color: '#6d28d9',
                  fontWeight: 700,
                  boxShadow: '0 2px 8px rgba(109, 40, 217, 0.08)'
                }}
                title="Tự động bóc tách thông tin tựa sách, tác giả từ ảnh bìa bằng AI"
              >
                <Sparkles size={16} color="#7c3aed" />
                <span>Biên mục bằng AI</span>
              </button>

              <button
                onClick={() => { setEditingBook(null); setBookModalOpen(true); }}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={16} />
                <span>Thêm sách mới</span>
              </button>
            </div>
          </div>

          {/* Table Container Card (Thiết kế chuẩn theo Ảnh phiếu mượn) */}
          <div ref={booksTableRef} id="books-table" className="card" style={{ scrollMarginTop: '24px' }}>
            <div className="card-header">
              <span>Danh sách Kho Sách & Quản lý Tồn Kho ({filteredBooks.length})</span>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {/* Search */}
                <div style={{ position: 'relative', width: '240px' }}>
                  <input
                    type="text"
                    placeholder="Tìm tên sách, tác giả..."
                    value={bookSearch}
                    onChange={(e) => setBookSearch(e.target.value)}
                    style={{ paddingLeft: '32px', height: '34px', fontSize: '13px' }}
                  />
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                </div>

                {/* Filter Thể loại */}
                <div style={{ position: 'relative', width: '190px' }}>
                  <select
                    value={bookCategory}
                    onChange={(e) => setBookCategory(e.target.value)}
                    style={{ height: '34px', fontSize: '13px', paddingLeft: '28px', paddingTop: 0, paddingBottom: 0 }}
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>{c === 'All' ? 'Tất cả thể loại' : c}</option>
                    ))}
                  </select>
                  <Filter size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                </div>

                {/* View Switcher: Bảng / Lưới */}
                <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '2px' }}>
                  <button
                    onClick={() => setBookViewMode('table')}
                    style={{
                      border: 'none',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: bookViewMode === 'table' ? '#ffffff' : 'transparent',
                      color: bookViewMode === 'table' ? '#2563eb' : '#64748b',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      fontWeight: 600
                    }}
                    title="Chế độ xem Bảng chi tiết"
                  >
                    <List size={13} /> Bảng
                  </button>
                  <button
                    onClick={() => setBookViewMode('grid')}
                    style={{
                      border: 'none',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: bookViewMode === 'grid' ? '#ffffff' : 'transparent',
                      color: bookViewMode === 'grid' ? '#2563eb' : '#64748b',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      fontWeight: 600
                    }}
                    title="Chế độ xem Lưới bìa sách"
                  >
                    <Grid size={13} /> Lưới
                  </button>
                </div>
              </div>
            </div>

            {/* Content: Bảng hoặc Lưới */}
            {bookViewMode === 'table' ? (
              <div className="table-responsive">
                <style>{`
                  .btn-action-cell {
                    width: 95px;
                    height: 32px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 5px;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    outline: none;
                    box-sizing: border-box;
                  }
                  .btn-action-borrow {
                    background: #0284c7;
                    color: #ffffff;
                    border: 1px solid #0284c7;
                    box-shadow: 0 1px 3px rgba(2, 132, 199, 0.25);
                  }
                  .btn-action-borrow:hover:not(:disabled) {
                    background: #0369a1;
                    border-color: #0369a1;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);
                  }
                  .btn-action-borrow:disabled {
                    background: #f1f5f9;
                    color: #94a3b8;
                    border: 1px solid #e2e8f0;
                    cursor: not-allowed;
                    box-shadow: none;
                  }
                  .btn-action-edit {
                    background: #eff6ff;
                    color: #2563eb;
                    border: 1px solid #bfdbfe;
                  }
                  .btn-action-edit:hover {
                    background: #2563eb;
                    color: #ffffff;
                    border-color: #2563eb;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
                  }
                  .btn-action-qr {
                    background: #f0fdfa;
                    color: #0d9488;
                    border: 1px solid #99f6e4;
                  }
                  .btn-action-qr:hover {
                    background: #0d9488;
                    color: #ffffff;
                    border-color: #0d9488;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(13, 148, 136, 0.35);
                  }
                  .btn-action-delete {
                    background: #fef2f2;
                    color: #ef4444;
                    border: 1px solid #fecaca;
                  }
                  .btn-action-delete:hover {
                    background: #ef4444;
                    color: #ffffff;
                    border-color: #ef4444;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
                  }
                `}</style>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '60px', whiteSpace: 'nowrap' }}>ID</th>
                      <th style={{ minWidth: '220px' }}>Tên Sách</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Tác Giả</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Thể Loại</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Số Lượng</th>
                      <th style={{ whiteSpace: 'nowrap' }}>Trạng Thái</th>
                      <th style={{ textAlign: 'center', minWidth: '210px', whiteSpace: 'nowrap' }}>Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBooks.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
                          Không tìm thấy cuốn sách nào phù hợp với bộ lọc tìm kiếm.
                        </td>
                      </tr>
                    ) : (
                      filteredBooks.map(b => {
                        const qty = Number(b.quantity) || 1;
                        const activeBorrowsForBook = borrowRecords.filter(r => {
                          const matchId = Number(r.bookId || r.book_id || 0) === Number(b.id);
                          const matchTitle = (r.bookTitle || r.book_title) && b.title && (r.bookTitle || r.book_title).trim().toLowerCase() === b.title.trim().toLowerCase();
                          return (matchId || matchTitle) && (r.status === 'Đang mượn' || r.status === 'Quá hạn');
                        }).length;
                        const borrowed = Math.max(Number(b.borrowed) || 0, activeBorrowsForBook);
                        const avail = b.available_copies !== undefined && b.available_copies !== null
                          ? Math.max(0, Math.min(qty, Number(b.available_copies)))
                          : Math.max(0, qty - borrowed);

                        return (
                          <tr key={b.id}>
                            {/* Cột 1: Mã sách #ID */}
                            <td style={{ fontWeight: 700, color: '#64748b', fontSize: '13.5px', whiteSpace: 'nowrap' }}>
                              #{b.id}
                            </td>

                            {/* Cột 2: Tên sách (Link xanh click xem chi tiết) */}
                            <td style={{ minWidth: '220px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {b.imageUrl ? (
                                  <img
                                    src={b.imageUrl}
                                    alt={b.title}
                                    style={{ width: '32px', height: '42px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #e2e8f0', flexShrink: 0 }}
                                  />
                                ) : (
                                  <div style={{ width: '32px', height: '42px', background: '#f1f5f9', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', flexShrink: 0 }}>
                                    <BookOpen size={16} />
                                  </div>
                                )}
                                <div>
                                  <span
                                    onClick={() => { setSelectedBook(b); setDetailModalOpen(true); }}
                                    style={{
                                      fontWeight: 700,
                                      color: '#2563eb',
                                      cursor: 'pointer',
                                      fontSize: '13.5px',
                                      lineHeight: 1.3
                                    }}
                                    className="hover:underline"
                                    title="Nhấp để xem chi tiết sách"
                                  >
                                    {b.title}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Cột 3: Tác giả (Nằm trên 1 dòng, xóa chữ Tác giả bên dưới) */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px', whiteSpace: 'nowrap' }}>
                                {b.author || 'Chưa rõ'}
                              </div>
                            </td>

                            {/* Cột 4: Thể loại */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                                {b.category || 'Khác'}
                              </span>
                            </td>

                            {/* Cột 5: Số lượng (Tổng số sách ban đầu của hệ thống) */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                                {qty} cuốn
                              </span>
                            </td>

                            {/* Cột 6: Trạng thái (Cập nhật số lượng sẵn có thực tế) */}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {avail > 0 ? (
                                <span
                                  className="badge"
                                  style={{
                                    background: '#dcfce7',
                                    color: '#16a34a',
                                    fontWeight: 600,
                                    fontSize: '12px',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  Còn {avail} cuốn
                                </span>
                              ) : (
                                <span
                                  className="badge"
                                  style={{
                                    background: '#fee2e2',
                                    color: '#dc2626',
                                    fontWeight: 600,
                                    fontSize: '12px',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  Hết sách
                                </span>
                              )}
                            </td>

                            {/* Cột 7: Thao tác (Căn giữa, kích thước đều nhau 95px x 32px, cách đều 8px, hiệu ứng hover riêng) */}
                            <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '12px 8px', whiteSpace: 'nowrap', minWidth: '210px' }}>
                              <div style={{
                                display: 'inline-grid',
                                gridTemplateColumns: 'repeat(2, 95px)',
                                gap: '8px',
                                justifyContent: 'center',
                                alignItems: 'center'
                              }}>
                                {/* Hàng 1, Cột 1: Cho mượn */}
                                {avail > 0 ? (
                                  <button
                                    onClick={() => { setBorrowTargetBook(b); setBorrowModalOpen(true); }}
                                    className="btn-action-cell btn-action-borrow"
                                    title="Cho độc giả mượn cuốn sách này"
                                  >
                                    <BookMarked size={14} /> Cho mượn
                                  </button>
                                ) : (
                                  <button
                                    disabled
                                    className="btn-action-cell btn-action-borrow"
                                    title="Sách đã được mượn hết"
                                  >
                                    <BookMarked size={14} /> Cho mượn
                                  </button>
                                )}

                                {/* Hàng 1, Cột 2: Sửa (bên cạnh Cho mượn) */}
                                <button
                                  onClick={() => { setEditingBook(b); setBookModalOpen(true); }}
                                  className="btn-action-cell btn-action-edit"
                                  title="Chỉnh sửa thông tin sách"
                                >
                                  <Edit2 size={14} /> Sửa
                                </button>

                                {/* Hàng 2, Cột 1: Mã QR (nằm dưới Cho mượn) */}
                                <button
                                  onClick={() => { setSelectedBook(b); setDetailModalOpen(true); }}
                                  className="btn-action-cell btn-action-qr"
                                  title="Xem và tải mã QR của cuốn sách này"
                                >
                                  <QrCode size={14} /> Mã QR
                                </button>

                                {/* Hàng 2, Cột 2: Xóa (nằm dưới Sửa) */}
                                <button
                                  onClick={() => setBookToDelete(b)}
                                  className="btn-action-cell btn-action-delete"
                                  title="Xóa sách khỏi cơ sở dữ liệu"
                                >
                                  <Trash2 size={14} /> Xóa
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Grid View Lưới khi chuyển chế độ */
              <div style={{ padding: '22px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(205px, 1fr))', gap: '18px' }}>
                  {filteredBooks.map(b => (
                    <div
                      key={b.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        background: '#ffffff',
                        borderRadius: '14px',
                        border: '1px solid #eef2f6',
                        overflow: 'hidden',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 8px 18px rgba(0,0,0,0.06)';
                        e.currentTarget.style.borderColor = '#cbd5e1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)';
                        e.currentTarget.style.borderColor = '#eef2f6';
                      }}
                    >
                      <BookCard
                        book={b}
                        onSelect={(book) => { setSelectedBook(book); setDetailModalOpen(true); }}
                        isAdmin={true}
                      />

                      <div style={{ display: 'flex', gap: '6px', padding: '8px 10px 10px 10px', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                        <button
                          onClick={() => { setBorrowTargetBook(b); setBorrowModalOpen(true); }}
                          className="btn btn-outline"
                          style={{ flex: 1, padding: '5px 6px', fontSize: '11.5px', fontWeight: 600, color: '#16a34a', borderColor: '#bbf7d0', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}
                          title="Cho mượn"
                        >
                          <BookMarked size={13} /> Mượn
                        </button>
                        <button
                          onClick={() => { setEditingBook(b); setBookModalOpen(true); }}
                          className="btn btn-outline"
                          style={{ padding: '5px 8px', fontSize: '11.5px', fontWeight: 600, color: '#2563eb', borderColor: '#bfdbfe', background: '#ffffff', display: 'flex', alignItems: 'center', gap: '3px' }}
                          title="Chỉnh sửa"
                        >
                          <Edit2 size={13} /> Sửa
                        </button>
                        <button
                          onClick={() => setBookToDelete(b)}
                          className="btn btn-outline"
                          style={{ padding: '5px 8px', fontSize: '11.5px', fontWeight: 600, color: '#ef4444', borderColor: '#fecaca', background: '#ffffff', display: 'flex', alignItems: 'center', gap: '3px' }}
                          title="Xóa sách"
                        >
                          <Trash2 size={13} /> Xóa
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB PRE-ORDERS: QUẢN LÝ KHO SÁCH ĐẶT TRƯỚC (SÁCH SẮP VỀ) */}
      {activeTab === 'pre-orders' && (() => {
        // upcomingBooksList đã được khai báo ở cấp component (dòng ~1289), có fallback sang UPCOMING_BOOKS
        // khi chạy trên GitHub Pages hoặc khi CSDL chưa có dữ liệu sách sắp về

        // Helper chuẩn hóa và trích xuất ngày phát hành sách sắp về
        const parseReleaseDate = (b) => {
          let str = (b.releaseDate || '').trim();
          if (!str && (b.desc || b.description)) {
            const text = b.desc || b.description || '';
            if (text.includes('Dự kiến phát hành:')) {
              str = text.split('Dự kiến phát hành:')[1].trim().split('.')[0].trim();
            }
          }
          if (!str) return new Date(2099, 11, 31);

          const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
          if (dmyMatch) {
            return new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
          }

          const myMatch = str.match(/^(\d{1,2})[-/](\d{4})$/);
          if (myMatch) {
            return new Date(parseInt(myMatch[2], 10), parseInt(myMatch[1], 10) - 1, 1);
          }

          const yMatch = str.match(/^(\d{4})$/);
          if (yMatch) {
            return new Date(parseInt(yMatch[1], 10), 0, 1);
          }

          const parsed = new Date(str);
          if (!isNaN(parsed.getTime())) return parsed;
          return new Date(2099, 11, 31);
        };

        const formatReleaseDate = (b) => {
          return b.releaseDate || (b.desc && b.desc.includes('Dự kiến phát hành:') ? b.desc.split('Dự kiến phát hành:')[1].trim().split('.')[0].trim() : '10-2026');
        };

        const now = new Date();

        const filteredUpcoming = upcomingBooksList.filter(book => {
          const q = upcomingSearch.toLowerCase().trim();
          const matchesSearch = !q ||
            (book.title || '').toLowerCase().includes(q) ||
            (book.author || '').toLowerCase().includes(q) ||
            (book.category || '').toLowerCase().includes(q);

          const matchesCat = upcomingCategoryFilter === 'All' || book.category === upcomingCategoryFilter;

          let matchesDate = true;
          if (upcomingMonthFilter !== 'All') {
            const bDate = parseReleaseDate(book);
            const diffDays = Math.ceil((bDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (upcomingMonthFilter === '1m') {
              matchesDate = diffDays <= 31;
            } else if (upcomingMonthFilter === '3m') {
              matchesDate = diffDays <= 92;
            } else if (upcomingMonthFilter === '6m') {
              matchesDate = diffDays <= 183;
            } else if (upcomingMonthFilter === 'after6m') {
              matchesDate = diffDays > 183;
            }
          }

          return matchesSearch && matchesCat && matchesDate;
        });

        // Đếm số lượt độc giả đặt trước cho từng sách
        const getBookPreOrderCount = (bookId) => {
          return reservations.filter(r => 
            Number(r.bookId || r.book_id) === Number(bookId) && 
            r.status !== 'Cancelled' && 
            r.status !== 'Hủy' && 
            r.status !== 'Fulfilled'
          ).length;
        };

        // Lọc danh sách yêu cầu đặt trước có hiệu lực cho các sách sắp về
        const activePreOrderReservations = reservations.filter(r => 
          upcomingBooksList.some(ub => Number(ub.id) === Number(r.bookId || r.book_id)) && 
          r.status !== 'Cancelled' && 
          r.status !== 'Hủy' && 
          r.status !== 'Fulfilled'
        );

        // Nhóm theo tài khoản độc giả: 1 độc giả đặt nhiều cuốn chỉ tính 1 tài khoản
        const preOrderReadersMap = new Map();
        activePreOrderReservations.forEach(r => {
          const readerId = Number(r.readerId || r.userId || r.user_id || 0);
          if (!preOrderReadersMap.has(readerId)) {
            const readerObj = readers.find(rd => Number(rd.id) === readerId) || {
              id: readerId,
              fullName: r.readerName || r.userName || (readerId === 2 ? 'Trần Thị Mai' : `Độc giả #${readerId}`),
              username: r.username || (readerId === 2 ? 'reader' : `user_${readerId}`),
              phone: r.phone || (readerId === 2 ? '0912345678' : ''),
              email: r.email || (readerId === 2 ? 'mai.tran@gmail.com' : '')
            };
            preOrderReadersMap.set(readerId, {
              reader: readerObj,
              reservations: [],
              books: []
            });
          }
          const entry = preOrderReadersMap.get(readerId);
          entry.reservations.push(r);
          const b = upcomingBooksList.find(ub => Number(ub.id) === Number(r.bookId || r.book_id)) || books.find(bk => Number(bk.id) === Number(r.bookId || r.book_id));
          if (b && !entry.books.some(eb => Number(eb.id) === Number(b.id))) {
            entry.books.push(b);
          }
        });

        const preOrderReadersList = Array.from(preOrderReadersMap.values());
        const totalUniquePreOrderReaders = preOrderReadersMap.size;

        // Top 5 sách dự kiến về sớm nhất (sắp xếp theo thời gian tăng dần)
        const earliestUpcomingBooks = [...upcomingBooksList]
          .sort((a, b) => parseReleaseDate(a) - parseReleaseDate(b))
          .slice(0, 5);

        // Top 5 sách được mong đợi nhất theo đánh giá AI
        const topRatedUpcomingBooks = [...upcomingBooksList]
          .map(b => {
            const rating = Number(b.rating) || 9.0;
            const waitCount = getBookPreOrderCount(b.id);
            const aiScore = (rating * 10) + (waitCount * 1.8);
            return { ...b, parsedRating: rating, waitCount, aiScore };
          })
          .sort((a, b) => b.aiScore - a.aiScore || b.parsedRating - a.parsedRating)
          .slice(0, 5);

        const topAiBook = topRatedUpcomingBooks[0] || null;

        const upcomingCategories = Array.from(new Set(upcomingBooksList.map(b => b.category).filter(Boolean)));

        return (
          <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px', flexWrap: 'wrap', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)' }}>
                  <Clock size={22} />
                </div>
                <div>
                  <h2 style={{ fontSize: '21px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Quản lý Kho Sách Đặt Trước (Sách Sắp Về)
                  </h2>
                  <p style={{ color: '#64748b', fontSize: '13px', margin: '3px 0 0 0' }}>
                    Theo dõi kế hoạch phát hành, quản lý kho sách chuẩn bị nhập và nhu cầu đăng ký chờ mượn từ độc giả
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setEditingUpcomingBook(null); setUpcomingBookModalOpen(true); }}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', borderRadius: '10px', fontWeight: 700, fontSize: '13.5px', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)' }}
              >
                <Plus size={17} />
                <span>Thêm sách sắp về</span>
              </button>
            </div>

            {/* KPI Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              {/* Card 1: Cuộn xuống danh sách sách sắp về */}
              <div
                onClick={() => {
                  const el = document.getElementById('upcoming-books-content');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                role="button"
                tabIndex={0}
                title="Nhấp để cuộn xuống danh sách các sách sắp về"
                style={{
                  background: '#ffffff',
                  borderRadius: '14px',
                  padding: '18px 20px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.12)';
                  e.currentTarget.style.borderColor = '#93c5fd';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.03)';
                  e.currentTarget.style.borderColor = '#e2e8f0';
                }}
              >
                <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BookOpen size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Tổng đầu sách sắp về</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>{upcomingBooksList.length}</div>
                </div>
              </div>

              {/* Card 2: Dự kiến số sách về sớm nhất */}
              <div
                onClick={() => setEarliestBooksModalOpen(true)}
                role="button"
                tabIndex={0}
                title="Nhấp để xem 5 cuốn sách dự kiến về sớm nhất"
                style={{
                  background: '#ffffff',
                  borderRadius: '14px',
                  padding: '18px 20px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(217, 119, 6, 0.12)';
                  e.currentTarget.style.borderColor = '#fcd34d';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.03)';
                  e.currentTarget.style.borderColor = '#e2e8f0';
                }}
              >
                <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Calendar size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Dự kiến số sách về sớm nhất</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                    {earliestUpcomingBooks.length} <span style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>/ {upcomingBooksList.length} cuốn</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Độc giả đặt trước (tính theo tài khoản duy nhất) */}
              <div
                onClick={() => setPreOrderReadersModalOpen(true)}
                role="button"
                tabIndex={0}
                title="Nhấp để xem danh sách sách đã đặt trước theo tài khoản độc giả"
                style={{
                  background: '#ffffff',
                  borderRadius: '14px',
                  padding: '18px 20px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(22, 163, 74, 0.12)';
                  e.currentTarget.style.borderColor = '#86efac';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.03)';
                  e.currentTarget.style.borderColor = '#e2e8f0';
                }}
              >
                <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Độc giả đặt trước</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#16a34a', lineHeight: 1.2 }}>
                    {totalUniquePreOrderReaders}
                  </div>
                </div>
              </div>

              {/* Card 4: Được mong đợi nhất */}
              <div
                onClick={() => setTopRatedModalOpen(true)}
                role="button"
                tabIndex={0}
                title="Nhấp để xem Top 5 sách được mong đợi nhất theo gợi ý của AI"
                style={{
                  background: '#ffffff',
                  borderRadius: '14px',
                  padding: '18px 20px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(147, 51, 234, 0.12)';
                  e.currentTarget.style.borderColor = '#d8b4fe';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.03)';
                  e.currentTarget.style.borderColor = '#e2e8f0';
                }}
              >
                <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: '#faf5ff', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={22} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Được mong đợi nhất</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={topAiBook?.title || 'Chưa có'}>
                    {topAiBook ? topAiBook.title : 'Chưa có'}
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="card" style={{ padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', borderRadius: '14px' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', flex: 1, minWidth: '320px' }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '380px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder="Tìm theo tên sách, tác giả, thể loại..."
                    value={upcomingSearch}
                    onChange={(e) => setUpcomingSearch(e.target.value)}
                    style={{ width: '100%', height: '38px', padding: '0 32px 0 36px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', boxSizing: 'border-box', backgroundColor: '#ffffff', color: '#0f172a' }}
                  />
                  {upcomingSearch && (
                    <button onClick={() => setUpcomingSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Category filter */}
                <div style={{ minWidth: '170px' }}>
                  <select
                    value={upcomingCategoryFilter}
                    onChange={(e) => setUpcomingCategoryFilter(e.target.value)}
                    style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', backgroundColor: '#ffffff', color: '#334155', boxSizing: 'border-box', cursor: 'pointer' }}
                  >
                    <option value="All">Tất cả thể loại</option>
                    {upcomingCategories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Real-time Dynamic Release Date Filter */}
                <div style={{ minWidth: '180px' }}>
                  <select
                    value={upcomingMonthFilter}
                    onChange={(e) => setUpcomingMonthFilter(e.target.value)}
                    style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', backgroundColor: '#ffffff', color: '#334155', boxSizing: 'border-box', cursor: 'pointer' }}
                  >
                    <option value="All">Tất cả đợt phát hành</option>
                    <option value="1m">Trong vòng 1 tháng</option>
                    <option value="3m">Trong vòng 3 tháng</option>
                    <option value="6m">Trong vòng 6 tháng</option>
                    <option value="after6m">Sau 6 tháng</option>
                  </select>
                </div>
              </div>

              {/* View Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                <button
                  type="button"
                  onClick={() => setUpcomingViewMode('table')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: upcomingViewMode === 'table' ? '#ffffff' : 'transparent',
                    color: upcomingViewMode === 'table' ? '#2563eb' : '#64748b',
                    boxShadow: upcomingViewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <List size={14} /> Bảng
                </button>
                <button
                  type="button"
                  onClick={() => setUpcomingViewMode('grid')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: upcomingViewMode === 'grid' ? '#ffffff' : 'transparent',
                    color: upcomingViewMode === 'grid' ? '#2563eb' : '#64748b',
                    boxShadow: upcomingViewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Grid size={14} /> Thẻ
                </button>
              </div>
            </div>

            {/* Content List */}
            <div id="upcoming-books-content" style={{ scrollMarginTop: '24px' }}>
              {filteredUpcoming.length === 0 ? (
              <div className="card" style={{ padding: '50px 20px', textAlign: 'center', color: '#94a3b8' }}>
                <Clock size={48} style={{ margin: '0 auto 12px', color: '#cbd5e1' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#475569', margin: '0 0 6px 0' }}>
                  Không tìm thấy sách đặt trước nào
                </h3>
                <p style={{ fontSize: '13px', margin: '0 0 16px 0' }}>
                  Không có cuốn sách sắp về nào khớp với từ khóa tìm kiếm hoặc bộ lọc hiện tại.
                </p>
                <button
                  type="button"
                  onClick={() => { setUpcomingSearch(''); setUpcomingCategoryFilter('All'); setUpcomingMonthFilter('All'); }}
                  className="btn btn-outline"
                  style={{ fontSize: '13px' }}
                >
                  Xóa bộ lọc
                </button>
              </div>
            ) : upcomingViewMode === 'table' ? (
              /* TABLE VIEW */
              <div className="card" style={{ overflow: 'hidden', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <div className="table-responsive">
                  <style>{`
                    .btn-action-cell {
                      width: 95px;
                      height: 32px;
                      border-radius: 8px;
                      font-size: 12px;
                      font-weight: 600;
                      display: inline-flex;
                      align-items: center;
                      justify-content: center;
                      gap: 5px;
                      cursor: pointer;
                      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                      outline: none;
                      box-sizing: border-box;
                    }
                    .btn-action-receive {
                      background: #16a34a;
                      color: #ffffff;
                      border: 1px solid #16a34a;
                      box-shadow: 0 1px 3px rgba(22, 163, 74, 0.25);
                    }
                    .btn-action-receive:hover {
                      background: #15803d;
                      border-color: #15803d;
                      transform: translateY(-2px);
                      box-shadow: 0 4px 12px rgba(22, 163, 74, 0.4);
                    }
                    .btn-action-edit {
                      background: #eff6ff;
                      color: #2563eb;
                      border: 1px solid #bfdbfe;
                    }
                    .btn-action-edit:hover {
                      background: #2563eb;
                      color: #ffffff;
                      border-color: #2563eb;
                      transform: translateY(-2px);
                      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
                    }
                    .btn-action-detail {
                      background: #f0fdfa;
                      color: #0d9488;
                      border: 1px solid #99f6e4;
                    }
                    .btn-action-detail:hover {
                      background: #0d9488;
                      color: #ffffff;
                      border-color: #0d9488;
                      transform: translateY(-2px);
                      box-shadow: 0 4px 12px rgba(13, 148, 136, 0.35);
                    }
                    .btn-action-delete {
                      background: #fef2f2;
                      color: #ef4444;
                      border: 1px solid #fecaca;
                    }
                    .btn-action-delete:hover {
                      background: #ef4444;
                      color: #ffffff;
                      border-color: #ef4444;
                      transform: translateY(-2px);
                      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
                    }
                  `}</style>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '60px', textAlign: 'center' }}>Mã</th>
                        <th style={{ minWidth: '240px' }}>Tác phẩm & Bìa sách</th>
                        <th style={{ minWidth: '130px' }}>Tác giả</th>
                        <th style={{ minWidth: '140px' }}>Thể loại</th>
                        <th style={{ minWidth: '120px' }}>Dự kiến về</th>
                        <th style={{ minWidth: '140px', textAlign: 'center' }}>Bạn đọc chờ</th>
                        <th style={{ minWidth: '110px', textAlign: 'center' }}>Trạng thái</th>
                        <th style={{ minWidth: '210px', textAlign: 'center', whiteSpace: 'nowrap' }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUpcoming.map(b => {
                        const preCount = getBookPreOrderCount(b.id);
                        const relDate = b.releaseDate || (b.desc && b.desc.includes('Dự kiến phát hành:') ? b.desc.split('Dự kiến phát hành:')[1].trim().split('.')[0].trim() : '10-2026');

                        return (
                          <tr key={b.id}>
                            <td style={{ textAlign: 'center', fontWeight: 700, color: '#64748b', fontSize: '12px' }}>
                              #{b.id}
                            </td>

                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div
                                  onClick={() => { setSelectedBook(b); setDetailModalOpen(true); }}
                                  style={{
                                    width: '40px',
                                    height: '56px',
                                    borderRadius: '6px',
                                    overflow: 'hidden',
                                    background: '#f1f5f9',
                                    border: '1px solid #e2e8f0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    cursor: 'pointer'
                                  }}
                                  title="Bấm để xem chi tiết"
                                >
                                  {b.imageUrl ? (
                                    <img src={b.imageUrl} alt={b.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                                  ) : (
                                    <BookOpen size={18} color="#94a3b8" />
                                  )}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    onClick={() => { setSelectedBook(b); setDetailModalOpen(true); }}
                                    style={{ fontWeight: 700, color: '#0f172a', fontSize: '13.5px', cursor: 'pointer', lineHeight: 1.35 }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = '#2563eb'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = '#0f172a'; }}
                                    title="Xem chi tiết sách"
                                  >
                                    {b.title}
                                  </div>
                                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                                    Số lượng dự kiến: <strong>{b.expectedQuantity || b.quantity || 20} cuốn</strong>
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td style={{ color: '#475569', fontSize: '13px' }}>
                              {b.author || 'Chưa rõ'}
                            </td>

                            <td>
                              <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', background: '#f1f5f9', color: '#334155', fontSize: '11.5px', fontWeight: 600 }}>
                                {b.category || 'Manga'}
                              </span>
                            </td>

                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', fontWeight: 600, color: '#2563eb' }}>
                                <Calendar size={14} />
                                <span>{relDate}</span>
                              </div>
                            </td>

                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => setViewingQueueBook(b)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '20px',
                                  border: preCount > 0 ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                                  background: preCount > 0 ? '#eff6ff' : '#f8fafc',
                                  color: preCount > 0 ? '#1d4ed8' : '#64748b',
                                  fontWeight: 700,
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  transition: 'all 0.15s ease'
                                }}
                                title="Bấm để xem danh sách độc giả đặt trước"
                              >
                                <Clock size={12} />
                                <span>{preCount} bạn đọc</span>
                              </button>
                            </td>

                            <td style={{ textAlign: 'center' }}>
                              <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '6px', background: '#dbeafe', color: '#1e40af', fontSize: '11.5px', fontWeight: 700 }}>
                                Sắp phát hành
                              </span>
                            </td>

                            {/* Cột 8: Thao tác (Căn giữa, kích thước đều nhau 95px x 32px, cách đều 8px theo dạng lưới 2x2) */}
                            <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '12px 8px', whiteSpace: 'nowrap', minWidth: '210px' }}>
                              <div style={{
                                display: 'inline-grid',
                                gridTemplateColumns: 'repeat(2, 95px)',
                                gap: '8px',
                                justifyContent: 'center',
                                alignItems: 'center'
                              }}>
                                {/* Hàng 1, Cột 1: Nhập kho (như Cho mượn) */}
                                <button
                                  type="button"
                                  onClick={() => { setReceiveStockBook(b); setReceiveStockQty(b.expectedQuantity || 20); }}
                                  className="btn-action-cell btn-action-receive"
                                  title="Sách đã về thư viện? Bấm để nhập kho chính thức"
                                >
                                  <PackageCheck size={14} /> Nhập kho
                                </button>

                                {/* Hàng 1, Cột 2: Sửa */}
                                <button
                                  type="button"
                                  onClick={() => { setEditingUpcomingBook(b); setUpcomingBookModalOpen(true); }}
                                  className="btn-action-cell btn-action-edit"
                                  title="Chỉnh sửa thông tin sách đặt trước"
                                >
                                  <Edit2 size={14} /> Sửa
                                </button>

                                {/* Hàng 2, Cột 1: Chi tiết (như Mã QR) */}
                                <button
                                  type="button"
                                  onClick={() => { setSelectedBook(b); setDetailModalOpen(true); }}
                                  className="btn-action-cell btn-action-detail"
                                  title="Xem chi tiết sách đặt trước"
                                >
                                  <Eye size={14} /> Chi tiết
                                </button>

                                {/* Hàng 2, Cột 2: Xóa */}
                                <button
                                  type="button"
                                  onClick={() => { setUpcomingBookToDelete(b); setDeleteUpcomingBookError(''); }}
                                  className="btn-action-cell btn-action-delete"
                                  title="Xóa sách đặt trước"
                                >
                                  <Trash2 size={14} /> Xóa
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* GRID VIEW */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
                {filteredUpcoming.map(b => {
                  const preCount = getBookPreOrderCount(b.id);
                  const relDate = b.releaseDate || (b.desc && b.desc.includes('Dự kiến phát hành:') ? b.desc.split('Dự kiến phát hành:')[1].trim().split('.')[0].trim() : '10-2026');

                  return (
                    <div
                      key={b.id}
                      style={{
                        background: '#ffffff',
                        borderRadius: '14px',
                        border: '1px solid #e2e8f0',
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div>
                        {/* Cover Image */}
                        <div
                          onClick={() => { setSelectedBook(b); setDetailModalOpen(true); }}
                          style={{
                            height: '160px',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            background: '#f8fafc',
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          {b.imageUrl ? (
                            <img src={b.imageUrl} alt={b.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; }} />
                          ) : (
                            <BookOpen size={36} color="#cbd5e1" />
                          )}
                          <div style={{ position: 'absolute', top: '8px', right: '8px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(37, 99, 235, 0.9)', color: '#ffffff', fontSize: '10.5px', fontWeight: 700 }}>
                            Sắp phát hành
                          </div>
                        </div>

                        {/* Title & Author */}
                        <h4
                          onClick={() => { setSelectedBook(b); setDetailModalOpen(true); }}
                          style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0', lineHeight: 1.35, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                          title={b.title}
                        >
                          {b.title}
                        </h4>
                        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {b.author || 'Chưa rõ tác giả'}
                        </p>

                        {/* Meta Pills */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', marginBottom: '12px' }}>
                          <span style={{ color: '#2563eb', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Calendar size={13} /> {relDate}
                          </span>
                          <button
                            type="button"
                            onClick={() => setViewingQueueBook(b)}
                            style={{ border: 'none', background: '#eff6ff', color: '#1d4ed8', padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            {preCount} bạn đọc chờ
                          </button>
                        </div>
                      </div>

                      {/* Card Action Buttons */}
                      <div style={{ display: 'flex', gap: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                        <button
                          type="button"
                          onClick={() => { setEditingUpcomingBook(b); setUpcomingBookModalOpen(true); }}
                          className="btn btn-outline"
                          style={{ flex: 1, padding: '6px', fontSize: '11.5px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        >
                          <Edit2 size={12} /> Sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => { setUpcomingBookToDelete(b); setDeleteUpcomingBookError(''); }}
                          className="btn btn-outline"
                          style={{ padding: '6px 8px', fontSize: '11.5px', color: '#ef4444', borderColor: '#fecaca' }}
                          title="Xóa"
                        >
                          <Trash2 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setReceiveStockBook(b); setReceiveStockQty(b.expectedQuantity || 20); }}
                          style={{
                            flex: 1.2,
                            padding: '6px',
                            background: '#16a34a',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '3px'
                          }}
                        >
                          <PackageCheck size={12} /> Nhập kho
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>

            {/* Modal 1: Top 5 Cuốn Sách Dự Kiến Về Sớm Nhất */}
            {earliestBooksModalOpen && typeof document !== 'undefined' && createPortal(
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  width: '100vw',
                  height: '100vh',
                  background: 'rgba(15, 23, 42, 0.65)',
                  backdropFilter: 'blur(5px)',
                  zIndex: 999999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '20px',
                  boxSizing: 'border-box'
                }}
                onClick={() => setEarliestBooksModalOpen(false)}
              >
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '18px',
                    maxWidth: '740px',
                    width: '100%',
                    maxHeight: '88vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                    overflow: 'hidden',
                    margin: 'auto'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#d97706', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(217, 119, 6, 0.3)' }}>
                        <Calendar size={22} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                          Dự Kiến 5 Cuốn Sách Về Sớm Nhất
                        </h3>
                        <span style={{ fontSize: '12.5px', color: '#78350f', fontWeight: 500 }}>
                          Lọc từ {upcomingBooksList.length} đầu sách sắp về, sắp xếp theo thời gian dự kiến phát hành sớm nhất
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEarliestBooksModalOpen(false)}
                      style={{ border: 'none', background: 'rgba(255,255,255,0.85)', color: '#64748b', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Body List */}
                  <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {earliestUpcomingBooks.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                        <Calendar size={40} style={{ margin: '0 auto 8px', color: '#cbd5e1' }} />
                        <p style={{ margin: 0, fontSize: '14px' }}>Chưa có dữ liệu sách sắp về.</p>
                      </div>
                    ) : (
                      earliestUpcomingBooks.map((b, idx) => {
                        const preCount = getBookPreOrderCount(b.id);
                        const relDate = formatReleaseDate(b);
                        const bDate = parseReleaseDate(b);
                        const diffDays = Math.ceil((bDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        const diffBadge = diffDays <= 0 ? 'Dự kiến trong tháng này' : (diffDays <= 30 ? `Khoảng ${diffDays} ngày nữa` : `Khoảng ${Math.round(diffDays / 30)} tháng nữa`);

                        return (
                          <div
                            key={b.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '16px',
                              padding: '14px 18px',
                              borderRadius: '12px',
                              border: idx === 0 ? '1.5px solid #fcd34d' : '1px solid #e2e8f0',
                              background: idx === 0 ? '#fffdf5' : '#ffffff',
                              boxShadow: idx === 0 ? '0 4px 14px rgba(217, 119, 6, 0.08)' : 'none',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {/* Rank Pill */}
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: idx === 0 ? '#d97706' : (idx === 1 ? '#0284c7' : (idx === 2 ? '#16a34a' : '#64748b')),
                              color: '#ffffff',
                              fontWeight: 800,
                              fontSize: '13px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              #{idx + 1}
                            </div>

                            {/* Book Cover */}
                            <div
                              onClick={() => { setSelectedBook(b); setDetailModalOpen(true); }}
                              style={{
                                width: '48px',
                                height: '68px',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                background: '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                cursor: 'pointer'
                              }}
                            >
                              {b.imageUrl ? (
                                <img src={b.imageUrl} alt={b.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                              ) : (
                                <BookOpen size={20} color="#94a3b8" />
                              )}
                            </div>

                            {/* Book Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                                <h4
                                  onClick={() => { setSelectedBook(b); setDetailModalOpen(true); }}
                                  style={{ fontSize: '14.5px', fontWeight: 700, color: '#0f172a', margin: 0, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '360px' }}
                                  title={b.title}
                                >
                                  {b.title}
                                </h4>
                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                                  {b.category || 'Manga'}
                                </span>
                              </div>

                              <div style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '5px' }}>
                                Tác giả: <strong style={{ color: '#334155' }}>{b.author || 'Chưa rõ'}</strong>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '12px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#d97706', fontWeight: 700, background: '#fef3c7', padding: '2px 8px', borderRadius: '6px' }}>
                                  <Calendar size={13} /> {relDate}
                                </span>
                                <span style={{ color: '#64748b', fontSize: '11.5px' }}>
                                  • {diffBadge}
                                </span>
                                <span style={{ color: '#2563eb', fontWeight: 600, fontSize: '11.5px' }}>
                                  • {preCount} độc giả chờ
                                </span>
                              </div>
                            </div>

                            {/* Quick Action Button */}
                            <button
                              type="button"
                              onClick={() => { setSelectedBook(b); setDetailModalOpen(true); }}
                              className="btn btn-outline"
                              style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 600, flexShrink: 0, borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}
                            >
                              <Eye size={13} /> Xem sách
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc' }}>
                    <button
                      type="button"
                      onClick={() => setEarliestBooksModalOpen(false)}
                      className="btn btn-secondary"
                      style={{ fontSize: '13px', padding: '8px 22px', borderRadius: '8px' }}
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {/* Modal 2: Độc Giả Đặt Trước Theo Tài Khoản */}
            {preOrderReadersModalOpen && typeof document !== 'undefined' && createPortal(
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  width: '100vw',
                  height: '100vh',
                  background: 'rgba(15, 23, 42, 0.65)',
                  backdropFilter: 'blur(5px)',
                  zIndex: 999999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '20px',
                  boxSizing: 'border-box'
                }}
                onClick={() => setPreOrderReadersModalOpen(false)}
              >
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '18px',
                    maxWidth: '780px',
                    width: '100%',
                    maxHeight: '88vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                    overflow: 'hidden',
                    margin: 'auto'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#16a34a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(22, 163, 74, 0.3)' }}>
                        <Users size={22} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                          Danh Sách Độc Giả Đặt Trước Theo Tài Khoản
                        </h3>
                        <span style={{ fontSize: '12.5px', color: '#166534', fontWeight: 500 }}>
                          Ghi nhận {totalUniquePreOrderReaders} tài khoản độc giả (1 độc giả đặt nhiều cuốn chỉ tính 1 tài khoản)
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreOrderReadersModalOpen(false)}
                      style={{ border: 'none', background: 'rgba(255,255,255,0.85)', color: '#64748b', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Body */}
                  <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
                    {preOrderReadersList.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
                        <Users size={46} style={{ margin: '0 auto 12px', color: '#cbd5e1' }} />
                        <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#475569', margin: '0 0 6px 0' }}>Chưa có độc giả đặt trước</h4>
                        <p style={{ fontSize: '13px', margin: 0 }}>Hiện chưa có tài khoản nào đăng ký đặt trước các đầu sách sắp về.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        {preOrderReadersList.map((entry, idx) => (
                          <div
                            key={entry.reader.id || idx}
                            style={{
                              border: '1px solid #e2e8f0',
                              borderRadius: '14px',
                              background: '#ffffff',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                              overflow: 'hidden'
                            }}
                          >
                            {/* Reader Account Header Banner */}
                            <div style={{ padding: '14px 18px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#e0e7ff', color: '#4338ca', fontWeight: 800, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {(entry.reader.fullName || 'DG').substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a' }}>{entry.reader.fullName}</span>
                                    <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', color: '#334155' }}>
                                      {entry.reader.username}
                                    </code>
                                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#2563eb' }}>
                                      [{getReaderCode(entry.reader.id)}]
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                    SĐT: {entry.reader.phone || 'Chưa cập nhật'} • Email: {entry.reader.email || 'Chưa cập nhật'}
                                  </div>
                                </div>
                              </div>

                              <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
                                {entry.books.length} đầu sách đặt trước
                              </span>
                            </div>

                            {/* Books Ordered By This Reader */}
                            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {entry.books.map((b) => {
                                const res = entry.reservations.find(r => Number(r.bookId || r.book_id) === Number(b.id));
                                const relDate = formatReleaseDate(b);

                                return (
                                  <div
                                    key={b.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '10px 14px',
                                      borderRadius: '10px',
                                      border: '1px solid #f1f5f9',
                                      background: '#fbfcfd',
                                      gap: '12px'
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                      <div
                                        onClick={() => { setSelectedBook(b); setDetailModalOpen(true); }}
                                        style={{ width: '38px', height: '52px', borderRadius: '6px', overflow: 'hidden', background: '#f1f5f9', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}
                                      >
                                        {b.imageUrl ? (
                                          <img src={b.imageUrl} alt={b.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                                        ) : (
                                          <BookOpen size={16} color="#94a3b8" />
                                        )}
                                      </div>
                                      <div style={{ minWidth: 0, flex: 1 }}>
                                        <h5
                                          onClick={() => { setSelectedBook(b); setDetailModalOpen(true); }}
                                          style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', margin: '0 0 3px 0', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                          title={b.title}
                                        >
                                          {b.title}
                                        </h5>
                                        <div style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                          <span>Thể loại: <strong>{b.category || 'Manga'}</strong></span>
                                          <span>• Dự kiến về: <strong style={{ color: '#d97706' }}>{relDate}</strong></span>
                                          {res?.reservedAt && (
                                            <span>• Đặt ngày: {res.reservedAt.substring(0, 10)}</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                      <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, background: '#eff6ff', color: '#2563eb' }}>
                                        {res?.status === 'Waiting' ? 'Đang chờ' : (res?.status || 'Chờ sách về')}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => { setSelectedBook(b); setDetailModalOpen(true); }}
                                        className="btn btn-outline"
                                        style={{ padding: '5px 10px', fontSize: '11.5px' }}
                                      >
                                        Chi tiết
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc' }}>
                    <button
                      type="button"
                      onClick={() => setPreOrderReadersModalOpen(false)}
                      className="btn btn-secondary"
                      style={{ fontSize: '13px', padding: '8px 22px', borderRadius: '8px' }}
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {/* Modal 3: Top 5 Tác Phẩm AI Gợi Ý Được Mong Đợi Nhất */}
            {topRatedModalOpen && typeof document !== 'undefined' && createPortal(
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  width: '100vw',
                  height: '100vh',
                  background: 'rgba(15, 23, 42, 0.65)',
                  backdropFilter: 'blur(5px)',
                  zIndex: 999999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '20px',
                  boxSizing: 'border-box'
                }}
                onClick={() => setTopRatedModalOpen(false)}
              >
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '18px',
                    maxWidth: '760px',
                    width: '100%',
                    maxHeight: '88vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                    overflow: 'hidden',
                    margin: 'auto'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#9333ea', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(147, 51, 234, 0.3)' }}>
                        <Sparkles size={22} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                          Top 5 Tác Phẩm AI Gợi Ý Được Mong Đợi Nhất
                        </h3>
                        <span style={{ fontSize: '12.5px', color: '#6b21a8', fontWeight: 500 }}>
                          Hệ thống AI phân tích đánh giá số sao, điểm phê bình và mức độ đón nhận của độc giả
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTopRatedModalOpen(false)}
                      style={{ border: 'none', background: 'rgba(255,255,255,0.85)', color: '#64748b', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Body */}
                  <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {topRatedUpcomingBooks.map((b, idx) => {
                      const preCount = getBookPreOrderCount(b.id);
                      const relDate = formatReleaseDate(b);
                      const aiNotes = [
                        'Đạt số sao đánh giá xuất sắc nhất danh mục. Tác phẩm sở hữu lượng thảo luận cao kỷ lục và là tâm điểm đón chờ hàng đầu của độc giả thư viện.',
                        'Cốt truyện được giới phê bình khen ngợi nồng nhiệt, phong cách xây dựng nhân vật độc đáo với tỷ lệ yêu thích áp đảo.',
                        'Tuyệt phẩm nhận được lượng bạn đọc đặt trước tăng trưởng ấn tượng, nhịp truyện hấp dẫn và nghệ thuật minh họa mãn nhãn.',
                        'Đầu sách trinh thám & bí ẩn có lượng fan trung thành đông đảo, nội dung lôi cuốn với điểm số bình chọn cao liên tục qua các tập.',
                        'Tác phẩm giàu cảm xúc với phong cách du ký huyền ảo, được hệ thống AI đánh giá là đầu sách tiềm năng nhất năm.'
                      ];

                      return (
                        <div
                          key={b.id}
                          style={{
                            display: 'flex',
                            gap: '16px',
                            padding: '16px',
                            borderRadius: '14px',
                            border: idx === 0 ? '1.5px solid #d8b4fe' : '1px solid #e2e8f0',
                            background: idx === 0 ? '#fdfaff' : '#ffffff',
                            boxShadow: idx === 0 ? '0 4px 16px rgba(147, 51, 234, 0.08)' : 'none',
                            alignItems: 'flex-start'
                          }}
                        >
                          {/* Rank Badge */}
                          <div style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '10px',
                            background: idx === 0 ? 'linear-gradient(135deg, #9333ea, #7e22ce)' : '#f1f5f9',
                            color: idx === 0 ? '#ffffff' : '#64748b',
                            fontWeight: 800,
                            fontSize: '13.5px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            #{idx + 1}
                          </div>

                          {/* Cover Image */}
                          <div
                            onClick={() => { setSelectedBook(b); setDetailModalOpen(true); }}
                            style={{
                              width: '58px',
                              height: '82px',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              cursor: 'pointer'
                            }}
                          >
                            {b.imageUrl ? (
                              <img src={b.imageUrl} alt={b.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                            ) : (
                              <BookOpen size={22} color="#94a3b8" />
                            )}
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                              <div>
                                <h4
                                  onClick={() => { setSelectedBook(b); setDetailModalOpen(true); }}
                                  style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0, cursor: 'pointer' }}
                                >
                                  {b.title}
                                </h4>
                                <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>
                                  Tác giả: <strong style={{ color: '#334155' }}>{b.author || 'Chưa rõ'}</strong> • Thể loại: <span style={{ color: '#9333ea', fontWeight: 600 }}>{b.category}</span>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 800 }}>
                                  <Star size={13} fill="#f59e0b" color="#f59e0b" /> {b.parsedRating?.toFixed(1) || '9.6'} / 10
                                </span>
                                <span style={{ background: '#f3e8ff', color: '#7e22ce', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                                  {idx === 0 ? 'AI Khuyên Đọc #1' : (idx === 1 ? 'AI Đề Cử #2' : `Top #${idx + 1}`)}
                                </span>
                              </div>
                            </div>

                            {/* AI Commentary */}
                            <div style={{ background: '#f8fafc', borderLeft: '3px solid #9333ea', borderRadius: '4px', padding: '8px 10px', fontSize: '12px', color: '#475569', lineHeight: 1.45, margin: '8px 0' }}>
                              <span style={{ fontWeight: 700, color: '#7e22ce' }}>Đánh giá AI: </span>
                              {aiNotes[idx] || 'Tác phẩm được độc giả mong đợi và đánh giá cao trên toàn hệ thống.'}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                              <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '12px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <Calendar size={13} color="#d97706" /> Dự kiến: <strong style={{ color: '#d97706' }}>{relDate}</strong>
                                </span>
                                <span style={{ color: '#16a34a', fontWeight: 600 }}>
                                  • {preCount} độc giả đăng ký chờ
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => { setSelectedBook(b); setDetailModalOpen(true); }}
                                className="btn btn-outline"
                                style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                <Eye size={13} /> Chi tiết
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc' }}>
                    <button
                      type="button"
                      onClick={() => setTopRatedModalOpen(false)}
                      className="btn btn-secondary"
                      style={{ fontSize: '13px', padding: '8px 22px', borderRadius: '8px' }}
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}
          </div>
        );
      })()}

      {/* TAB 3: QUẢN LÝ ĐỘC GIẢ */}
      {activeTab === 'readers' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>Quản lý Danh sách Độc Giả</h2>
              <p style={{ color: '#64748b', fontSize: '13.5px', marginTop: '2px' }}>
                Tổng số {readers.length} độc giả đã đăng ký hồ sơ mượn sách
              </p>
            </div>
            <button
              onClick={() => { setEditingReader(null); setReaderModalOpen(true); }}
              className="btn btn-primary"
            >
              <Plus size={16} />
              <span>Thêm độc giả mới</span>
            </button>
          </div>

          <div id="readers-table" className="card" style={{ scrollMarginTop: '24px' }}>
            <div className="card-header">
              <span>Danh sách Độc giả ({filteredReaders.length})</span>
              <div style={{ position: 'relative', width: '260px' }}>
                <input
                  type="text"
                  placeholder="Tìm theo mã độc giả (DG-001), tên, SĐT..."
                  value={readerSearch}
                  onChange={(e) => setReaderSearch(e.target.value)}
                  style={{ paddingLeft: '32px', height: '34px', fontSize: '13px' }}
                />
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
              </div>
            </div>

            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th style={{ whiteSpace: 'nowrap' }}>Mã Độc Giả</th>
                    <th style={{ whiteSpace: 'nowrap' }}>Họ và Tên</th>
                    <th style={{ whiteSpace: 'nowrap' }}>Tên Đăng Nhập</th>
                    <th style={{ whiteSpace: 'nowrap' }}>Số Điện Thoại</th>
                    <th style={{ whiteSpace: 'nowrap' }}>Email</th>
                    <th style={{ minWidth: '160px' }}>Địa Chỉ</th>
                    <th style={{ whiteSpace: 'nowrap' }}>Trạng Thái / Khóa</th>
                    <th style={{ textAlign: 'right', minWidth: '120px', whiteSpace: 'nowrap' }}>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReaders.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                        Không tìm thấy độc giả nào.
                      </td>
                    </tr>
                  ) : (
                    filteredReaders.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 700, color: '#2563eb', whiteSpace: 'nowrap' }}>{getReaderCode(r.id)}</td>
                        <td style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>{r.fullName}</td>
                        <td style={{ whiteSpace: 'nowrap' }}><code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{r.username}</code></td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.phone || '-'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.email || '-'}</td>
                        <td style={{ minWidth: '160px' }}>{r.address || '-'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {r.isLocked ? (
                            <div>
                              <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                                <Lock size={12} /> Bị khóa
                              </span>
                              {r.lockReason && (
                                <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '2px', maxWidth: '200px', lineHeight: 1.3 }}>
                                  {r.lockReason}
                                </div>
                              )}
                              {r.unpaidFines > 0 && (
                                <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: 600, marginTop: '2px', whiteSpace: 'nowrap' }}>
                                  Nợ phạt: {Number(r.unpaidFines).toLocaleString('vi-VN')} đ
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                                <Check size={12} /> Hoạt động
                              </span>
                              {r.unpaidFines > 0 && (
                                <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600, marginTop: '2px', whiteSpace: 'nowrap' }}>
                                  Nợ phạt: {Number(r.unpaidFines).toLocaleString('vi-VN')} đ
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: '120px' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => handleToggleReaderLock(r)}
                              className="btn btn-outline"
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                color: r.isLocked ? '#16a34a' : '#ef4444',
                                borderColor: r.isLocked ? '#86efac' : '#fca5a5',
                                background: r.isLocked ? '#f0fdf4' : '#fef2f2'
                              }}
                              title={r.isLocked ? "Mở khóa tài khoản độc giả" : "Khóa tài khoản độc giả này"}
                            >
                              {r.isLocked ? <Unlock size={14} /> : <Lock size={14} />}
                            </button>
                            <button
                              onClick={() => { setEditingReader(r); setReaderModalOpen(true); }}
                              className="btn btn-outline"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                              title="Chỉnh sửa thông tin"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => { setReaderToDelete(r); setDeleteReaderError(''); }}
                              className="btn btn-outline"
                              style={{ padding: '4px 8px', fontSize: '12px', color: '#ef4444' }}
                              title="Xóa độc giả"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}


      {/* ================= TAB 4: CÀI ĐẶT HỆ THỐNG (SETTINGS) ================= */}
      {activeTab === 'settings' && !isLibrarian && (
        <div>
          {/* Sticky Header Nav Bar */}
          <div
            style={{
              position: 'sticky',
              top: '12px',
              zIndex: 100,
              background: '#ffffff',
              borderRadius: '16px',
              padding: '16px 24px',
              border: '1px solid #e2e8f0',
              marginBottom: '20px',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '16px',
              boxShadow: '0 8px 24px -4px rgba(15, 23, 42, 0.12), 0 2px 6px rgba(15, 23, 42, 0.04)'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 10px rgba(37,99,235,0.25)'
                  }}
                >
                  <SlidersHorizontal size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Cài đặt & Cấu hình Hệ thống
                  </h2>
                  <p style={{ fontSize: '12.5px', color: '#64748b', margin: '2px 0 0 0' }}>
                    Tùy chỉnh thông số mượn trả, mức phí phạt, cổng thanh toán VNPay và thông tin thư viện
                  </p>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleResetSettingsDefault}
                className="btn btn-outline"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 15px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#64748b'
                }}
              >
                <RotateCcw size={15} />
                <span>Khôi phục mặc định</span>
              </button>

              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={settingsSaving}
                className="btn btn-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 20px',
                  borderRadius: '10px',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
                  cursor: settingsSaving ? 'wait' : 'pointer'
                }}
              >
                <Save size={16} />
                <span>{settingsSaving ? 'Đang lưu...' : 'Lưu tất cả thay đổi'}</span>
              </button>
            </div>
          </div>

          {/* Form Content: 2 Columns Grid */}
          <form onSubmit={handleSaveSettings}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
                gap: '20px',
                marginBottom: '24px'
              }}
            >
              {/* 1. QUY ĐỊNH MƯỢN SÁCH */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #eef2f6',
                  padding: '22px 24px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ background: '#eff6ff', color: '#2563eb', padding: '6px', borderRadius: '8px' }}>
                    <BookOpen size={18} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      Quy định Mượn sách
                    </h3>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                      Thời hạn và số lượng sách tối đa được mượn
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      Thời gian mượn về nhà (ngày)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={systemSettings.borrowHomeDays || 14}
                      onChange={(e) => setSystemSettings({ ...systemSettings, borrowHomeDays: parseInt(e.target.value) || 14 })}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13.5px',
                        fontWeight: 600,
                        color: '#0f172a',
                        boxSizing: 'border-box'
                      }}
                    />
                    <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', display: 'block' }}>
                      Mặc định: 14 ngày. Hạn trả sách sẽ tự động cộng thêm số ngày này khi mượn về nhà.
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      Thời gian mượn tại thư viện (ngày)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={systemSettings.borrowLibraryDays || 7}
                      onChange={(e) => setSystemSettings({ ...systemSettings, borrowLibraryDays: parseInt(e.target.value) || 7 })}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13.5px',
                        fontWeight: 600,
                        color: '#0f172a',
                        boxSizing: 'border-box'
                      }}
                    />
                    <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', display: 'block' }}>
                      Mặc định: 7 ngày hoặc trả trong ngày (nếu đặt 1 ngày).
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        Số sách tối đa / lượt mượn
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={systemSettings.maxBorrowBooks || 3}
                        onChange={(e) => setSystemSettings({ ...systemSettings, maxBorrowBooks: parseInt(e.target.value) || 3 })}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: '#0f172a',
                          boxSizing: 'border-box'
                        }}
                      />
                      <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', display: 'block' }}>
                        Giới hạn sách đang mượn
                      </span>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        Số sách đặt trước tối đa
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={systemSettings.maxReservations || 3}
                        onChange={(e) => setSystemSettings({ ...systemSettings, maxReservations: parseInt(e.target.value) || 3 })}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: '#0f172a',
                          boxSizing: 'border-box'
                        }}
                      />
                      <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', display: 'block' }}>
                        Tối đa trong hàng chờ FIFO
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. QUY ĐỊNH TIỀN PHẠT & KHÓA TÀI KHOẢN */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #eef2f6',
                  padding: '22px 24px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ background: '#fef2f2', color: '#dc2626', padding: '6px', borderRadius: '8px' }}>
                    <DollarSign size={18} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      Quy định Phạt & Khóa Tài khoản
                    </h3>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                      Bảng giá phạt trễ hạn và điều kiện tự động khóa
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      Tiền phạt mỗi ngày quá hạn (VNĐ / ngày)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        min="0"
                        step="500"
                        value={systemSettings.finePerDay || 2000}
                        onChange={(e) => setSystemSettings({ ...systemSettings, finePerDay: parseInt(e.target.value) || 0 })}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13.5px',
                          fontWeight: 700,
                          color: '#dc2626',
                          boxSizing: 'border-box'
                        }}
                      />
                      <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                        đ / ngày
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', display: 'block' }}>
                      Mặc định: 2.000 đ/ngày. Tiền phạt = (Số ngày quá hạn - Ân hạn) × Mức phạt.
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        Ngày ân hạn (Grace period)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="7"
                        value={systemSettings.gracePeriodDays || 0}
                        onChange={(e) => setSystemSettings({ ...systemSettings, gracePeriodDays: parseInt(e.target.value) || 0 })}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: '#0f172a',
                          boxSizing: 'border-box'
                        }}
                      />
                      <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', display: 'block' }}>
                        Số ngày trễ chưa bị tính tiền
                      </span>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        Khóa tài khoản sau (ngày)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={systemSettings.autoLockAfterDays || 3}
                        onChange={(e) => setSystemSettings({ ...systemSettings, autoLockAfterDays: parseInt(e.target.value) || 3 })}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: '#0f172a',
                          boxSizing: 'border-box'
                        }}
                      />
                      <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', display: 'block' }}>
                        Mặc định: 3 ngày quá hạn
                      </span>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      Tiền phạt làm mất hoặc hỏng sách (VNĐ)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        min="0"
                        step="10000"
                        value={systemSettings.lostBookFine || 200000}
                        onChange={(e) => setSystemSettings({ ...systemSettings, lostBookFine: parseInt(e.target.value) || 0 })}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: '#0f172a',
                          boxSizing: 'border-box'
                        }}
                      />
                      <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                        VNĐ
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', display: 'block' }}>
                      Khoản thu cố định áp dụng khi độc giả làm mất tài liệu
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. CỔNG THANH TOÁN VNPAY & VIETQR */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #eef2f6',
                  padding: '22px 24px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '6px', borderRadius: '8px' }}>
                    <CreditCard size={18} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      Cổng Thanh toán VNPay & VietQR
                    </h3>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                      Cấu hình tài khoản ngân hàng thụ hưởng và mã QR
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        Số tài khoản nhận tiền
                      </label>
                      <input
                        type="text"
                        value={systemSettings.vnpayAccountNumber || ''}
                        onChange={(e) => setSystemSettings({ ...systemSettings, vnpayAccountNumber: e.target.value })}
                        placeholder="0987654321"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13.5px',
                          fontWeight: 700,
                          color: '#005baa',
                          letterSpacing: '0.5px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        Mã BIN ngân hàng (VietQR)
                      </label>
                      <input
                        type="text"
                        value={systemSettings.vnpayBankBin || ''}
                        onChange={(e) => setSystemSettings({ ...systemSettings, vnpayBankBin: e.target.value })}
                        placeholder="970422 (MBBank)"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: '#0f172a',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      Tên ngân hàng thụ hưởng
                    </label>
                    <input
                      type="text"
                      value={systemSettings.vnpayBankName || ''}
                      onChange={(e) => setSystemSettings({ ...systemSettings, vnpayBankName: e.target.value })}
                      placeholder="Ngân hàng TMCP Quân Đội (MBBank)"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#0f172a',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        Tên chủ tài khoản (in hoa)
                      </label>
                      <input
                        type="text"
                        value={systemSettings.vnpayAccountName || ''}
                        onChange={(e) => setSystemSettings({ ...systemSettings, vnpayAccountName: e.target.value.toUpperCase() })}
                        placeholder="THU VIEN SMARTLIB"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13px',
                          fontWeight: 700,
                          color: '#0f172a',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        Thời gian hết hạn phiên (phút)
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="60"
                        value={systemSettings.vnpayTimeoutMinutes || 15}
                        onChange={(e) => setSystemSettings({ ...systemSettings, vnpayTimeoutMinutes: parseInt(e.target.value) || 15 })}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: '#0f172a',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        Mã TMN Code VNPay Sandbox
                      </label>
                      <input
                        type="text"
                        value={systemSettings.vnpayTmnCode || ''}
                        onChange={(e) => setSystemSettings({ ...systemSettings, vnpayTmnCode: e.target.value })}
                        placeholder="VD: DEMOSMARTLIB"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13px',
                          fontFamily: 'monospace',
                          color: '#0f172a',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        Hash Secret Key VNPay
                      </label>
                      <input
                        type="password"
                        value={systemSettings.vnpayHashSecret || ''}
                        onChange={(e) => setSystemSettings({ ...systemSettings, vnpayHashSecret: e.target.value })}
                        placeholder="Khóa bí mật checksum"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13px',
                          fontFamily: 'monospace',
                          color: '#0f172a',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px dashed #cbd5e1',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      fontSize: '11.5px',
                      color: '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <ShieldCheck size={16} color="#16a34a" style={{ flexShrink: 0 }} />
                    <span>
                      Khi độc giả thanh toán qua VietQR/VNPay, số tài khoản và ngân hàng ở đây sẽ tự động hiển thị trong Modal thanh toán.
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. THÔNG TIN THƯ VIỆN */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #eef2f6',
                  padding: '22px 24px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ background: '#faf5ff', color: '#9333ea', padding: '6px', borderRadius: '8px' }}>
                    <Building2 size={18} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      Thông tin Đơn vị Thư viện
                    </h3>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                      Địa chỉ, liên hệ và thời gian phục vụ bạn đọc
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      Tên thư viện
                    </label>
                    <input
                      type="text"
                      value={systemSettings.libraryName || ''}
                      onChange={(e) => setSystemSettings({ ...systemSettings, libraryName: e.target.value })}
                      placeholder="SmartLib - Thư viện Thông minh"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13.5px',
                        fontWeight: 700,
                        color: '#0f172a',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      Địa chỉ thư viện
                    </label>
                    <input
                      type="text"
                      value={systemSettings.libraryAddress || ''}
                      onChange={(e) => setSystemSettings({ ...systemSettings, libraryAddress: e.target.value })}
                      placeholder="Hà Nội, Việt Nam"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        color: '#0f172a',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        Số điện thoại hỗ trợ
                      </label>
                      <input
                        type="text"
                        value={systemSettings.libraryPhone || ''}
                        onChange={(e) => setSystemSettings({ ...systemSettings, libraryPhone: e.target.value })}
                        placeholder="0987 654 321"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13px',
                          color: '#0f172a',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        Email liên hệ
                      </label>
                      <input
                        type="email"
                        value={systemSettings.libraryEmail || ''}
                        onChange={(e) => setSystemSettings({ ...systemSettings, libraryEmail: e.target.value })}
                        placeholder="support@smartlib.edu.vn"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13px',
                          color: '#0f172a',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      Khung giờ mở cửa phục vụ
                    </label>
                    <input
                      type="text"
                      value={systemSettings.libraryHours || ''}
                      onChange={(e) => setSystemSettings({ ...systemSettings, libraryHours: e.target.value })}
                      placeholder="07:30 - 17:30 (Thứ 2 - Thứ 7)"
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        color: '#0f172a',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

          </form>
        </div>
      )}


      {/* Modals */}
      <BookDetailModal
        book={selectedBook}
        isOpen={detailModalOpen}
        onClose={() => { setDetailModalOpen(false); setSelectedBook(null); }}
        onBorrow={(b) => { setBorrowTargetBook(b); setBorrowModalOpen(true); }}
        onEdit={(b) => { setEditingBook(b); setBookModalOpen(true); }}
        onDelete={(b) => setBookToDelete(b)}
        isAdmin={true}
      />

      <AddEditBookModal
        book={editingBook}
        isOpen={bookModalOpen}
        onClose={() => { setBookModalOpen(false); setEditingBook(null); }}
        onSave={handleSaveBook}
      />

      {/* Modal AI Tự Động Biên Mục Sách */}
      {aiUploadOpen && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box'
          }}
          onClick={() => setAiUploadOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '850px' }}>
            <BookAIUpload
              onBookCreated={(newBook) => {
                setAiUploadOpen(false);
                loadData();
                showToast(`✓ Đã biên mục và lưu thành công sách "${newBook?.title || 'mới'}" vào CSDL!`);
              }}
              onCancel={() => setAiUploadOpen(false)}
            />
          </div>
        </div>,
        document.body
      )}

      <AddEditReaderModal
        reader={editingReader}
        isOpen={readerModalOpen}
        onClose={() => { setReaderModalOpen(false); setEditingReader(null); }}
        onSave={handleSaveReader}
      />

      <BorrowModal
        book={borrowTargetBook}
        readers={readers}
        isOpen={borrowModalOpen}
        onClose={() => { setBorrowModalOpen(false); setBorrowTargetBook(null); }}
        onConfirm={handleCreateBorrowConfirm}
        isAdmin={true}
      />

      <ExportReportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
      />

      {/* DIV Modal xác nhận Trả sách cho Admin (Không dùng thông báo trình duyệt) */}
      {adminReturnRecord && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => !isReturning && setAdminReturnRecord(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '26px 28px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              textAlign: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: '#e0f2fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}
            >
              <CheckCircle size={28} color="#0284c7" />
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 10px 0' }}>
              Xác nhận trả sách về kho
            </h3>
            <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: 1.6, margin: '0 0 22px 0' }}>
              Xác nhận độc giả <strong style={{ color: '#0f172a' }}>"{adminReturnRecord.readerName}"</strong> ({getReaderCode(adminReturnRecord.readerId)}) đã hoàn tất trả cuốn sách <strong style={{ color: '#0f172a' }}>"{adminReturnRecord.bookTitle}"</strong> (Phiếu #{adminReturnRecord.id}) về thư viện?
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setAdminReturnRecord(null)}
                disabled={isReturning}
                className="btn btn-outline btn-modal-action"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmReturn}
                disabled={isReturning}
                className="btn btn-return btn-modal-action"
              >
                {isReturning ? 'Đang xử lý...' : 'Xác nhận trả sách'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL HIỂN THỊ HÀNG CHỜ DUYỆT MƯỢN SÁCH */}
      {pendingQueueModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setPendingQueueModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '660px',
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#fffbeb'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Clock size={20} color="#d97706" />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#92400e', margin: 0 }}>
                    Hàng Chờ Duyệt Mượn & Gia Hạn Sách
                  </h3>
                  <div style={{ fontSize: '12px', color: '#b45309', marginTop: '2px' }}>
                    Đang có <strong>{borrowRecords.filter(r => r.status === 'Chờ duyệt' || r.renewStatus === 'Chờ duyệt gia hạn').length}</strong> yêu cầu cần thủ thư phê duyệt
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingQueueModalOpen(false)}
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
                onMouseEnter={(e) => { e.currentTarget.style.color = '#0f172a'; e.currentTarget.style.background = '#f1f5f9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent'; }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body: Danh sách yêu cầu chờ duyệt */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {borrowRecords.filter(r => r.status === 'Chờ duyệt' || r.renewStatus === 'Chờ duyệt gia hạn').length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b', fontSize: '14px' }}>
                  <CheckCircle size={36} color="#16a34a" style={{ margin: '0 auto 10px auto' }} />
                  <div>Tất cả yêu cầu mượn và gia hạn sách đã được xử lý xong!</div>
                </div>
              ) : (
                borrowRecords.filter(r => r.status === 'Chờ duyệt' || r.renewStatus === 'Chờ duyệt gia hạn').map(record => (
                  <div
                    key={record.id}
                    style={{
                      border: record.renewStatus === 'Chờ duyệt gia hạn' ? '1px solid #fed7aa' : '1px solid #fde68a',
                      background: record.renewStatus === 'Chờ duyệt gia hạn' ? '#fffaf5' : '#fffdfa',
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: '#64748b', fontSize: '12.5px' }}>#{record.id}</span>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '14.5px' }}>{record.bookTitle}</span>
                        {record.renewStatus === 'Chờ duyệt gia hạn' ? (
                          <span className="badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontSize: '11px', padding: '2px 7px', fontWeight: 700 }}>
                            ⏳ Xin gia hạn +{record.pendingRenewDays || 7} ngày
                          </span>
                        ) : (
                          <span className="badge badge-warning" style={{ fontSize: '11px', padding: '2px 7px' }}>
                            Mượn mới
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#475569', display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
                        <span>Độc giả: <strong style={{ color: '#0f172a' }}>{record.readerName}</strong> ({getReaderCode(record.readerId)})</span>
                        {record.renewStatus === 'Chờ duyệt gia hạn' ? (
                          <>
                            <span>Hạn hiện tại: <strong style={{ color: '#2563eb' }}>{record.returnDate || record.dueDate}</strong></span>
                            {record.pendingRenewNotes && <span>Lý do: <em style={{ color: '#64748b' }}>"{record.pendingRenewNotes}"</em></span>}
                          </>
                        ) : (
                          <>
                            <span>Hình thức: <strong style={{ color: '#2563eb' }}>{record.borrowType || 'Mượn về nhà'}</strong></span>
                            <span>Ngày yêu cầu: <strong style={{ color: '#64748b' }}>{record.borrowDate ? record.borrowDate.substring(0, 10) : 'Hôm nay'}</strong></span>
                          </>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      {record.renewStatus === 'Chờ duyệt gia hạn' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              handleApproveRenew(record);
                            }}
                            className="btn btn-approve btn-table-action"
                            style={{ background: '#059669', color: '#ffffff', borderColor: '#059669' }}
                            title={`Duyệt gia hạn thêm ${record.pendingRenewDays || 7} ngày`}
                          >
                            <Check size={14} /> Duyệt GH
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleRejectRenew(record);
                            }}
                            className="btn btn-reject btn-table-action"
                            title="Từ chối yêu cầu gia hạn"
                          >
                            <X size={14} /> Từ chối
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingQueueModalOpen(false);
                              setBorrowActionModal({ type: 'approve', record });
                            }}
                            className="btn btn-approve btn-table-action"
                          >
                            <Check size={14} /> Duyệt
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setPendingQueueModalOpen(false);
                              setBorrowActionModal({ type: 'reject', record });
                            }}
                            className="btn btn-reject btn-table-action"
                          >
                            <X size={14} /> Từ chối
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#f8fafc'
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setPendingQueueModalOpen(false);
                  handleFilterAndScrollBorrows('Chờ duyệt');
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#2563eb',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Xem chi tiết trên bảng chính →
              </button>

              <button
                type="button"
                onClick={() => setPendingQueueModalOpen(false)}
                className="btn btn-outline"
                style={{ padding: '7px 16px', fontSize: '13px', borderRadius: '8px' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIV Modal xác nhận Xóa Sách (Không dùng thông báo trình duyệt) */}
      {bookToDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => !isDeletingBook && setBookToDelete(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '26px 28px',
              maxWidth: '430px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
              textAlign: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}
            >
              <Trash2 size={26} color="#dc2626" />
            </div>

            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
              Xác nhận xóa cuốn sách?
            </h3>
            <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: 1.6, margin: '0 0 16px 0' }}>
              Bạn có chắc chắn muốn xóa cuốn sách <strong style={{ color: '#0f172a' }}>"{bookToDelete.title}"</strong> (Mã #{bookToDelete.id})? Cuốn sách này sẽ được xóa hoàn toàn khỏi cơ sở dữ liệu thư viện.
            </p>

            {deleteBookError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#b91c1c',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '16px',
                  textAlign: 'left'
                }}
              >
                {deleteBookError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => { setBookToDelete(null); setDeleteBookError(''); }}
                disabled={isDeletingBook}
                className="btn btn-outline"
                style={{ padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteBook}
                disabled={isDeletingBook}
                className="btn btn-primary"
                style={{
                  padding: '8px 22px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#dc2626',
                  borderColor: '#dc2626'
                }}
              >
                {isDeletingBook ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal xác nhận Xóa Độc giả (Không dùng alert/confirm trình duyệt) */}
      {readerToDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => !isDeletingReader && setReaderToDelete(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '26px 28px',
              maxWidth: '430px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              textAlign: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}
            >
              <Trash2 size={28} color="#dc2626" />
            </div>

            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
              Xác nhận xóa độc giả?
            </h3>

            <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: 1.6, margin: '0 0 20px 0' }}>
              Bạn có chắc chắn muốn xóa tài khoản độc giả <strong style={{ color: '#0f172a' }}>"{readerToDelete.fullName || readerToDelete.username}"</strong>? Thao tác này sẽ xóa hồ sơ và không thể hoàn tác.
            </p>

            {deleteReaderError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#b91c1c',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '16px',
                  textAlign: 'left'
                }}
              >
                {deleteReaderError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => { setReaderToDelete(null); setDeleteReaderError(''); }}
                disabled={isDeletingReader}
                className="btn btn-outline"
                style={{ padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteReader}
                disabled={isDeletingReader}
                className="btn btn-primary"
                style={{
                  padding: '8px 22px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#dc2626',
                  borderColor: '#dc2626'
                }}
              >
                {isDeletingReader ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIV Modal xác nhận Duyệt / Từ chối mượn sách (Không dùng thông báo trình duyệt) */}
      {borrowActionModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => !isProcessingBorrowAction && setBorrowActionModal(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '26px 28px',
              maxWidth: '430px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              textAlign: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: borrowActionModal.type === 'approve' ? '#e0f2fe' : '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}
            >
              {borrowActionModal.type === 'approve' ? (
                <CheckCircle size={28} color="#0284c7" />
              ) : (
                <XCircle size={28} color="#dc2626" />
              )}
            </div>

            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
              {borrowActionModal.type === 'approve' ? 'Xác nhận duyệt cho mượn sách?' : 'Xác nhận từ chối yêu cầu mượn?'}
            </h3>

            <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: 1.6, margin: '0 0 20px 0' }}>
              {borrowActionModal.type === 'approve' ? (
                <>
                  Bạn có chắc chắn muốn phê duyệt cho độc giả <strong style={{ color: '#0f172a' }}>"{borrowActionModal.record.readerName}"</strong> ({getReaderCode(borrowActionModal.record.readerId)}) mượn cuốn sách <strong style={{ color: '#0f172a' }}>"{borrowActionModal.record.bookTitle}"</strong>?
                </>
              ) : (
                <>
                  Bạn có chắc chắn muốn từ chối yêu cầu mượn cuốn sách <strong style={{ color: '#0f172a' }}>"{borrowActionModal.record.bookTitle}"</strong> của độc giả <strong style={{ color: '#0f172a' }}>"{borrowActionModal.record.readerName}"</strong>?
                </>
              )}
            </p>

            {borrowActionError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#b91c1c',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '16px',
                  textAlign: 'left'
                }}
              >
                {borrowActionError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => { setBorrowActionModal(null); setBorrowActionError(''); }}
                disabled={isProcessingBorrowAction}
                className="btn btn-outline btn-modal-action"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                onClick={handleConfirmBorrowAction}
                disabled={isProcessingBorrowAction}
                className={`btn ${borrowActionModal.type === 'approve' ? 'btn-approve' : 'btn-reject'} btn-modal-action`}
              >
                {isProcessingBorrowAction ? 'Đang xử lý...' : (borrowActionModal.type === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIV Modal xác nhận Duyệt / Từ chối nộp phạt VNPay */}
      {fineActionModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => !isProcessingFineAction && setFineActionModal(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '26px 28px',
              maxWidth: '450px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              textAlign: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: fineActionModal.type === 'approve' ? '#e0f2fe' : '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}
            >
              {fineActionModal.type === 'approve' ? (
                <CheckCircle size={28} color="#0284c7" />
              ) : (
                <XCircle size={28} color="#dc2626" />
              )}
            </div>

            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
              {fineActionModal.type === 'approve' ? 'Xác nhận duyệt nộp phạt VNPay?' : 'Xác nhận từ chối giao dịch nộp phạt?'}
            </h3>

            <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: 1.6, margin: '0 0 16px 0' }}>
              {fineActionModal.type === 'approve' ? (
                <>
                  Duyệt nộp phạt số tiền <strong style={{ color: '#0284c7' }}>{Number(fineActionModal.fine.fineAmount || 0).toLocaleString('vi-VN')} đ</strong> cho độc giả <strong style={{ color: '#0f172a' }}>"{fineActionModal.fine.readerName}"</strong>. Tài khoản của độc giả sẽ được <strong>TỰ ĐỘNG MỞ KHÓA</strong>.
                </>
              ) : (
                <>
                  Từ chối giao dịch nộp phạt <strong style={{ color: '#dc2626' }}>{Number(fineActionModal.fine.fineAmount || 0).toLocaleString('vi-VN')} đ</strong> của độc giả <strong style={{ color: '#0f172a' }}>"{fineActionModal.fine.readerName}"</strong>. Tài khoản sẽ tiếp tục bị khóa.
                </>
              )}
            </p>

            {fineActionModal.type === 'reject' && (
              <div style={{ textAlign: 'left', marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Lý do từ chối (gửi thông báo đến độc giả):
                </label>
                <input
                  type="text"
                  value={fineActionModal.reason || ''}
                  onChange={(e) => setFineActionModal({ ...fineActionModal, reason: e.target.value })}
                  placeholder="Nhập lý do từ chối..."
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}

            {fineActionError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#b91c1c',
                  fontSize: '13px',
                  marginBottom: '16px',
                  textAlign: 'left'
                }}
              >
                {fineActionError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                type="button"
                disabled={isProcessingFineAction}
                onClick={() => setFineActionModal(null)}
                className="btn btn-outline btn-modal-action"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isProcessingFineAction}
                onClick={async () => {
                  setIsProcessingFineAction(true);
                  setFineActionError('');
                  try {
                    if (fineActionModal.type === 'approve') {
                      await handleApproveFine(fineActionModal.fine.id);
                    } else {
                      await handleRejectFineWithReason(fineActionModal.fine.id, fineActionModal.reason);
                    }
                    setFineActionModal(null);
                  } catch (err) {
                    setFineActionError(err.message || 'Có lỗi xảy ra');
                  } finally {
                    setIsProcessingFineAction(false);
                  }
                }}
                className={`btn ${fineActionModal.type === 'approve' ? 'btn-approve' : 'btn-reject'} btn-modal-action`}
              >
                {isProcessingFineAction ? 'Đang xử lý...' : (fineActionModal.type === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Thêm/Sửa Sách Đặt Trước (Sắp Về) */}
      <AddEditUpcomingBookModal
        isOpen={upcomingBookModalOpen}
        onClose={() => { setUpcomingBookModalOpen(false); setEditingUpcomingBook(null); }}
        onSave={handleSaveUpcomingBook}
        book={editingUpcomingBook}
      />

      {/* Modal Xác nhận Xóa Sách Đặt Trước */}
      {upcomingBookToDelete && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box'
          }}
          onClick={() => !isDeletingUpcomingBook && setUpcomingBookToDelete(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '26px 28px',
              maxWidth: '440px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              textAlign: 'center',
              margin: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
                color: '#dc2626'
              }}
            >
              <Trash2 size={26} />
            </div>

            <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>
              Xóa sách đặt trước?
            </h3>

            <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: 1.6, margin: '0 0 16px 0' }}>
              Bạn có chắc chắn muốn xóa tác phẩm <strong style={{ color: '#0f172a' }}>"{upcomingBookToDelete.title}"</strong> khỏi kho sách đặt trước không?
            </p>

            {(() => {
              const resCount = reservations.filter(r => Number(r.bookId) === Number(upcomingBookToDelete.id) && r.status !== 'Cancelled' && r.status !== 'Hủy').length;
              if (resCount > 0) {
                return (
                  <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', padding: '10px 12px', fontSize: '12.5px', color: '#b45309', marginBottom: '16px', textAlign: 'left', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>Lưu ý: Hiện có <strong>{resCount} bạn đọc</strong> đang đăng ký đặt trước cuốn sách này. Khi xóa, các yêu cầu đặt trước liên quan cũng sẽ được tự động hủy bỏ.</span>
                  </div>
                );
              }
              return null;
            })()}

            {deleteUpcomingBookError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', color: '#b91c1c', fontSize: '13px', marginBottom: '16px', textAlign: 'left' }}>
                {deleteUpcomingBookError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setUpcomingBookToDelete(null)}
                disabled={isDeletingUpcomingBook}
                className="btn btn-outline"
                style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '13px' }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUpcomingBook}
                disabled={isDeletingUpcomingBook}
                className="btn btn-danger"
                style={{ padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}
              >
                {isDeletingUpcomingBook ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Nhập Kho Chính Thức */}
      {receiveStockBook && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box'
          }}
          onClick={() => !isReceivingStock && setReceiveStockBook(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px 28px',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              textAlign: 'left',
              margin: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PackageCheck size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Nhập kho sách chính thức
                </h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Chuyển sang kho sách sẵn sàng cho mượn</span>
              </div>
            </div>

            <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Sách <strong style={{ color: '#0f172a' }}>"{receiveStockBook.title}"</strong> đã về tới thư viện. Nhập số lượng bản in thực tế để đưa vào danh mục cho mượn:
            </p>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                Số lượng sách nhập về kho *
              </label>
              <input
                type="number"
                min="1"
                max="500"
                value={receiveStockQty}
                onChange={(e) => setReceiveStockQty(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #16a34a', fontSize: '15px', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                {[10, 20, 30, 50].map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setReceiveStockQty(q)}
                    style={{
                      flex: 1,
                      padding: '5px 8px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: Number(receiveStockQty) === q ? '1px solid #16a34a' : '1px solid #e2e8f0',
                      background: Number(receiveStockQty) === q ? '#f0fdf4' : '#ffffff',
                      color: Number(receiveStockQty) === q ? '#16a34a' : '#64748b'
                    }}
                  >
                    {q} cuốn
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setReceiveStockBook(null)}
                disabled={isReceivingStock}
                className="btn btn-outline"
                style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '13px' }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmReceiveStock}
                disabled={isReceivingStock}
                className="btn btn-success"
                style={{ padding: '8px 22px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {isReceivingStock ? 'Đang cập nhật...' : 'Xác nhận nhập kho'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Xem Hàng Chờ Đặt Trước Của Sách */}
      {viewingQueueBook && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box'
          }}
          onClick={() => setViewingQueueBook(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '620px',
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              margin: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Clock size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    Hàng chờ đặt trước: {viewingQueueBook.title}
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Thứ tự ưu tiên nhận sách khi hàng về</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingQueueBook(null)}
                style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* List */}
            <div style={{ padding: '16px 22px', overflowY: 'auto', flex: 1 }}>
              {(() => {
                const bookResv = reservations.filter(r => 
                  Number(r.bookId) === Number(viewingQueueBook.id) && 
                  r.status !== 'Cancelled' && 
                  r.status !== 'Hủy'
                ).sort((a, b) => (Number(a.priority || 1) - Number(b.priority || 1)) || new Date(a.reservedAt || 0) - new Date(b.reservedAt || 0));

                if (bookResv.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '36px 0', color: '#94a3b8' }}>
                      <Clock size={40} style={{ margin: '0 auto 8px', color: '#cbd5e1' }} />
                      <p style={{ margin: 0, fontSize: '13.5px' }}>Hiện chưa có bạn đọc nào đăng ký đặt trước tác phẩm này.</p>
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {bookResv.map((res, idx) => (
                      <div
                        key={res.id || idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: '1px solid #e2e8f0',
                          background: idx === 0 ? '#f0fdf4' : '#ffffff'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: idx === 0 ? '#16a34a' : '#e2e8f0', color: idx === 0 ? '#ffffff' : '#475569', fontWeight: 800, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            #{idx + 1}
                          </div>
                          <div>
                            <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                              {res.readerName || (res.userId === 2 ? 'Trần Thị Mai' : `Độc giả #${res.readerId || res.userId}`)}
                            </div>
                            <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                              Mã DG: <strong>{getReaderCode(res.readerId || res.userId)}</strong> • Đặt lúc: {res.reservedAt ? res.reservedAt.substring(0, 10) : 'Gần đây'}
                            </div>
                          </div>
                        </div>

                        <div>
                          <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, background: idx === 0 ? '#dcfce7' : '#eff6ff', color: idx === 0 ? '#15803d' : '#2563eb' }}>
                            {idx === 0 ? 'Ưu tiên số 1' : `Thứ tự #${idx + 1}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc' }}>
              <button
                type="button"
                onClick={() => setViewingQueueBook(null)}
                className="btn btn-secondary"
                style={{ fontSize: '13px', padding: '7px 18px' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Floating Action Button mở Trợ lý AI Text-to-SQL */}
      <button
        type="button"
        onClick={() => setChatbotOpen(true)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: toastMessage ? '300px' : '28px',
          zIndex: 9998,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '11px 18px',
          borderRadius: '50px',
          background: 'linear-gradient(135deg, #4f46e5, #2563eb)',
          color: '#ffffff',
          fontWeight: 700,
          fontSize: '13.5px',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(79, 70, 229, 0.4)',
          transition: 'all 0.2s ease'
        }}
        title="Truy vấn dữ liệu thư viện bằng tiếng Việt tự nhiên (Text-to-SQL)"
      >
        <Sparkles size={17} />
        <span>Trợ lý Text-to-SQL</span>
      </button>

      {/* Modal Trợ lý AI Text-to-SQL */}
      {chatbotOpen && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box'
          }}
          onClick={() => setChatbotOpen(false)}
        >
          {/* [FIX] Wrapper cần có height rõ ràng để AdminChatbot flex-col + flex-1 min-h-0 hoạt động */}
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '880px', height: 'min(650px, 85vh)', display: 'flex', flexDirection: 'column' }}>
            <AdminChatbot onClose={() => setChatbotOpen(false)} />
          </div>
        </div>,
        document.body
      )}

      {/* Modal Hàng đợi Cảnh báo Bất thường (AI Anomaly Detection) */}
      {alertQueueOpen && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box'
          }}
          onClick={() => setAlertQueueOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '880px' }}>
            <AlertQueue
              onClose={() => setAlertQueueOpen(false)}
              onLockReader={(userId, reason) => handleLockReaderFromAlert(userId, reason)}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Modal Quét mã QR Phiếu Mượn PDF cho Thủ thư */}
      <ReceiptQRScannerModal
        isOpen={receiptScannerOpen}
        onClose={() => setReceiptScannerOpen(false)}
        borrowRecords={borrowRecords}
        onApproveBorrow={async (record) => {
          await api.approveBorrow(record.id);
          await loadData(true);
        }}
        onReturnBook={async (record) => {
          await api.updateBorrowStatus(record.id, 'Đã trả');
          await loadData(true);
        }}
        showToast={showToast}
      />

      {/* Toast Notification khi Thêm/Sửa/Xóa thành công */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '28px',
            background: '#0f172a',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: '10px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.25)',
            fontSize: '13.5px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            zIndex: 10000
          }}
        >
          <CheckCircle size={18} color="#22c55e" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}