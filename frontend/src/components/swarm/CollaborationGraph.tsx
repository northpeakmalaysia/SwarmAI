import { useMemo, useState, useEffect, useRef } from 'react';
import { Network } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAgentStore, type Agent } from '../../stores/agentStore';
import { useSwarmStore, type LeaderboardEntry, type SwarmHandoff } from '../../stores/swarmStore';

interface GraphNode {
  id: string;
  name: string;
  status: Agent['status'];
  x: number;
  y: number;
  radius: number;
  reputation: number;
  isActive: boolean;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

const getStatusColor = (status: Agent['status']): string => {
  switch (status) {
    case 'idle':
      return '#10b981'; // emerald-500
    case 'busy':
      return '#f59e0b'; // amber-500
    case 'offline':
    default:
      return '#6b7280'; // gray-500
  }
};

export interface CollaborationGraphProps {
  className?: string;
  width?: number;
  height?: number;
}

/**
 * CollaborationGraph displays an SVG network visualization of agent interactions.
 * Nodes represent agents (sized by reputation), edges show interaction frequency.
 * Active agents have animated pulses.
 */
export function CollaborationGraph({
  className,
  width: propWidth,
  height: propHeight,
}: CollaborationGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: propWidth || 400, height: propHeight || 300 });
  const { agents } = useAgentStore();
  const { leaderboard, handoffs, fetchLeaderboard, fetchHandoffs } = useSwarmStore();
  const [animationPhase, setAnimationPhase] = useState(0);

  // Fetch leaderboard and handoffs data on mount
  useEffect(() => {
    fetchLeaderboard();
    fetchHandoffs(100); // Get more handoffs for edge data
  }, [fetchLeaderboard, fetchHandoffs]);

  // Handle responsive sizing
  useEffect(() => {
    if (propWidth && propHeight) {
      setDimensions({ width: propWidth, height: propHeight });
      return;
    }

    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: rect.width || 400,
          height: rect.height || 300,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [propWidth, propHeight]);

  // Animation for active agents
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationPhase((prev) => (prev + 1) % 60);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Create a map of agent reputations from leaderboard
  const reputationMap = useMemo(() => {
    const map = new Map<string, number>();
    leaderboard.forEach((entry: LeaderboardEntry) => {
      map.set(entry.agentId, entry.overallScore);
    });
    return map;
  }, [leaderboard]);

  // Generate graph nodes with positions
  const nodes = useMemo<GraphNode[]>(() => {
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const maxRadius = Math.min(centerX, centerY) - 50;

    return agents.map((agent, index) => {
      const angle = (index / agents.length) * Math.PI * 2 - Math.PI / 2;
      const radiusOffset = maxRadius * (0.6 + Math.random() * 0.4);

      // Get real reputation from leaderboard, default to 50 if not found
      const reputation = reputationMap.get(agent.id) ?? 50;
      // Reputation affects node size (10-25 pixels)
      const nodeRadius = 10 + (reputation / 100) * 15;

      return {
        id: agent.id,
        name: agent.name,
        status: agent.status,
        x: centerX + Math.cos(angle) * radiusOffset,
        y: centerY + Math.sin(angle) * radiusOffset,
        radius: nodeRadius,
        reputation,
        isActive: agent.status === 'busy',
      };
    });
  }, [agents, dimensions, reputationMap]);

  // Generate edges based on real handoff data (agents that have transferred conversations)
  const edges = useMemo<GraphEdge[]>(() => {
    const edgeMap = new Map<string, { count: number }>();

    // Count handoffs between agent pairs
    handoffs.forEach((handoff: SwarmHandoff) => {
      const fromId = handoff.fromAgent.id;
      const toId = handoff.toAgent.id;
      // Create a consistent key regardless of direction
      const key = [fromId, toId].sort().join('-');

      if (edgeMap.has(key)) {
        edgeMap.get(key)!.count++;
      } else {
        edgeMap.set(key, { count: 1 });
      }
    });

    // Convert to edges array with weights based on interaction count
    const edgeList: GraphEdge[] = [];
    const maxCount = Math.max(1, ...Array.from(edgeMap.values()).map(e => e.count));

    edgeMap.forEach((data, key) => {
      const [source, target] = key.split('-');
      // Normalize weight between 0.3 and 1.0 based on interaction frequency
      const weight = 0.3 + (data.count / maxCount) * 0.7;
      edgeList.push({ source, target, weight });
    });

    return edgeList;
  }, [handoffs]);

  // Get node position by ID
  const getNodeById = (id: string) => nodes.find((n) => n.id === id);

  if (agents.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-8', className)}>
        <Network className="w-12 h-12 text-gray-600 mb-3" />
        <p className="text-gray-400 text-sm">No collaboration data</p>
        <p className="text-gray-500 text-xs mt-1">Agents will appear here when active</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn('w-full h-full min-h-[250px]', className)}
    >
      <svg
        width={dimensions.width}
        height={dimensions.height}
        className="overflow-visible"
      >
        {/* Background gradient */}
        <defs>
          <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(99, 102, 241, 0.15)" />
            <stop offset="100%" stopColor="rgba(99, 102, 241, 0)" />
          </radialGradient>

          {/* Glow filters for active nodes */}
          <filter id="activeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background glow */}
        <circle
          cx={dimensions.width / 2}
          cy={dimensions.height / 2}
          r={Math.min(dimensions.width, dimensions.height) / 2.5}
          fill="url(#centerGlow)"
        />

        {/* Edges */}
        {edges.map((edge, index) => {
          const source = getNodeById(edge.source);
          const target = getNodeById(edge.target);
          if (!source || !target) return null;

          const strokeWidth = edge.weight * 3;
          const opacity = 0.2 + edge.weight * 0.4;

          return (
            <line
              key={`edge-${index}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="rgb(99, 102, 241)"
              strokeWidth={strokeWidth}
              opacity={opacity}
              strokeLinecap="round"
            />
          );
        })}

        {/* Center hub */}
        <circle
          cx={dimensions.width / 2}
          cy={dimensions.height / 2}
          r={20}
          fill="rgba(99, 102, 241, 0.1)"
          stroke="rgba(99, 102, 241, 0.5)"
          strokeWidth={2}
        />
        <circle
          cx={dimensions.width / 2}
          cy={dimensions.height / 2}
          r={6}
          fill="rgb(99, 102, 241)"
        />

        {/* Nodes */}
        {nodes.map((node) => {
          const color = getStatusColor(node.status);
          const pulseRadius = node.isActive
            ? node.radius + 5 + Math.sin(animationPhase / 10) * 3
            : 0;

          return (
            <g key={node.id} className="cursor-pointer">
              {/* Pulse animation for active nodes */}
              {node.isActive && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={pulseRadius}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  opacity={0.4 - (animationPhase % 30) / 100}
                />
              )}

              {/* Main node circle */}
              <circle
                cx={node.x}
                cy={node.y}
                r={node.radius}
                fill="rgb(15, 23, 42)"
                stroke={color}
                strokeWidth={2}
                filter={node.isActive ? 'url(#activeGlow)' : undefined}
              />

              {/* Node label (initials) */}
              <text
                x={node.x}
                y={node.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize={node.radius * 0.8}
                fontWeight="bold"
                className="pointer-events-none select-none"
              >
                {node.name.substring(0, 2).toUpperCase()}
              </text>

              {/* Hover tooltip */}
              <title>
                {node.name} - {node.status === 'idle' ? 'Online' : node.status}
                {'\n'}Reputation: {node.reputation.toFixed(0)}%
              </title>
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(10, ${dimensions.height - 60})`}>
          <text x={0} y={0} fill="#9ca3af" fontSize={10}>Legend</text>

          <circle cx={8} cy={15} r={5} fill="#10b981" />
          <text x={18} y={18} fill="#9ca3af" fontSize={10}>Online</text>

          <circle cx={8} cy={30} r={5} fill="#f59e0b" />
          <text x={18} y={33} fill="#9ca3af" fontSize={10}>Busy</text>

          <circle cx={8} cy={45} r={5} fill="#6b7280" />
          <text x={18} y={48} fill="#9ca3af" fontSize={10}>Offline</text>
        </g>
      </svg>
    </div>
  );
}

export default CollaborationGraph;
