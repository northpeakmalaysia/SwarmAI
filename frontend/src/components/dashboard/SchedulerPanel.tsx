import { useEffect, useState } from 'react';
import { Clock, Calendar, Play, Pause, Timer, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDashboardStore, type DashboardSchedule, type ScheduleSummary } from '../../stores/dashboardStore';

interface SchedulerPanelProps {
  maxSchedules?: number;
}

export function SchedulerPanel({ maxSchedules = 3 }: SchedulerPanelProps) {
  const navigate = useNavigate();
  const { schedules, scheduleSummary, fetchSchedules } = useDashboardStore();
  const [countdown, setCountdown] = useState<string>('');

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // Update countdown timer every second
  useEffect(() => {
    if (!scheduleSummary?.nextExecution) return;

    const updateCountdown = () => {
      const nextRunAt = new Date(scheduleSummary.nextExecution!.nextRunAt);
      const now = new Date();
      const diffMs = nextRunAt.getTime() - now.getTime();

      if (diffMs <= 0) {
        setCountdown('Running now...');
        // Refresh schedules when countdown reaches zero
        fetchSchedules();
        return;
      }

      const seconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) {
        setCountdown(`${days}d ${hours % 24}h ${minutes % 60}m`);
      } else if (hours > 0) {
        setCountdown(`${hours}h ${minutes % 60}m ${seconds % 60}s`);
      } else if (minutes > 0) {
        setCountdown(`${minutes}m ${seconds % 60}s`);
      } else {
        setCountdown(`${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [scheduleSummary?.nextExecution, fetchSchedules]);

  const displaySchedules = schedules.slice(0, maxSchedules);

  if (!scheduleSummary || scheduleSummary.totalSchedules === 0) {
    return (
      <div className="bg-swarm-dark rounded-2xl border border-swarm-border/30 p-4 shadow-neu-pressed-glow">
        <h3 className="font-semibold mb-4 flex items-center gap-2 text-white">
          <Calendar className="w-4 h-4 text-swarm-primary" />
          Scheduled Flows
        </h3>
        <p className="text-xs text-gray-500">No scheduled flows</p>
        <button
          onClick={() => navigate('/flows')}
          className="mt-3 text-xs text-swarm-primary hover:text-swarm-primary/80 flex items-center gap-1"
        >
          Create a schedule <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-swarm-dark rounded-2xl border border-swarm-border/30 p-4 shadow-neu-pressed-glow">
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-white">
        <Calendar className="w-4 h-4 text-swarm-primary" />
        Scheduled Flows
      </h3>

      {/* Next Execution Highlight */}
      {scheduleSummary.nextExecution && (
        <div className="bg-swarm-card/50 rounded-lg p-3 mb-4 border border-swarm-primary/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">Next Execution</span>
            <div className="flex items-center gap-1 text-swarm-primary">
              <Timer className="w-3 h-3" />
              <span className="text-sm font-mono font-semibold">{countdown}</span>
            </div>
          </div>
          <div className="text-sm font-medium text-white truncate">
            {scheduleSummary.nextExecution.scheduleName || scheduleSummary.nextExecution.flowName}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {scheduleSummary.nextExecution.nextRunDescription}
          </div>
        </div>
      )}

      {/* Schedule Summary Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center">
          <div className="text-lg font-semibold text-white">{scheduleSummary.totalSchedules}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-emerald-400">{scheduleSummary.enabledSchedules}</div>
          <div className="text-xs text-gray-500">Active</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-gray-500">{scheduleSummary.disabledSchedules}</div>
          <div className="text-xs text-gray-500">Paused</div>
        </div>
      </div>

      {/* Schedule List */}
      <div className="space-y-2">
        {displaySchedules.map((schedule) => (
          <ScheduleItem key={schedule.id} schedule={schedule} />
        ))}
      </div>

      {/* View All Link */}
      {schedules.length > maxSchedules && (
        <button
          onClick={() => navigate('/flows?tab=schedules')}
          className="mt-3 w-full text-xs text-swarm-primary hover:text-swarm-primary/80 flex items-center justify-center gap-1"
        >
          View all {schedules.length} schedules <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

interface ScheduleItemProps {
  schedule: DashboardSchedule;
}

function ScheduleItem({ schedule }: ScheduleItemProps) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-swarm-border/20 last:border-0">
      <div className={`p-1.5 rounded ${schedule.enabled ? 'bg-emerald-500/20' : 'bg-gray-500/20'}`}>
        {schedule.enabled ? (
          <Play className="w-3 h-3 text-emerald-400" />
        ) : (
          <Pause className="w-3 h-3 text-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">
          {schedule.scheduleName || schedule.flowName}
        </div>
        <div className="text-xs text-gray-500 truncate">
          {schedule.cronDescription}
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs text-gray-400">
          {schedule.enabled ? schedule.countdownFormatted : 'Paused'}
        </div>
      </div>
    </div>
  );
}
