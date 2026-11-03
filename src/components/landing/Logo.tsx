import type { ComponentProps } from "react";

/**
 * The Berthwise mark, traced from Berthwise-Logo.png (≤0.35px off; master copy: public/berthwise-logo.svg).
 * The hull follows the text colour by default so it inverts with the theme; the two bands stay green.
 */
export function LogoMark({ body = "currentColor", accent = "#9cb800", ...rest }: { body?: string; accent?: string } & ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 993 930" {...rest}>
      <path fill={accent} d="M2 0H993V37H3.4L2 30Z" />
      <path fill={body} d="M3.4 37C26.9 475.7 520.7 735.9 864.6 735.9C380.4 735.9 65.3 783.4 8.9 893H993V37Z" />
      <path fill={accent} d="M8.9 893C4.1 902.5 1.1 912.4 0.2 922.8V930H993V893Z" />
    </svg>
  );
}
