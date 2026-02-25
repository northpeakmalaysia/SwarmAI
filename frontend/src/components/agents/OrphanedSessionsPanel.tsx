import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, RefreshCw, FolderX, CheckCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import api from '../../services/api';
import { formatDateTime } from '@/utils/dateFormat';

interface OrphanedSession {
  sessionId: string;
  folderName: string;
  sizeBytes: number;
  sizeFormatted: string;
  lastModified: string;
}

interface OrphanedSessionsResponse {
  sessions: OrphanedSession[];
  count: number;
  totalSize: number;
  totalSizeFormatted: string;
}

interface OrphanedSessionsPanelProps {
  onComplete?: () => void;
  className?: string;
}

export const OrphanedSessionsPanel: React.FC<OrphanedSessionsPanelProps> = ({
  onComplete,
  className,
}) => {
  const [sessions, setSessions] = useState<OrphanedSession[]>([]);
  const [totalSize, setTotalSize] = useState<string>('0 B');
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isCleaningAll, setIsCleaningAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrphanedSessions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get<OrphanedSessionsResponse>('/platforms/orphaned-sessions');
      setSessions(response.data.sessions);
      setTotalSize(response.data.totalSizeFormatted);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch orphaned sessions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrphanedSessions();
  }, []);

  const handleDeleteSession = async (sessionId: string) => {
    setIsDeleting(sessionId);
    try {
      await api.delete(`/platforms/orphaned-sessions/${sessionId}`);
      setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
      if (sessions.length === 1) {
        onComplete?.();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete session');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleCleanAll = async () => {
    setIsCleaningAll(true);
    try {
      await api.delete('/platforms/orphaned-sessions');
      setSessions([]);
      onComplete?.();
    } catch (err: any) {
      setError(err.message || 'Failed to clean all sessions');
    } finally {
      setIsCleaningAll(false);
    }
  };

  const formatDate = (dateString: string) => {
    return formatDateTime(dateString);
  };

  if (isLoading) {
    return (
      <div className={cn('p-6', className)}>
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Scanning for orphaned sessions...</span>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className={cn('p-6', className)}>
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <CheckCircle className="w-12 h-12 text-green-500" />
          <h3 className="text-lg font-medium text-white">No Orphaned Sessions</h3>
          <p className="text-sm text-gray-400">
            All WhatsApp session folders are properly linked to platform accounts.
          </p>
          <Button variant="ghost" size="sm" onClick={fetchOrphanedSessions}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('p-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FolderX className="w-5 h-5 text-amber-500" />
          <h3 className="text-lg font-medium text-white">Orphaned Sessions</h3>
          <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full">
            {sessions.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchOrphanedSessions}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleCleanAll}
            disabled={isCleaningAll}
          >
            {isCleaningAll ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            Clean All ({totalSize})
          </Button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Description */}
      <p className="text-sm text-gray-400 mb-4">
        These session folders exist on disk but have no matching platform account in the database.
        They may have been left behind when agents were deleted. Cleaning them up will free disk space
        and prevent connection errors.
      </p>

      {/* Sessions list */}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {sessions.map((session) => (
          <Card
            key={session.sessionId}
            variant="default"
            className="p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {session.folderName}
                </p>
                <p className="text-xs text-gray-500">
                  {session.sizeFormatted} | Last modified: {formatDate(session.lastModified)}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteSession(session.sessionId)}
              disabled={isDeleting === session.sessionId}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              {isDeleting === session.sessionId ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default OrphanedSessionsPanel;
