'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────
export type PoseFrame = { results: any; timestamp: number };

interface AvatarMirrorProps {
  getFrame:     () => any;
  poseBuffer:   PoseFrame[];
  isRecording:  boolean;
  onRedo:       () => void;
  replaySpeed?: number;
}

type ReplayState = 'idle' | 'playing' | 'done';

const TEAL = '#00D4AA';
const WHITE = '#ffffff';
const NAVY  = '#0A1628';

// ─── Skeleton connection maps ─────────────────────────────────
const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 23], [12, 24],
  [23, 24],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
];

const POSE_JOINT_INDICES = [11, 12, 13, 14, 15, 16, 23, 24];

const HAND_CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

const FACE_OVAL = [
  10,338,297,332,284,251,389,356,454,
  323,361,288,397,365,379,378,400,377,
  152,148,176,149,150,136,172,58,132,
  93,234,127,162,21,54,103,67,109,
];

// ─── Frame interpolation ──────────────────────────────────────
// Used for both EMA (live) and per-segment (replay) smoothing.
function lerpLandmarks(a: any[] | null, b: any[] | null, t: number): any[] | null {
  if (!b) return null;                        // target gone → stop drawing
  if (!a || a.length !== b.length) return b;  // no previous → snap to new
  return a.map((lm, i) => ({
    x: lm.x + (b[i].x - lm.x) * t,
    y: lm.y + (b[i].y - lm.y) * t,
    z: (lm.z ?? 0) + ((b[i].z ?? 0) - (lm.z ?? 0)) * t,
    visibility: b[i].visibility,
  }));
}

function lerpResults(a: any | null, b: any | null, t: number): any | null {
  if (!a) return b;
  if (!b) return a;
  return {
    poseLandmarks:      lerpLandmarks(a.poseLandmarks,      b.poseLandmarks,      t),
    leftHandLandmarks:  lerpLandmarks(a.leftHandLandmarks,  b.leftHandLandmarks,  t),
    rightHandLandmarks: lerpLandmarks(a.rightHandLandmarks, b.rightHandLandmarks, t),
    faceLandmarks:      b.faceLandmarks,
  };
}

