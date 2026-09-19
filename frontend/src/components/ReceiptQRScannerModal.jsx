import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode } from 'html5-qrcode';
import {
  X, QrCode, Camera, Upload, CheckCircle2, AlertCircle,
  PackageCheck, Check, RotateCcw, FileText, Search, User, BookOpen, Calendar
} from 'lucide-react';

export default function ReceiptQRScannerModal({
  isOpen,
  onClose,
  borrowRecords = [],
  onApproveBorrow,
  onReturnBook,
  showToast
}) {
  const [activeTab, setActiveTab] = useState('camera'); // 'camera' | 'upload' | 'manual'
  const [cameraError, setCameraError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scannedResult, setScannedResult] = useState('');
  const [scannedRecord, setScannedRecord] = useState(null);
  const [actionError, setActionError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualCode, setManualCode] = useState('');

  const html5QrCodeRef = useRef(null);
  const scannerContainerId = 'receipt-qr-scanner-box';

  // Âm thanh Beep khi quét thành công
  const playSuccessBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // 880Hz (A5)
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  };

  // Trích xuất ID phiếu mượn từ chuỗi mã QR
  const extractReceiptId = (rawText) => {
    if (!rawText) return null;
    const text = String(rawText).trim();

    // 1. SMARTLIB-RECEIPT-{id}-...
    const receiptMatch = text.match(/SMARTLIB-RECEIPT-(\d+)/i);
    if (receiptMatch && receiptMatch[1]) {
      return parseInt(receiptMatch[1], 10);
    }

    // 2. URL chứa receiptId={id} hoặc borrowId={id}
    const urlMatch = text.match(/[?&](?:receiptId|borrowId|recordId)=(\d+)/i);
    if (urlMatch && urlMatch[1]) {
      return parseInt(urlMatch[1], 10);
    }

    // 3. Chuỗi bắt đầu bằng #123 hoặc số thuần 123
    const numMatch = text.match(/^#?(\d+)$/);
    if (numMatch && numMatch[1]) {
      return parseInt(numMatch[1], 10);
    }

    return null;
  };

  const handleProcessCode = (rawText) => {
    setActionError('');
    setScannedResult(rawText);
    const receiptId = extractReceiptId(rawText);

    if (!receiptId) {
      setActionError(`Mã QR không đúng định dạng phiếu mượn SmartLib: "${rawText.substring(0, 40)}"`);
      return;
    }

    // Tìm phiếu mượn trong danh sách
    const record = borrowRecords.find(r => Number(r.id) === Number(receiptId));
    if (record) {
      playSuccessBeep();
      setScannedRecord(record);
      // Tạm dừng camera sau khi nhận diện thành công
      stopCamera();
    } else {
      setActionError(`Không tìm thấy Phiếu mượn #${receiptId} trong dữ liệu hệ thống!`);
      setScannedRecord(null);
    }
  };

  const startCamera = async () => {
    setCameraError('');
    setActionError('');

    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(scannerContainerId);
      }

      await html5QrCodeRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        (decodedText) => {
          handleProcessCode(decodedText);
        },
        () => {}
      );
      setIsScanning(true);
    } catch (err) {
      console.warn('Camera start error:', err);
      setCameraError('Không thể kích hoạt Camera máy tính. Vui lòng cấp quyền truy cập Camera hoặc chọn tab "Tải ảnh phiếu" bên cạnh.');
      setIsScanning(false);
    }
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (e) {}
    }
    setIsScanning(false);
  };

  useEffect(() => {
    if (isOpen) {
      setScannedRecord(null);
      setActionError('');
      setScannedResult('');
      if (activeTab === 'camera') {
        const timer = setTimeout(() => startCamera(), 250);
        return () => clearTimeout(timer);
      }
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab]);

  // Quét từ tệp ảnh tải lên
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setActionError('');
    try {
      const html5QrCode = new Html5Qrcode('receipt-qr-file-scanner');
      const decodedText = await html5QrCode.scanFile(file, true);
      handleProcessCode(decodedText);
      try { await html5QrCode.clear(); } catch(err) {}
    } catch (err) {
      setActionError('Không thể nhận diện mã QR trong tệp ảnh vừa chọn. Vui lòng chọn ảnh chụp rõ nét hơn.');
    }
  };

  // Xác nhận Duyệt cho mượn
  const handleApprove = async () => {
    if (!scannedRecord) return;
    setIsProcessing(true);
    try {
      if (onApproveBorrow) {
        await onApproveBorrow(scannedRecord);
      }
      if (showToast) {
        showToast(`✓ Đã duyệt và bàn giao sách "${scannedRecord.bookTitle}" cho độc giả "${scannedRecord.readerName}"!`);
      }
      onClose();
    } catch (err) {
      setActionError(err.message || 'Lỗi khi phê duyệt phiếu mượn.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Xác nhận Nhận lại sách trả
  const handleReturn = async () => {
    if (!scannedRecord) return;
    setIsProcessing(true);
    try {
      if (onReturnBook) {
        await onReturnBook(scannedRecord);
      }
      if (showToast) {
        showToast(`✓ Đã xác nhận nhận lại cuốn sách "${scannedRecord.bookTitle}" từ "${scannedRecord.readerName}" về kho!`);
      }
      onClose();
    } catch (err) {
      setActionError(err.message || 'Lỗi khi nhận trả sách.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetScan = () => {
    setScannedRecord(null);
    setActionError('');
    setScannedResult('');
    if (activeTab === 'camera') {
      startCamera();
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '560px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header Modal */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #f8fafc, #f1f5f9)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#4f46e5',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <QrCode size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                Quét Mã QR Phiếu Mượn PDF
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                Duyệt mượn & nhận trả sách siêu tốc bằng Camera tại quầy
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab chuyển đổi phương thức quét */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #e2e8f0',
            padding: '8px 16px 0',
            background: '#ffffff',
            gap: '8px'
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('camera')}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: activeTab === 'camera' ? '#4f46e5' : '#64748b',
              borderBottom: activeTab === 'camera' ? '2px solid #4f46e5' : '2px solid transparent'
            }}
          >
            <Camera size={15} /> Quét Camera
          </button>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab('upload');
            }}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: activeTab === 'upload' ? '#4f46e5' : '#64748b',
              borderBottom: activeTab === 'upload' ? '2px solid #4f46e5' : '2px solid transparent'
            }}
          >
            <Upload size={15} /> Tải ảnh phiếu
          </button>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab('manual');
            }}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: activeTab === 'manual' ? '#4f46e5' : '#64748b',
              borderBottom: activeTab === 'manual' ? '2px solid #4f46e5' : '2px solid transparent'
            }}
          >
            <Search size={15} /> Nhập số phiếu
          </button>
        </div>

        {/* Body Modal */}
        <div style={{ padding: '20px 24px', flex: 1, maxHeight: 'calc(85vh - 140px)', overflowY: 'auto' }}>
          {/* Thông báo lỗi nếu có */}
          {actionError && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#b91c1c',
                fontSize: '13px'
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{actionError}</span>
            </div>
          )}

          {/* KHI ĐÃ QUÉT ĐƯỢC PHIẾU MƯỢN */}
          {scannedRecord ? (
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={20} color="#4f46e5" />
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                    Phiếu mượn #{scannedRecord.id}
                  </span>
                </div>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 700,
                    background:
                      scannedRecord.status === 'Chờ duyệt' ? '#fef3c7' :
                      scannedRecord.status === 'Đang mượn' ? '#dbeafe' :
                      scannedRecord.status === 'Quá hạn' ? '#fee2e2' : '#dcfce7',
                    color:
                      scannedRecord.status === 'Chờ duyệt' ? '#b45309' :
                      scannedRecord.status === 'Đang mượn' ? '#1d4ed8' :
                      scannedRecord.status === 'Quá hạn' ? '#b91c1c' : '#15803d'
                  }}
                >
                  ● {scannedRecord.status}
                </span>
              </div>

              {/* Thông tin chi tiết */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13.5px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
                  <BookOpen size={16} color="#64748b" />
                  <strong>Sách:</strong>
                  <span style={{ color: '#2563eb', fontWeight: 600 }}>{scannedRecord.bookTitle}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
                  <User size={16} color="#64748b" />
                  <strong>Độc giả:</strong>
                  <span>{scannedRecord.readerName}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
                  <Calendar size={16} color="#64748b" />
                  <strong>Ngày mượn:</strong>
                  <span>{(scannedRecord.borrowDate || '').substring(0, 10)}</span>
                  <strong style={{ marginLeft: '12px' }}>Hạn trả:</strong>
                  <span style={{ color: scannedRecord.status === 'Quá hạn' ? '#dc2626' : '#0f172a', fontWeight: scannedRecord.status === 'Quá hạn' ? 700 : 400 }}>
                    {(scannedRecord.returnDate || scannedRecord.dueDate || '').substring(0, 10)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '12.5px' }}>
                  <span>Hình thức: <strong>{scannedRecord.borrowType || 'Mượn về nhà'}</strong></span>
                  {scannedRecord.overdueDays > 0 && (
                    <span style={{ color: '#dc2626', fontWeight: 700, marginLeft: '8px' }}>
                      (Trễ {scannedRecord.overdueDays} ngày)
                    </span>
                  )}
                </div>
              </div>

              {/* Khu vực nút bấm hành động */}
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {scannedRecord.status === 'Chờ duyệt' && (
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={isProcessing}
                    style={{
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      padding: '12px 18px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                    }}
                  >
                    <Check size={18} /> {isProcessing ? 'Đang xử lý...' : '✓ Duyệt & Giao Sách Cho Độc Giả'}
                  </button>
                )}

                {(scannedRecord.status === 'Đang mượn' || scannedRecord.status === 'Quá hạn') && (
                  <button
                    type="button"
                    onClick={handleReturn}
                    disabled={isProcessing}
                    style={{
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      padding: '12px 18px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
                    }}
                  >
                    <PackageCheck size={18} /> {isProcessing ? 'Đang xử lý...' : '✓ Xác Nhận Nhận Lại Sách Về Kho'}
                  </button>
                )}

                {scannedRecord.status === 'Đã trả' && (
                  <div
                    style={{
                      padding: '10px 14px',
                      background: '#dcfce7',
                      color: '#15803d',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      textAlign: 'center'
                    }}
                  >
                    ✓ Cuốn sách này đã được độc giả hoàn trả về kho thành công!
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleResetScan}
                  style={{
                    background: 'transparent',
                    color: '#64748b',
                    border: '1px solid #cbd5e1',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    marginTop: '4px'
                  }}
                >
                  <RotateCcw size={14} /> Quét phiếu khác
                </button>
              </div>
            </div>
          ) : (
            /* KHI ĐANG Ở TRẠNG THÁI QUÉT */
            <div>
              {activeTab === 'camera' && (
                <div>
                  {cameraError ? (
                    <div
                      style={{
                        padding: '24px',
                        background: '#fef2f2',
                        borderRadius: '12px',
                        textAlign: 'center',
                        color: '#b91c1c'
                      }}
                    >
                      <AlertCircle size={36} style={{ margin: '0 auto 10px' }} />
                      <p style={{ margin: '0 0 12px', fontSize: '13.5px', fontWeight: 500 }}>
                        {cameraError}
                      </p>
                      <button
                        type="button"
                        onClick={startCamera}
                        style={{
                          background: '#4f46e5',
                          color: '#ffffff',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          fontWeight: 600,
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        Thử lại Camera
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div
                        id={scannerContainerId}
                        style={{
                          width: '100%',
                          minHeight: '280px',
                          borderRadius: '12px',
                          overflow: 'hidden',
                          background: '#000000',
                          border: '2px solid #4f46e5'
                        }}
                      />
                      <p style={{ textAlign: 'center', fontSize: '12px', color: '#64748b', marginTop: '10px' }}>
                        📷 Hướng khung camera về phía mã QR in ở chân phiếu mượn PDF
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'upload' && (
                <div style={{ textAlign: 'center', padding: '30px 16px' }}>
                  <div
                    style={{
                      border: '2px dashed #cbd5e1',
                      borderRadius: '14px',
                      padding: '30px 20px',
                      background: '#f8fafc',
                      cursor: 'pointer'
                    }}
                    onClick={() => document.getElementById('qr-file-input')?.click()}
                  >
                    <Upload size={40} color="#4f46e5" style={{ margin: '0 auto 10px' }} />
                    <h4 style={{ margin: '0 0 6px', fontSize: '15px', color: '#0f172a' }}>
                      Nhấp để tải ảnh phiếu mượn PDF lên
                    </h4>
                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                      Hỗ trợ định dạng ảnh PNG, JPG hoặc ảnh chụp màn hình phiếu
                    </p>
                    <input
                      id="qr-file-input"
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleFileUpload}
                    />
                  </div>
                  <div id="receipt-qr-file-scanner" style={{ display: 'none' }} />
                </div>
              )}

              {activeTab === 'manual' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (manualCode.trim()) {
                      handleProcessCode(manualCode);
                    }
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '10px 0' }}
                >
                  <label style={{ fontSize: '13.5px', fontWeight: 600, color: '#334155' }}>
                    Nhập mã phiếu mượn hoặc quét bằng máy bắn mã vạch USB:
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      placeholder="Ví dụ: #1 hoặc SMARTLIB-RECEIPT-1"
                      autoFocus
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '14px'
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        background: '#4f46e5',
                        color: '#ffffff',
                        border: 'none',
                        padding: '10px 18px',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '13.5px',
                        cursor: 'pointer'
                      }}
                    >
                      Tìm kiếm
                    </button>
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                    💡 Bạn có thể dùng súng bắn mã vạch 2D cắm cổng USB bắn thẳng vào ô này.
                  </p>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
