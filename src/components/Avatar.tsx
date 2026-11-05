import React from "react";

export const AVATAR_COLORS = [
  "#0B57D0", // M3 Primary Blue
  "#006A6A", // M3 Teal
  "#146C2E", // M3 Forest Green
  "#8B4A00", // M3 Warm Amber
  "#6B4FBB", // M3 Purple
  "#904A43", // M3 Rust Red
  "#006874", // M3 Cyan
  "#9C2A5C", // M3 Magenta
];

export function getAvatarColor(memberId: string): string {
  if (!memberId) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < memberId.length; i++) {
    hash = (hash << 5) - hash + memberId.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export function getInitial(name: string): string {
  const clean = (name || "").trim();
  if (!clean) return "J";
  const first = clean[0];
  return first.toUpperCase();
}

interface AvatarProps {
  name: string;
  memberId: string;
  pictureUrl?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({
  name,
  memberId,
  pictureUrl,
  size = 40,
  className = "",
}: AvatarProps) {
  if (pictureUrl) {
    return (
      <img
        src={pictureUrl}
        alt={name}
        width={size}
        height={size}
        className={`rounded-full object-cover inline-block align-middle ${className}`}
        style={{ width: `${size}px`, height: `${size}px` }}
      />
    );
  }

  const bgColor = getAvatarColor(memberId);
  const initial = getInitial(name);
  const fontSize = Math.max(12, Math.floor(size * 0.45));

  return (
    <div
      className={`rounded-full text-white inline-flex items-center justify-center font-medium select-none align-middle shadow-sm ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        backgroundColor: bgColor,
        fontSize: `${fontSize}px`,
      }}
    >
      {initial}
    </div>
  );
}

