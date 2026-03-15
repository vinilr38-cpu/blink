declare global {
    namespace JSX {
        interface IntrinsicElements {
            'amp-ad': any;
        }
    }
}

interface AMPAdProps {
    className?: string;
}

export function AMPAd({ className }: AMPAdProps) {
    return (
        <div className={`amp-ad-container my-8 w-full flex justify-center overflow-hidden ${className}`}>
            {/* @ts-ignore - AMP elements are custom elements */}
            <amp-ad
                width="100vw"
                height="320"
                type="adsense"
                data-ad-client="ca-pub-2086879231987393"
                data-ad-slot="7499359522"
                data-auto-format="rspv"
                data-full-width=""
            >
                {/* @ts-ignore */}
                <div overflow=""></div>
            </amp-ad>
        </div>
    );
}

export default AMPAd;
