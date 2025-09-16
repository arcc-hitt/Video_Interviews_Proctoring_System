import * as React from "react"
import { FileX, Calendar, AlertCircle } from "lucide-react"
import { cn } from "../../lib/utils"
import { Button } from "./button"

export interface EmptyStateProps {
  title?: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  icon?: "file" | "calendar" | "alert" | React.ReactNode
  className?: string
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ 
    title = "No data found", 
    description, 
    action, 
    icon = "file",
    className, 
    ...props 
  }, ref) => {
    const getIcon = () => {
      if (React.isValidElement(icon)) return icon
      
      const iconClasses = "h-12 w-12 text-muted-foreground/50 mb-4"
      
      switch (icon) {
        case "calendar":
          return <Calendar className={iconClasses} />
        case "alert":
          return <AlertCircle className={iconClasses} />
        case "file":
        default:
          return <FileX className={iconClasses} />
      }
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center py-12 text-center",
          className
        )}
        {...props}
      >
        {getIcon()}
        <h3 className="text-lg font-semibold text-foreground mb-2">
          {title}
        </h3>
        {description && (
          <p className="text-muted-foreground text-sm max-w-md mb-4">
            {description}
          </p>
        )}
        {action && (
          <Button onClick={action.onClick} variant="default">
            {action.label}
          </Button>
        )}
      </div>
    )
  }
)

EmptyState.displayName = "EmptyState"

export { EmptyState }