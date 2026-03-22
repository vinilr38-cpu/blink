// Type declarations for AMP (Accelerated Mobile Pages) custom elements.
// AMP elements are not standard HTML elements but are used in AMP-compatible pages.
// In a standard React/Vite app these render as unknown custom elements (benign no-ops).

import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'amp-ad': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          width?: string;
          height?: string | number;
          type?: string;
          'data-ad-client'?: string;
          'data-ad-slot'?: string;
          'data-auto-format'?: string;
          'data-full-width'?: string;
          layout?: string;
        },
        HTMLElement
      >;
    }
  }
}
