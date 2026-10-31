import { cn } from "@/lib/utils";

/** Radii of the gray tray and the white card nested in it (tray = card + its 4px inset). */
export const BANDEJA = "rounded-[1.375rem] border border-border bg-muted p-1";
export const BANDEJA_CUERPO = "rounded-[1.125rem] border border-border bg-background shadow-xs";

/**
 * A white card sitting in a gray tray, the title living on the tray
 * (2026-10-30 reference UIs). `suelta` drops the single white card so the
 * children (their own cards) sit straight on the tray.
 *
 * The body is shifted up 1px under its own top border, so a first row that
 * draws `border-t` doesn't double the hairline.
 */
export function Bandeja({
  titulo,
  sub,
  extra,
  suelta,
  className,
  cuerpoClassName,
  children,
}: {
  titulo?: React.ReactNode;
  sub?: React.ReactNode;
  extra?: React.ReactNode;
  suelta?: boolean;
  className?: string;
  cuerpoClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(BANDEJA, className)}>
      {(titulo || extra) && (
        <div className="flex items-center gap-3 px-3 pb-2.5 pt-2">
          <div className="min-w-0 flex-1">
            {titulo && <h2 className="text-[15px] font-semibold">{titulo}</h2>}
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          {extra}
        </div>
      )}
      {suelta ? (
        <div className={cn("space-y-1", cuerpoClassName)}>{children}</div>
      ) : (
        <div className={cn("overflow-hidden", BANDEJA_CUERPO, cuerpoClassName)}>
          <div className="-mt-px">{children}</div>
        </div>
      )}
    </section>
  );
}
