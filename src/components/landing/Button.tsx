import type { ComponentProps, ReactNode } from "react";

type Variant = "dark" | "light";

/**
 * Lassie's CTA: a label tile plus a chevron tile tucked behind it (-36px margin)
 * that slides out on hover/focus. Light buttons invert to dark on hover.
 */
function Parts({ children, variant, chevron }: { children: ReactNode; variant: Variant; chevron: boolean }) {
  return (
    <>
      <span className={`btn-label btn-${variant}`}>{children}</span>
      {chevron && (
        <span aria-hidden="true" className={`btn-chevron btn-${variant}`}>
          <svg viewBox="0 0 20 20" fill="none">
            <path
              d="M7.69345 4.09943C8.9391 6.25004 10.7089 8.05064 12.8376 9.33325L13.0719 9.47421C13.2562 9.58525 13.3687 9.78513 13.3687 10.0003C13.3686 10.2154 13.2561 10.4147 13.0719 10.5258L12.8376 10.6667C10.7089 11.9493 8.93909 13.75 7.69345 15.9006L6.63135 15.2854C7.86108 13.1624 9.56324 11.3559 11.6006 10.0003C9.56325 8.64472 7.86108 6.83823 6.63135 4.71517L7.69345 4.09943Z"
              fill="currentColor"
            />
          </svg>
        </span>
      )}
    </>
  );
}

type Common = { variant?: Variant; chevron?: boolean; className?: string; children: ReactNode };

export function ButtonLink({ variant = "dark", chevron = true, className = "", children, ...rest }: Common & ComponentProps<"a">) {
  return (
    <a className={`btn ${className}`} {...rest}>
      <Parts variant={variant} chevron={chevron}>
        {children}
      </Parts>
    </a>
  );
}

export function Button({ variant = "dark", chevron = false, className = "", children, ...rest }: Common & ComponentProps<"button">) {
  return (
    <button className={`btn ${className}`} {...rest}>
      <Parts variant={variant} chevron={chevron}>
        {children}
      </Parts>
    </button>
  );
}
