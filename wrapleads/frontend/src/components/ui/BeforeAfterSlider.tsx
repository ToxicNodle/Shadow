import { useRef, useState, useCallback, useEffect } from 'react';

interface Props {
  before: string;
  after: string;
  border?: string;
}

export default function BeforeAfterSlider({ before, after, border }: Props) {
  const [pct, setPct] = useState(50);
  const [dragging, setDragging] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const updateFromClientX = useCallback((clientX: number) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPct(Math.max(0, Math.min(100, next)));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const cx = e instanceof MouseEvent ? e.clientX : e.touches[0]?.clientX;
      if (cx != null) updateFromClientX(cx);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, updateFromClientX]);

  return (
    <div
      ref={boxRef}
      style={{
        position: 'relative',
        userSelect: 'none',
        touchAction: 'none',
        borderRadius: 10,
        overflow: 'hidden',
        border: border || '1px solid var(--border)',
        cursor: 'ew-resize',
        background: '#000',
        // gpt-image-1 returns 1536×1024 (3:2). Lock the container to that
        // aspect so the BEFORE and AFTER images cover the same area and the
        // slider reveals an aligned crop regardless of the source photo's
        // native aspect ratio.
        aspectRatio: '3 / 2',
        width: '100%',
      }}
      onMouseDown={(e) => { setDragging(true); updateFromClientX(e.clientX); }}
      onTouchStart={(e) => { setDragging(true); const t = e.touches[0]; if (t) updateFromClientX(t.clientX); }}
    >
      {/* AFTER image — fills the box */}
      <img
        src={after}
        alt="wrap concept"
        draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {/* BEFORE image — same coverage, clipped from the right by pct */}
      <img
        src={before}
        alt="original"
        draggable={false}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          clipPath: `inset(0 ${100 - pct}% 0 0)`,
          WebkitClipPath: `inset(0 ${100 - pct}% 0 0)`,
        }}
      />

      {/* Vertical divider */}
      <div
        style={{
          position: 'absolute',
          top: 0, bottom: 0,
          left: `calc(${pct}% - 1px)`,
          width: 2,
          background: '#fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,.25)',
          pointerEvents: 'none',
        }}
      />
      {/* Drag handle */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: `calc(${pct}% - 18px)`,
          width: 36, height: 36,
          borderRadius: '50%',
          background: '#fff',
          border: '2px solid rgba(0,0,0,.15)',
          boxShadow: '0 2px 10px rgba(0,0,0,.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: 'translateY(-50%)',
          fontSize: 14, fontWeight: 800, color: '#333',
          pointerEvents: 'none',
        }}
      >
        ⇆
      </div>

      <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', padding: '3px 8px', borderRadius: 4 }}>
        BEFORE
      </div>
      <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', padding: '3px 8px', borderRadius: 4 }}>
        AFTER
      </div>
    </div>
  );
}
