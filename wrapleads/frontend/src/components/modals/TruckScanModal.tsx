import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useImportCarrier } from '../../hooks/useCarriers';
import { useAppStore } from '../../store/useAppStore';

interface Props {
  onClose: () => void;
}

const CONFIDENCE_COLOR = { high: '#22c55e', medium: '#f59e0b', low: '#6b7280' };
const VEHICLE_LABELS: Record<string, string> = {
  box_truck: 'Box Truck', semi_trailer: 'Semi/Trailer', cargo_van: 'Cargo Van',
  pickup_truck: 'Pickup Truck', flatbed: 'Flatbed', tanker: 'Tanker', other: 'Commercial Vehicle',
};

export default function TruckScanModal({ onClose }: Props) {
  const qc = useQueryClient();
  const showToast = useAppStore((s) => s.showToast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  type ScanResult = Awaited<ReturnType<typeof api.scanTruck>>;
  const [result, setResult] = useState<ScanResult | null>(null);

  const importMutation = useImportCarrier();

  const scanMut = useMutation({
    mutationFn: (file: File) => api.scanTruck(file),
    onSuccess: (data) => setResult(data),
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    setResult(null);
    scanMut.mutate(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function importMatch(id: number) {
    importMutation.mutate(id, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['leads'] });
        showToast('Carrier imported to CRM!', 'success');
        onClose();
      },
    });
  }

  const ext = result?.extracted;
  const matches = result?.matches ?? [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🚛</span>
            <h2 className="modal-title">Truck Scan to Lead</h2>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Photograph any commercial truck. Claude Vision extracts the company name and DOT number, then finds the carrier in our 600K FMCSA database.
          </p>

          {/* Drop zone or preview */}
          {!scanMut.isPending && !result && (
            <div
              style={{
                border: `2px dashed ${isDragOver ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 10, padding: '28px 20px', textAlign: 'center',
                cursor: 'pointer', transition: 'border-color 0.15s',
                background: isDragOver ? 'rgba(99,102,241,0.04)' : 'transparent',
              }}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={onDrop}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>🚛📸</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                Drop a truck photo here
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                or click to browse · JPG, PNG, HEIC
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 6 }}>
                Works best with clear shots of the truck's side — company name + DOT visible
              </div>
            </div>
          )}

          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onInputChange} />

          {/* Loading */}
          {scanMut.isPending && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0' }}>
              {preview && <img src={preview} alt="" style={{ width: 180, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                <span className="spinner" style={{ width: 14, height: 14 }} />
                Claude is reading the truck…
              </div>
            </div>
          )}

          {/* Results */}
          {result && ext && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Photo + extraction */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {preview && (
                  <img src={preview} alt="Scanned truck" style={{ width: 100, height: 72, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--border)', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {ext.companyName ? (
                    <>
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2, marginBottom: 4 }}>
                        {ext.companyName}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {ext.dotNumber && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>DOT #{ext.dotNumber}</span>
                        )}
                        {ext.vehicleType && (
                          <span style={{ fontSize: 10, background: 'rgba(99,102,241,0.1)', color: '#818cf8', padding: '1px 6px', borderRadius: 3, fontWeight: 700 }}>
                            {VEHICLE_LABELS[ext.vehicleType] ?? ext.vehicleType}
                          </span>
                        )}
                        <span style={{ fontSize: 10, fontWeight: 700, color: CONFIDENCE_COLOR[ext.confidence] }}>
                          {ext.confidence === 'high' ? '✓ High confidence' : ext.confidence === 'medium' ? '~ Medium confidence' : '? Low confidence'}
                        </span>
                      </div>
                      {ext.city && ext.state && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                          {ext.city}, {ext.state}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      No company name detected. Try a clearer shot of the truck's side where the company name is visible.
                    </div>
                  )}
                </div>
              </div>

              {/* FMCSA matches */}
              {matches.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: 8 }}>
                    FMCSA Database Matches
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {matches.map((m) => (
                      <div key={m.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{m.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {m.city && m.state ? `${m.city}, ${m.state}` : m.state ?? ''}
                            {m.fleet_size ? ` · ${m.fleet_size} units` : ''}
                            {m.dot_number ? ` · DOT #${m.dot_number}` : ''}
                          </div>
                        </div>
                        {m.already_imported ? (
                          <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 700 }}>✓ In CRM</span>
                        ) : (
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: 11, padding: '4px 12px', flexShrink: 0 }}
                            onClick={() => importMatch(m.id)}
                            disabled={importMutation.isPending}
                          >
                            {importMutation.isPending ? '…' : '+ Import'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {matches.length === 0 && ext.companyName && (
                <div style={{ padding: '10px 12px', background: 'rgba(245,158,11,0.08)', borderRadius: 8, borderLeft: '3px solid #f59e0b' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', marginBottom: 3 }}>No FMCSA match found</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    "{ext.companyName}" isn't in our FMCSA database — they may be a local shop, private fleet, or not a motor carrier. You can still add them manually.
                  </div>
                </div>
              )}

              {/* Try again */}
              <button
                className="btn"
                style={{ alignSelf: 'flex-start', fontSize: 11 }}
                onClick={() => { setResult(null); setPreview(null); fileRef.current?.click(); }}
              >
                ↺ Scan another truck
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
