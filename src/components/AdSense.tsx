import { useEffect } from 'react';

declare global {
    interface Window {
        adsbygoogle: any[];
    }
}

interface AdSenseProps {
    className?: string;
}

export function AdSense({ className }: AdSenseProps) {
    useEffect(() => {
        try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) {
            console.error('AdSense initialization error:', e);
        }
    }, []);

    return (
        <div className={`adsense-container my-8 w-full flex justify-center overflow-hidden ${className}`}>
            {/* ADSENSE AD 1 */}
            <ins
                className="adsbygoogle"
                style={{ display: 'block' }}
                data-ad-client="ca-pub-2086879231987393"
                data-ad-slot="7499359522"
                data-ad-format="auto"
                data-full-width-responsive="true"
            ></ins>
        </div>
    );
}

export default AdSense;