// ─── Draw ─────────────────────────────────────────────────────
// All MediaPipe Holistic landmarks are in normalised image-space [0,1].
// w/h are *logical* (CSS) pixels; the canvas transform already handles DPR.
function drawFrame(
  ctx:     CanvasRenderingContext2D,
  results: any,
  w:       number,
  h:       number,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, w, h);

  if (!results) {
    ctx.fillStyle    = 'rgba(255,255,255,0.18)';
    ctx.font         = '11px system-ui, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Stand in frame', w / 2, h / 2);
    return;
  }

  // Mirror: avatar is a selfie reflection
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);

  const px = (lm: any) => lm.x * w;
  const py = (lm: any) => lm.y * h;

  // ── Face oval ──────────────────────────────────────────────
  const face = results.faceLandmarks;
  if (Array.isArray(face) && face.length > 0) {
    ctx.beginPath();
    let moved = false;
    for (const idx of FACE_OVAL) {
      const lm = face[idx];
      if (!lm) continue;
      if (!moved) { ctx.moveTo(px(lm), py(lm)); moved = true; }
      else          ctx.lineTo(px(lm), py(lm));
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }

  // ── Body skeleton ──────────────────────────────────────────
  const pose = results.poseLandmarks;
  if (Array.isArray(pose) && pose.length > 0) {
    ctx.strokeStyle = TEAL;
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    for (const [a, b] of POSE_CONNECTIONS) {
      const la = pose[a], lb = pose[b];
      if (!la || !lb) continue;
      ctx.beginPath();
      ctx.moveTo(px(la), py(la));
      ctx.lineTo(px(lb), py(lb));
      ctx.stroke();
    }
    ctx.fillStyle = WHITE;
    for (const idx of POSE_JOINT_INDICES) {
      const lm = pose[idx];
      if (!lm) continue;
      ctx.beginPath();
      ctx.arc(px(lm), py(lm), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Hands ──────────────────────────────────────────────────
  const drawHand = (landmarks: any[], lineColor: string) => {
    if (!Array.isArray(landmarks) || landmarks.length === 0) return;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    for (const [a, b] of HAND_CONNECTIONS) {
      const la = landmarks[a], lb = landmarks[b];
      if (!la || !lb) continue;
      ctx.beginPath();
      ctx.moveTo(px(la), py(la));
      ctx.lineTo(px(lb), py(lb));
      ctx.stroke();
    }
    ctx.fillStyle = lineColor;
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (!lm) continue;
      ctx.beginPath();
      ctx.arc(px(lm), py(lm), i === 0 ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  drawHand(results.leftHandLandmarks,  TEAL);
  drawHand(results.rightHandLandmarks, WHITE);

  ctx.restore();
}

// ─── Component ────────────────────────────────────────────────
export default function AvatarMirror({
  getFrame,
  poseBuffer,
  isRecording,
  onRedo,
  replaySpeed = 1.0,
}: AvatarMirrorProps) {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const replayFrameRef = useRef<any>(null);
  const isReplayingRef = useRef(false);
  const replayBufRef   = useRef<PoseFrame[]>([]);
  const slowMoRef      = useRef(false);
  const playbackIdRef  = useRef(0);          // invalidates stale replay loops

  const [replayState, setReplayState] = useState<ReplayState>('idle');
  const [progress,    setProgress]    = useState(0);
  const [slowMo,      setSlowMo]      = useState(false);

  // ── Canvas sizing — accounts for device pixel ratio ───────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => {
      const dpr     = window.devicePixelRatio || 1;
      canvas.width  = Math.round(canvas.offsetWidth  * dpr);
      canvas.height = Math.round(canvas.offsetHeight * dpr);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Draw loop ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let id: number;

    const tick = () => {
      id = requestAnimationFrame(tick);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w   = canvas.width  / dpr;
      const h   = canvas.height / dpr;

      // MediaPipe has smoothLandmarks:true — landmarks are already temporally
      // smoothed before we receive them. Draw directly; no extra EMA needed.
      const frame = isReplayingRef.current ? replayFrameRef.current : getFrame();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFrame(ctx, frame, w, h);
    };

    tick();
    return () => cancelAnimationFrame(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Replay ────────────────────────────────────────────────
  const triggerReplay = useCallback((buf: PoseFrame[]) => {
    if (!buf.length) return;

    // Each replay gets a unique ID so stale loops exit cleanly
    const pid = ++playbackIdRef.current;

    // Pre-set first frame so the draw loop never shows a blank flash
    replayFrameRef.current = buf[0].results;
    isReplayingRef.current = true;
    replayBufRef.current   = buf;
    setReplayState('playing');
    setProgress(0);

    const firstTs   = buf[0].timestamp;
    const totalMs   = buf[buf.length - 1].timestamp - firstTs;
    const startWall = performance.now();

    const runLoop = () => {
      // Exit if this replay has been superseded or cancelled
      if (!isReplayingRef.current || playbackIdRef.current !== pid) return;

      const speed   = slowMoRef.current ? 0.5 : replaySpeed;
      const elapsed = (performance.now() - startWall) * speed;

      let idx = 0;
      while (idx < buf.length - 1 && buf[idx + 1].timestamp - firstTs <= elapsed) idx++;

      // Interpolate between buf[idx] and buf[idx+1] for per-segment smoothness
      const nextIdx = Math.min(idx + 1, buf.length - 1);
      if (nextIdx > idx) {
        const segStart = buf[idx].timestamp     - firstTs;
        const segEnd   = buf[nextIdx].timestamp - firstTs;
        const t = segEnd > segStart
          ? Math.min((elapsed - segStart) / (segEnd - segStart), 1)
          : 1;
        replayFrameRef.current = lerpResults(buf[idx].results, buf[nextIdx].results, t);
      } else {
        replayFrameRef.current = buf[idx].results;
      }

      setProgress(Math.min((elapsed / Math.max(totalMs / speed, 1)) * 100, 100));

      if (idx >= buf.length - 1) {
        isReplayingRef.current = false;
        setReplayState('done');
        setProgress(100);
        return;
      }
      requestAnimationFrame(runLoop);
    };
    requestAnimationFrame(runLoop);
  }, [replaySpeed]);

  useEffect(() => {
    if (isRecording) {
      isReplayingRef.current = false;
      replayFrameRef.current = null;
      setReplayState('idle');
      setProgress(0);
      setSlowMo(false);
      slowMoRef.current = false;
      return;
    }
    if (poseBuffer.length > 0) triggerReplay(poseBuffer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, poseBuffer]);

  const handleSlowMoToggle = () => {
    const next = !slowMo;
    setSlowMo(next);
    slowMoRef.current = next;
    if (replayBufRef.current.length) {
      triggerReplay(replayBufRef.current);
    }
  };

  const handleReplayAgain = () => {
    const buf = replayBufRef.current;
    if (buf.length) {
      triggerReplay(buf); // playbackId handles stale loop cleanup
    } else {
      onRedo();
    }
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full" style={{ background: NAVY }}>

      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />

      {isRecording && (
        <div className="absolute top-2 inset-x-0 flex justify-center pointer-events-none">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(0,212,170,0.18)',
              color:      TEAL,
              border:     `1px solid ${TEAL}44`,
            }}
          >
            Signing…
          </span>
        </div>
      )}

      {replayState === 'playing' && (
        <>
          <div className="absolute top-2 inset-x-0 flex justify-center pointer-events-none">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(0,212,170,0.85)', color: NAVY }}
            >
              Replaying…
            </span>
          </div>
          <div
            className="absolute bottom-1 inset-x-2 h-1 rounded-full pointer-events-none"
            style={{ background: 'rgba(255,255,255,0.12)' }}
          >
            <div
              className="h-1 rounded-full"
              style={{ width: `${progress}%`, background: TEAL, transition: 'width 80ms linear' }}
            />
          </div>
          <button
            onClick={handleSlowMoToggle}
            className="absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded-full z-20"
            style={{ background: 'rgba(0,0,0,0.6)', color: TEAL, border: `1px solid ${TEAL}` }}
          >
            {slowMo ? '1x' : '0.5x'}
          </button>
        </>
      )}

      {replayState === 'done' && (
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2 gap-1.5">
          <button
            onClick={handleReplayAgain}
            className="py-1.5 px-5 rounded-lg text-xs font-bold"
            style={{ background: 'rgba(255,255,255,0.12)', color: WHITE }}
          >
            Replay
          </button>
        </div>
      )}
    </div>
  );
}
