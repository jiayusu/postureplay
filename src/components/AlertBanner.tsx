import React, { useEffect, useRef } from 'react';
import { useUIStore } from '@/stores';
import { useCameraStore } from '@/stores';
import { usePostureStore } from '@/stores';

const LOW_CONFIDENCE_THRESHOLD = 0.5;
const LOW_CONFIDENCE_SUSTAIN_MS = 3000;

const AlertBanner: React.FC = () => {
  const alertBanner = useUIStore((s) => s.alertBanner);
  const showAlert = useUIStore((s) => s.showAlert);
  const dismissAlert = useUIStore((s) => s.dismissAlert);

  const lighting = useCameraStore((s) => s.lighting);
  const metrics = usePostureStore((s) => s.metrics);

  const lowConfTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lighting warning
  useEffect(() => {
    if (lighting?.sufficient === false) {
      showAlert({
        type: 'warning',
        message: '光线有点暗，我看不太清 \u2014 试试开灯或调整角度',
      });
    }
  }, [lighting?.sufficient, showAlert]);

  // Low confidence sustained check
  useEffect(() => {
    if (lowConfTimerRef.current) {
      clearTimeout(lowConfTimerRef.current);
      lowConfTimerRef.current = null;
    }

    if (metrics && metrics.confidence < LOW_CONFIDENCE_THRESHOLD) {
      lowConfTimerRef.current = setTimeout(() => {
        showAlert({
          type: 'info',
          message: '当前为单视角估算，仅供参考',
        });
      }, LOW_CONFIDENCE_SUSTAIN_MS);
    }

    return () => {
      if (lowConfTimerRef.current) {
        clearTimeout(lowConfTimerRef.current);
      }
    };
  }, [metrics, showAlert]);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (!alertBanner) return;

    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current);
    }

    autoDismissRef.current = setTimeout(() => {
      dismissAlert();
    }, 5000);

    return () => {
      if (autoDismissRef.current) {
        clearTimeout(autoDismissRef.current);
      }
    };
  }, [alertBanner, dismissAlert]);

  if (!alertBanner) return null;

  const bgClass =
    alertBanner.type === 'warning'
      ? 'bg-[#ef4444]/15'
      : 'bg-[#60a5fa]/15';

  const textClass =
    alertBanner.type === 'warning'
      ? 'text-[#ef4444]'
      : 'text-[#60a5fa]';

  return (
    <>
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      `}</style>
      <div
        className={`fixed top-0 left-0 right-0 z-50 px-4 py-3 flex items-center justify-between ${bgClass} backdrop-blur-[8px] animate-[slideDown_300ms_ease-out]`}
      >
        <span className={`text-sm ${textClass}`}>{alertBanner.message}</span>
        <button
          onClick={dismissAlert}
          className={`ml-3 text-lg leading-none opacity-70 hover:opacity-100 transition-opacity ${textClass}`}
        >
          &times;
        </button>
      </div>
    </>
  );
};

export default AlertBanner;
