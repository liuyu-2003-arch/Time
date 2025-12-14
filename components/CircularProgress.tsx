import React from 'react';

interface CircularProgressProps {
  size: number;
  strokeWidth: number;
  percentage: number;
  timeLeftStr: string;
  color?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({ 
  size, 
  strokeWidth, 
  percentage, 
  timeLeftStr,
  color = '#00D8FF'
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* Background Circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={strokeWidth}
        />
        {/* Progress Circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-white">
        <span className="text-7xl font-mono font-bold tracking-wider">{timeLeftStr}</span>
      </div>
    </div>
  );
};