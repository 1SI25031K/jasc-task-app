import React from "react";

interface MaterialIconProps {
  name: string;
  filled?: boolean;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function MaterialIcon({
  name,
  filled = false,
  size = 24,
  className = "",
  style,
}: MaterialIconProps) {
  return (
    <span
      className={`material-symbols-rounded select-none leading-none ${filled ? "filled" : ""} ${className}`}
      style={{
        fontSize: `${size}px`,
        width: `${size}px`,
        height: `${size}px`,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
        ...style,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

