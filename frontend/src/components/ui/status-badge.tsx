import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const statusBadgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      status: {
        completed: "border-transparent bg-green-100 text-green-800 hover:bg-green-200",
        terminated: "border-transparent bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
        active: "border-transparent bg-blue-100 text-blue-800 hover:bg-blue-200",
        failed: "border-transparent bg-red-100 text-red-800 hover:bg-red-200",
        pending: "border-transparent bg-gray-100 text-gray-800 hover:bg-gray-200",
      },
    },
    defaultVariants: {
      status: "completed",
    },
  }
)

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statusBadgeVariants> {
  status?: 'completed' | 'terminated' | 'active' | 'failed' | 'pending'
}

const StatusBadge = React.forwardRef<HTMLDivElement, StatusBadgeProps>(
  ({ className, status, children, ...props }, ref) => {
    return (
      <div 
        className={cn(statusBadgeVariants({ status }), className)} 
        ref={ref}
        {...props}
      >
        {children || status}
      </div>
    )
  }
)
StatusBadge.displayName = "StatusBadge"

export { StatusBadge, statusBadgeVariants }