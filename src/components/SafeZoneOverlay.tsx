import React from "react";

export type SafeZoneMode = "none" | "tiktok" | "reels" | "16:9";

interface SafeZoneOverlayProps {
  mode: SafeZoneMode;
  width: number;
  height: number;
}

export default function SafeZoneOverlay({ mode, width, height }: SafeZoneOverlayProps) {
  if (mode === "none") return null;

  return (
    <div
      className="safe-zone-overlay"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width,
        height,
        pointerEvents: "none",
        zIndex: 5,
        overflow: "hidden",
      }}
    >
      {mode === "tiktok" && (
        <svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Header Safe Line */}
          <line x1="0" y1="12" x2="100" y2="12" stroke="rgba(0, 242, 254, 0.4)" strokeDasharray="2,2" strokeWidth="0.5" />
          <text x="4" y="10" fill="rgba(0, 242, 254, 0.7)" fontSize="3" fontFamily="sans-serif">
            TikTok Top Bar (Search / LIVE)
          </text>

          {/* Bottom Caption & Audio Safe Area */}
          <rect x="0" y="76" width="100" height="24" fill="rgba(255, 0, 80, 0.08)" stroke="rgba(255, 0, 80, 0.4)" strokeDasharray="2,2" strokeWidth="0.5" />
          <text x="4" y="80" fill="rgba(255, 0, 80, 0.8)" fontSize="3" fontWeight="bold" fontFamily="sans-serif">
            Area Caption & Musik (Teks Jangan Ditaruh di Sini)
          </text>

          {/* Right Action Icons Zone */}
          <rect x="83" y="38" width="17" height="42" fill="rgba(0, 242, 254, 0.08)" stroke="rgba(0, 242, 254, 0.4)" strokeDasharray="2,2" strokeWidth="0.5" />
          <circle cx="91.5" cy="44" r="3.5" fill="none" stroke="rgba(0, 242, 254, 0.6)" strokeWidth="0.5" />
          <circle cx="91.5" cy="53" r="3" fill="none" stroke="rgba(255, 0, 80, 0.6)" strokeWidth="0.5" />
          <circle cx="91.5" cy="61" r="3" fill="none" stroke="rgba(0, 242, 254, 0.6)" strokeWidth="0.5" />
          <circle cx="91.5" cy="69" r="3" fill="none" stroke="rgba(0, 242, 254, 0.6)" strokeWidth="0.5" />
          <circle cx="91.5" cy="77" r="3" fill="none" stroke="rgba(0, 242, 254, 0.6)" strokeWidth="0.5" />
          <text x="84" y="36" fill="rgba(0, 242, 254, 0.8)" fontSize="2.4" fontFamily="sans-serif">
            Tombol UI
          </text>

          {/* Safe Box Center Guide */}
          <rect x="5" y="14" width="76" height="60" fill="none" stroke="rgba(99, 59, 251, 0.4)" strokeWidth="0.4" strokeDasharray="3,3" />
          <text x="6" y="18" fill="rgba(99, 59, 251, 0.9)" fontSize="2.8" fontWeight="600" fontFamily="sans-serif">
            ✓ AREA AMAN UTAMA TIKTOK
          </text>
        </svg>
      )}

      {mode === "reels" && (
        <svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Header Safe Line */}
          <line x1="0" y1="10" x2="100" y2="10" stroke="rgba(225, 48, 108, 0.4)" strokeDasharray="2,2" strokeWidth="0.5" />
          <text x="4" y="8" fill="rgba(225, 48, 108, 0.7)" fontSize="3" fontFamily="sans-serif">
            Reels Top Header
          </text>

          {/* Bottom Caption Area */}
          <rect x="0" y="78" width="100" height="22" fill="rgba(225, 48, 108, 0.08)" stroke="rgba(225, 48, 108, 0.4)" strokeDasharray="2,2" strokeWidth="0.5" />
          <text x="4" y="82" fill="rgba(225, 48, 108, 0.8)" fontSize="3" fontWeight="bold" fontFamily="sans-serif">
            Instagram Reels Caption & Audio
          </text>

          {/* Right Action Icons */}
          <rect x="85" y="45" width="15" height="35" fill="rgba(225, 48, 108, 0.08)" stroke="rgba(225, 48, 108, 0.4)" strokeDasharray="2,2" strokeWidth="0.5" />
          <text x="86" y="43" fill="rgba(225, 48, 108, 0.8)" fontSize="2.4" fontFamily="sans-serif">
            Likes / Share
          </text>

          {/* Safe Area */}
          <rect x="5" y="12" width="78" height="64" fill="none" stroke="rgba(99, 59, 251, 0.4)" strokeWidth="0.4" strokeDasharray="3,3" />
          <text x="6" y="16" fill="rgba(99, 59, 251, 0.9)" fontSize="2.8" fontWeight="600" fontFamily="sans-serif">
            ✓ AREA AMAN REELS
          </text>
        </svg>
      )}

      {mode === "16:9" && (
        <svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* 90% Action Safe */}
          <rect x="5" y="5" width="90" height="90" fill="none" stroke="rgba(56, 189, 248, 0.5)" strokeWidth="0.5" strokeDasharray="3,3" />
          <text x="6" y="9" fill="rgba(56, 189, 248, 0.8)" fontSize="2.5" fontFamily="sans-serif">
            Action Safe (90%)
          </text>

          {/* 80% Title Safe */}
          <rect x="10" y="10" width="80" height="80" fill="none" stroke="rgba(74, 222, 128, 0.5)" strokeWidth="0.5" strokeDasharray="3,3" />
          <text x="11" y="14" fill="rgba(74, 222, 128, 0.8)" fontSize="2.5" fontFamily="sans-serif">
            Title Safe (80%)
          </text>

          {/* Center Cross */}
          <line x1="48" y1="50" x2="52" y2="50" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="0.5" />
          <line x1="50" y1="48" x2="50" y2="52" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="0.5" />
        </svg>
      )}
    </div>
  );
}
