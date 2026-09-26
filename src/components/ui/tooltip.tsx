"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { cn } from "cn"

// A short hint on hover or keyboard focus. Only ever explains; never the only way to learn something.
// `trigger` is the element it explains (e.g. a Button), rendered as-is.
function Tooltip({
  trigger,
  children,
  className,
}: {
  trigger: React.ReactElement<Record<string, unknown>>
  children: React.ReactNode
  className?: string
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger delay={300} render={trigger} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner sideOffset={8} className="z-50">
          <TooltipPrimitive.Popup
            className={cn(
              "max-w-64 rounded-lg bg-foreground px-3 py-2 text-base text-background shadow-md",
              className
            )}
          >
            {children}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export { Tooltip }
