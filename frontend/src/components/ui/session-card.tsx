import * as React from "react"
import { Clock, User, Calendar, Download, FileText, ExternalLink } from "lucide-react"
import { cn } from "../../lib/utils"
import { Card, CardContent, CardHeader } from "./card"
import { Badge } from "./badge"
import { Button } from "./button"
import { StatusBadge } from "./status-badge"

export interface SessionCardProps {
  session: {
    sessionId: string
    candidateName: string
    startTime: string | Date
    endTime?: string | Date
    duration?: number
    status: 'completed' | 'terminated' | 'active'
    recordingUrl?: string | null
    reportId?: string | null
  }
  onDownloadReport?: (reportId: string) => void
  className?: string
}

const formatDuration = (seconds?: number) => {
  if (!seconds && seconds !== 0) return '-'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

const formatDateTime = (date: string | Date) => {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
}

export const SessionCard = React.forwardRef<HTMLDivElement, SessionCardProps>(
  ({ session, onDownloadReport, className, ...props }, ref) => {
    const getRecordingUrl = (url?: string | null) => {
      if (!url) return null
      return url.startsWith('http') 
        ? url 
        : `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}${url}`
    }

    return (
      <Card ref={ref} className={cn("hover:shadow-md transition-shadow", className)} {...props}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-lg text-foreground">
                  {session.candidateName}
                </h3>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDateTime(session.startTime)}</span>
                </div>
                {session.duration && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatDuration(session.duration)}</span>
                  </div>
                )}
              </div>
            </div>
            <StatusBadge status={session.status} />
          </div>
        </CardHeader>
        
        <CardContent className="pt-0">
          <div className="space-y-3">
            {/* Session Metadata */}
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Session ID:</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {session.sessionId.slice(0, 8)}...
                </Badge>
              </div>
              {session.endTime && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Ended:</span>
                  <span className="text-sm">{formatDateTime(session.endTime)}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              {getRecordingUrl(session.recordingUrl) ? (
                <Button 
                  variant="outline" 
                  size="sm" 
                  asChild
                  className="text-xs"
                >
                  <a
                    href={getRecordingUrl(session.recordingUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1"
                  >
                    <Download className="h-3 w-3" />
                    Recording
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              ) : (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  disabled
                  className="text-xs text-muted-foreground"
                >
                  <Download className="h-3 w-3" />
                  No Recording
                </Button>
              )}

              {session.reportId ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onDownloadReport?.(session.reportId!)}
                  className="text-xs"
                >
                  <FileText className="h-3 w-3" />
                  Report (PDF)
                </Button>
              ) : (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  disabled
                  className="text-xs text-muted-foreground"
                >
                  <FileText className="h-3 w-3" />
                  No Report
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }
)

SessionCard.displayName = "SessionCard"