import * as React from "react"
import { Loader2 } from "lucide-react"
import { cn } from "../../lib/utils"

export interface LoadingStateProps {
  size?: "sm" | "md" | "lg"
  text?: string
  className?: string
}

const LoadingState = React.forwardRef<HTMLDivElement, LoadingStateProps>(
  ({ size = "md", text = "Loading...", className, ...props }, ref) => {
    const sizeClasses = {
      sm: "h-4 w-4",
      md: "h-8 w-8", 
      lg: "h-12 w-12"
    }

    const textSizeClasses = {
      sm: "text-sm",
      md: "text-base",
      lg: "text-lg"
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center py-12 text-muted-foreground",
          className
        )}
        {...props}
      >
        <Loader2 className={cn("animate-spin mb-3", sizeClasses[size])} />
        <p className={cn("font-medium", textSizeClasses[size])}>{text}</p>
      </div>
    )
  }
)

LoadingState.displayName = "LoadingState"

export { LoadingState }