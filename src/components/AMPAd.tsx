interface AMPAdProps {
    className?: string;
}

/**
 * AMPAd is intentionally a no-op in this React SPA.
 * AMP (amp-ad) elements require the AMP runtime and an <html amp> page —
 * they cannot function inside a standard React/Vite application.
 * Use the AdSense component for display ads instead.
 */
export function AMPAd(_props: AMPAdProps) {
    return null;
}

export default AMPAd;
