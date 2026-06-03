import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import type { RoiResult } from '../../utils/wrapRoi';
import { roiHtml } from '../../utils/wrapRoi';

interface Brand {
  name: string;
  domain: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  tagline: string;
}

interface Variant {
  style: string;
  label: string;
  image_url: string;
}

interface Props {
  brand: Brand;
  pickedVariant: Variant;
  roi: RoiResult | null;
}

interface Share {
  token: string;
  url: string;
  // Snapshot of the inputs the share was minted from. Used to detect when the
  // user picks a different variant / changes the ROI vehicle and the QR needs
  // a refresh to stay truthful.
  variantStyle: string;
  vehicleType: string | null;
}

export default function QrLeaveBehind({ brand, pickedVariant, roi }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const [share, setShare] = useState<Share | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const currentVehicle = roi?.spec.value ?? null;
  const stale = !!share && (share.variantStyle !== pickedVariant.style || share.vehicleType !== currentVehicle);

  async function mint() {
    setLoading(true);
    setErr(null);
    try {
      const { token, url } = await api.createPitchShare({
        company_name: brand.name,
        domain: brand.domain || null,
        logo_url: brand.logo_url || null,
        primary_color: brand.primary_color,
        secondary_color: brand.secondary_color,
        tagline: brand.tagline || null,
        mockup_url: pickedVariant.image_url,
        roi_html: roi ? roiHtml(roi, brand.primary_color) : null,
        vehicle_type: currentVehicle,
      });
      const dataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 360,
        color: { dark: brand.primary_color || '#111', light: '#ffffff' },
      });
      if (!mountedRef.current) return;
      setShare({ token, url, variantStyle: pickedVariant.style, vehicleType: currentVehicle });
      setQrDataUrl(dataUrl);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  async function copy() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
      showToast('Pitch link copied', 'success');
    } catch {
      showToast('Could not copy', 'error');
    }
  }

  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          📱 QR leave-behind
        </div>
        {stale && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Out of date
          </span>
        )}
      </div>

      {!share && !loading && (
        <>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>
            Show the prospect a code they can scan with their phone — they'll get the mockup,
            the ROI math, and a quote form. Submissions land in your CRM instantly.
          </p>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: 12, background: brand.primary_color, borderColor: brand.primary_color }}
            onClick={mint}
          >
            Generate QR for {brand.name}
          </button>
        </>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
          <span className="spinner" style={{ width: 16, height: 16 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Minting share link…</span>
        </div>
      )}

      {err && !loading && (
        <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>
          {err}
          <button className="btn" style={{ marginLeft: 8, fontSize: 11, padding: '4px 8px' }} onClick={mint}>Retry</button>
        </div>
      )}

      {share && qrDataUrl && !loading && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 130, height: 130, flexShrink: 0, background: '#fff', borderRadius: 10, padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={qrDataUrl} alt="QR code" style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Have them scan with their camera
            </div>
            <div style={{
              fontFamily: 'monospace', fontSize: 11, color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              background: 'var(--bg-card)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)',
            }}>
              {share.url}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 11, padding: '6px 8px' }} onClick={copy}>
                Copy link
              </button>
              {stale ? (
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, justifyContent: 'center', fontSize: 11, padding: '6px 8px', background: brand.primary_color, borderColor: brand.primary_color }}
                  onClick={mint}
                >
                  Refresh QR
                </button>
              ) : (
                <a
                  className="btn"
                  href={share.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ flex: 1, justifyContent: 'center', fontSize: 11, padding: '6px 8px', textDecoration: 'none' }}
                >
                  Open
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
