import React from 'react';
import { useSessionStore } from '@/stores';

type Mode = 'work' | 'casual' | 'meditation';

interface ModeOption {
  key: Mode;
  label: string;
}

const modes: ModeOption[] = [
  { key: 'work', label: '工作' },
  { key: 'casual', label: '休闲' },
  { key: 'meditation', label: '冥想' },
];

const ModeSwitcher: React.FC = () => {
  const mode = useSessionStore((s) => s.mode);
  const switchMode = useSessionStore((s) => s.switchMode);

  const getButtonClasses = (key: Mode): string => {
    const isSelected = mode === key;

    if (!isSelected) {
      return 'bg-[#252540]/50 text-[#323258] border border-transparent';
    }

    if (key === 'meditation') {
      return 'bg-[#ffb478]/20 text-[#ffb478] border border-[#ffb478]/30';
    }

    return 'bg-[#f59e4b]/20 text-[#f59e4b] border border-[#f59e4b]/30';
  };

  return (
    <div className="flex flex-row gap-2">
      {modes.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => switchMode(key)}
          className={`rounded-full px-3 py-1.5 text-sm transition-all duration-150 ease-out hover:scale-105 active:scale-95 ${getButtonClasses(key)}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

export default ModeSwitcher;
