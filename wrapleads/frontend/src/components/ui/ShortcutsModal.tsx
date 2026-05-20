interface Props {
  onClose: () => void;
}

const SECTIONS = [
  {
    title: 'Navigation',
    rows: [
      { key: '1 – 8', desc: 'Switch views (Mission, Leads, Discover…)' },
      { key: '⌘ K', desc: 'Open command palette' },
      { key: '?', desc: 'Show keyboard shortcuts' },
    ],
  },
  {
    title: 'Lead Detail (when a lead is open)',
    rows: [
      { key: 'I', desc: 'Info tab' },
      { key: 'E', desc: 'Email tab' },
      { key: 'Q', desc: 'Quotes tab' },
      { key: 'A', desc: 'Activity tab' },
      { key: 'N', desc: 'Notes tab' },
      { key: 'D', desc: 'Design Studio tab' },
      { key: 'Esc', desc: 'Close lead detail' },
    ],
  },
  {
    title: 'Kanban Board',
    rows: [
      { key: 'Drag', desc: 'Move card to a new pipeline stage' },
      { key: 'Click', desc: 'Open lead detail' },
      { key: 'Hover score', desc: 'See score breakdown popover' },
    ],
  },
];

export default function ShortcutsModal({ onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Keyboard Shortcuts</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '12px 24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
                {section.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {section.rows.map((row) => (
                  <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0' }}>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0, minWidth: 90, justifyContent: 'flex-end' }}>
                      {row.key.split(' ').map((k, i) => (
                        <span key={i}>
                          {k === '–' || k === '–' ? (
                            <span style={{ color: 'var(--text-faint)', fontSize: 12 }}> – </span>
                          ) : (
                            <kbd style={{
                              display: 'inline-block', padding: '2px 7px', background: 'var(--bg-elev-2)',
                              border: '1px solid var(--border)', borderBottom: '2px solid var(--border)',
                              borderRadius: 4, fontSize: 11, fontFamily: 'var(--mono, monospace)',
                              color: 'var(--text)', lineHeight: 1.6,
                            }}>{k}</kbd>
                          )}
                        </span>
                      ))}
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{row.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-faint)', textAlign: 'center' }}>
            Press <kbd style={{ padding: '1px 5px', background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 3, fontSize: 10 }}>?</kbd> anytime to show this dialog
          </div>
        </div>
      </div>
    </div>
  );
}
