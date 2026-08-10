/**
 * The shape a surface takes before it has anything to show. Every panel and
 * plane has one, so an empty Shall still reads as the finished layout.
 */
export function EmptyState({
  message,
  hint,
  className,
}: {
  message: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={
        "flex flex-col items-center justify-center gap-1 px-6 py-10 text-center" +
        (className ? ` ${className}` : "")
      }
    >
      <p className="text-muted-foreground text-sm">{message}</p>
      {hint ? <p className="text-muted-foreground/70 text-xs">{hint}</p> : null}
    </div>
  );
}
