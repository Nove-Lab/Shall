import * as React from "react"

const NARROW_BREAKPOINT = 1100

/**
 * True once the viewport is too narrow to spend a full sidebar on navigation.
 * Mirrors `useIsMobile`, one step above its breakpoint: mobile swaps the
 * sidebar for a sheet, narrow only collapses it to its icon rail.
 */
export function useIsNarrow() {
  const [isNarrow, setIsNarrow] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsNarrow(window.innerWidth < NARROW_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsNarrow(window.innerWidth < NARROW_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isNarrow
}
