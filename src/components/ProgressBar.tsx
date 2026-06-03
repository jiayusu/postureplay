import React from 'react';

interface ProgressBarProps {
  progress: number;
  label?: string;
  color?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  label,
  color = 'bg-[#f59e4b]',
}) => {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className="flex flex-col items-center gap-1">
      {label && (
        <span className="text-sm text-center text-[#ffb478]">{label}</span>
      )}
      <div className="w-full max-w-[320px] h-[4px] rounded-full bg-[#1a1a2e] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${color}`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
