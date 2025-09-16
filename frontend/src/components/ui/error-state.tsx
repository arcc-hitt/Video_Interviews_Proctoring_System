import * as React from "react"
import { AlertCircle, X } from "lucide-react"
import { cn } from "../../lib/utils"
import { Button } from "./button"

export interface ErrorStateProps {
  error: string
  onDismiss?: () => void
  className?: string
  variant?: "destructive" | "warning"
}

const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  ({ error, onDismiss, className, variant = "destructive", ...props }, ref) => {
    const variantClasses = {
      destructive: "bg-red-50 border-red-200 text-red-800",
      warning: "bg-yellow-50 border-yellow-200 text-yellow-800"
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-start gap-3 rounded-lg border p-4",
          variantClasses[variant],
          className
        )}
        {...props}
      >
        <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium">Error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
        {onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="h-6 w-6 p-0 hover:bg-transparent"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Dismiss</span>
          </Button>
        )}
      </div>
    )
  }
)

ErrorState.displayName = "ErrorState"

export { ErrorState }