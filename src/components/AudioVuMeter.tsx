import React, { useEffect, useState, useRef } from "react";

interface AudioVuMeterProps {
  analyser: AnalyserNode | null;
  playing: boolean;
  orientation?: "horizontal" | "vertical";
  muted?: boolean;
  onToggleMute?: () => void;
}

export default function AudioVuMeter({
  analyser,
  playing,
  orientation = "horizontal",
  muted = false,
  onToggleMute,
}: AudioVuMeterProps) {
  const [levelL, setLevelL] = useState(-60);
  const [levelR, setLevelR] = useState(-60);
  const [clipped, setClipped] = useState(false);
  const clipTimeout = useRef<number | null>(null);

  useEffect(() => {
    if (!analyser || !playing || muted) {
      setLevelL(-60);
      setLevelR(-60);
      return;
    }

    let frameId: number;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    const updateMeter = () => {
      analyser.getFloatTimeDomainData(dataArray);

      let peak = 0;
      for (let i = 0; i < bufferLength; i++) {
        const val = Math.abs(dataArray[i]);
        if (val > peak) peak = val;
      }

      // Convert linear amplitude to dB
      const db = peak > 0.0001 ? Math.max(-60, 20 * Math.log10(peak)) : -60;

      // Simulate subtle L/R variance for stereo visual liveliness
      const variance = (Math.random() - 0.5) * 1.5;
      const dbL = Math.min(0, db + (db > -50 ? variance : 0));
      const dbR = Math.min(0, db - (db > -50 ? variance : 0));

      setLevelL(dbL);
      setLevelR(dbR);

      if (db >= -0.2) {
        setClipped(true);
        if (clipTimeout.current) window.clearTimeout(clipTimeout.current);
        clipTimeout.current = window.setTimeout(() => setClipped(false), 800);
      }

      frameId = requestAnimationFrame(updateMeter);
    };

    frameId = requestAnimationFrame(updateMeter);
    return () => {
      cancelAnimationFrame(frameId);
      if (clipTimeout.current) window.clearTimeout(clipTimeout.current);
    };
  }, [analyser, playing, muted]);

  // Convert dB (-60 to 0) to percentage (0 to 100%)
  const toPercent = (db: number) => {
    if (db <= -60 || muted) return 0;
    return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  };

  const pctL = toPercent(levelL);
  const pctR = toPercent(levelR);
  const peakDb = Math.round(Math.max(levelL, levelR));

  const tooltip = muted
    ? "Audio Dibisukan (Muted) · Klik untuk membunyikan"
    : `Audio Peak: ${peakDb} dB · Klik untuk ${muted ? "aktifkan" : "bisukan"} suara`;

  if (orientation === "horizontal") {
    return (
      <div
        className={`player-vu-meter is-horizontal ${muted ? "is-muted" : ""}`}
        title={tooltip}
        onClick={onToggleMute}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleMute?.();
          }
        }}
      >
        <div className="vu-bars-container">
          {/* Left Channel */}
          <div className="vu-track">
            <div className="vu-fill" style={{ width: `${pctL}%` }} />
          </div>
          {/* Right Channel */}
          <div className="vu-track">
            <div className="vu-fill" style={{ width: `${pctR}%` }} />
          </div>
        </div>

        {/* Clip Indicator LED */}
        <div
          className={`vu-clip-led ${clipped && !muted ? "active" : ""}`}
          title={clipped ? "Audio Clipping! (> 0dB)" : "Normal"}
        />
      </div>
    );
  }

  return (
    <div
      className={`player-vu-meter is-vertical ${muted ? "is-muted" : ""}`}
      title={tooltip}
      onClick={onToggleMute}
    >
      {/* Clip Indicator LED */}
      <div className={`vu-clip-led ${clipped && !muted ? "active" : ""}`} title={clipped ? "Audio Clipping! (> 0dB)" : "Normal"} />

      {/* Meter Bars */}
      <div className="vu-bars-container">
        {/* Left Channel */}
        <div className="vu-track">
          <div className="vu-fill" style={{ height: `${pctL}%` }} />
        </div>
        {/* Right Channel */}
        <div className="vu-track">
          <div className="vu-fill" style={{ height: `${pctR}%` }} />
        </div>
      </div>

      {/* dB Ticks */}
      <div className="vu-ticks">
        <span>0</span>
        <span>-6</span>
        <span>-12</span>
        <span>-24</span>
        <span>-36</span>
        <span>-60</span>
      </div>
    </div>
  );
}
