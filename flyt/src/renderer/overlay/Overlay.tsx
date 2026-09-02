import { useEffect, useRef, useState } from 'react';
import type { OverlayState } from '../../shared/types';

const BARS = 22;

const IDLE: OverlayState = {
  visible: false,
  phase: 'idle',
  mode: 'hold',
  level: 0,
  speech: false,
  elapsedMs: 0,
  message: null,
  language: null,
  chunks: 0,
};

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Scrolling live waveform driven by the level reported by the main process. */
function Waveform({ level, speech }: { level: number; speech: boolean }) {
  const [bars, setBars] = useState<number[]>(() => new Array<number>(BARS).fill(0.08));
  const latest = useRef({ level, speech });
  latest.current = { level, speech };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (now - last > 45) {
        last = now;
        const { level: l, speech: sp } = latest.current;
        // Emphasise speech so the bars visibly react to talking, not room noise.
        const shaped = sp ? Math.min(1, 0.25 + l * 1.1) : Math.min(0.35, l * 0.6);
        const jitter = shaped * (0.75 + Math.random() * 0.5);
        setBars((prev) => [...prev.slice(1), Math.max(0.08, jitter)]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="wave" aria-hidden="true">
      {bars.map((h, i) => (
        <div key={i} className="bar" style={{ height: `${Math.round(h * 28)}px`, opacity: 0.45 + h * 0.55 }} />
      ))}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

function CrossIcon({ color }: { color: string }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function Overlay() {
  const [state, setState] = useState<OverlayState>(IDLE);

  useEffect(() => window.flyt.onOverlayState(setState), []);

  const listening = state.phase === 'listening';
  const classes = ['pill', state.visible ? 'visible' : '', state.phase === 'error' ? 'error' : ''].join(' ');

  return (
    <div className="stage">
      <div className={classes} role="status">
        {listening && <div className={['dot', state.speech ? 'speech' : '', state.mode === 'handsFree' ? 'handsFree' : ''].join(' ')} />}
        {state.phase === 'processing' && <div className="spinner" />}
        {state.phase === 'inserted' && <CheckIcon />}
        {(state.phase === 'error' || state.phase === 'cancelled' || state.phase === 'empty') && (
          <CrossIcon color={state.phase === 'error' ? '#f87171' : 'rgba(255,255,255,0.6)'} />
        )}

        {listening ? <Waveform level={state.level} speech={state.speech} /> : <div className="message">{state.message ?? (state.phase === 'processing' ? 'Transcribing…' : '')}</div>}

        <div className="meta">
          {state.mode === 'handsFree' && (listening || state.phase === 'processing') && <span className="badge mode">Hands-free</span>}
          {state.language && listening && <span className="badge">{state.language}</span>}
          {listening && <span className="time">{formatTime(state.elapsedMs)}</span>}
        </div>
      </div>
    </div>
  );
}
