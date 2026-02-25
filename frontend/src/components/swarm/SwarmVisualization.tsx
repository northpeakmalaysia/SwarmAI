import { useEffect, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import type { Agent } from '../../stores/agentStore'
import type { SwarmTask } from '../../stores/swarmStore'

interface SwarmVisualizationProps {
  agents: Agent[]
  tasks: SwarmTask[]
  isPaused: boolean
}

interface AgentNode {
  id: string
  name: string
  status: string
  x: number
  y: number
  vx: number
  vy: number
}

export default function SwarmVisualization({
  agents,
  tasks,
  isPaused,
}: SwarmVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef<AgentNode[]>([])
  const animationRef = useRef<number>()

  // Initialize nodes from agents
  const nodes = useMemo(() => {
    const containerWidth = 800
    const containerHeight = 500
    const centerX = containerWidth / 2
    const centerY = containerHeight / 2

    return agents.map((agent, i) => {
      const angle = (i / agents.length) * Math.PI * 2
      const radius = 150 + Math.random() * 50
      return {
        id: agent.id,
        name: agent.name,
        status: agent.status,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
      }
    })
  }, [agents])

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  // Animation loop
  useEffect(() => {
    if (isPaused) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      return
    }

    const animate = () => {
      const containerWidth = containerRef.current?.clientWidth || 800
      const containerHeight = containerRef.current?.clientHeight || 500
      const centerX = containerWidth / 2
      const centerY = containerHeight / 2

      nodesRef.current = nodesRef.current.map((node) => {
        // Apply forces
        let fx = 0
        let fy = 0

        // Center attraction
        const dx = centerX - node.x
        const dy = centerY - node.y
        const distToCenter = Math.sqrt(dx * dx + dy * dy)
        fx += dx * 0.001
        fy += dy * 0.001

        // Repulsion from other nodes
        nodesRef.current.forEach((other) => {
          if (other.id !== node.id) {
            const odx = node.x - other.x
            const ody = node.y - other.y
            const dist = Math.sqrt(odx * odx + ody * ody)
            if (dist < 100 && dist > 0) {
              fx += (odx / dist) * 0.5
              fy += (ody / dist) * 0.5
            }
          }
        })

        // Random wandering
        fx += (Math.random() - 0.5) * 0.2
        fy += (Math.random() - 0.5) * 0.2

        // Update velocity
        let newVx = (node.vx + fx) * 0.95
        let newVy = (node.vy + fy) * 0.95

        // Limit speed
        const speed = Math.sqrt(newVx * newVx + newVy * newVy)
        if (speed > 2) {
          newVx = (newVx / speed) * 2
          newVy = (newVy / speed) * 2
        }

        // Update position
        let newX = node.x + newVx
        let newY = node.y + newVy

        // Boundary check
        const padding = 60
        if (newX < padding) newX = padding
        if (newX > containerWidth - padding) newX = containerWidth - padding
        if (newY < padding) newY = padding
        if (newY > containerHeight - padding) newY = containerHeight - padding

        return {
          ...node,
          x: newX,
          y: newY,
          vx: newVx,
          vy: newVy,
        }
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPaused])

  // Calculate connections between active agents
  const connections = useMemo(() => {
    const lines: { from: AgentNode; to: AgentNode }[] = []
    const activeAgents = nodesRef.current.filter((n) => n.status !== 'offline')

    for (let i = 0; i < activeAgents.length; i++) {
      for (let j = i + 1; j < activeAgents.length; j++) {
        const dx = activeAgents[i].x - activeAgents[j].x
        const dy = activeAgents[i].y - activeAgents[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 200) {
          lines.push({ from: activeAgents[i], to: activeAgents[j] })
        }
      }
    }
    return lines
  }, [nodes])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'idle':
        return 'rgb(34, 197, 94)' // green-500
      case 'busy':
        return 'rgb(234, 179, 8)' // yellow-500
      default:
        return 'rgb(107, 114, 128)' // gray-500
    }
  }

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      {/* Connection lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {connections.map((conn, i) => (
          <line
            key={i}
            x1={conn.from.x}
            y1={conn.from.y}
            x2={conn.to.x}
            y2={conn.to.y}
            stroke="rgba(99, 102, 241, 0.3)"
            strokeWidth="1"
          />
        ))}
      </svg>

      {/* Agent nodes */}
      {nodesRef.current.map((node) => (
        <motion.div
          key={node.id}
          className="absolute"
          animate={{
            x: node.x - 30,
            y: node.y - 30,
          }}
          transition={{
            type: 'spring',
            damping: 20,
            stiffness: 100,
          }}
        >
          <div className="relative group">
            {/* Glow effect */}
            <div
              className="absolute inset-0 rounded-full blur-md opacity-50"
              style={{ backgroundColor: getStatusColor(node.status) }}
            />

            {/* Node circle */}
            <div
              className="relative w-[60px] h-[60px] rounded-full flex items-center justify-center border-2 cursor-pointer transition-transform hover:scale-110"
              style={{
                backgroundColor: 'rgb(15, 23, 42)',
                borderColor: getStatusColor(node.status),
              }}
            >
              <span className="text-white font-bold text-lg">
                {node.name.charAt(0).toUpperCase()}
              </span>
            </div>

            {/* Label */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap">
              <span className="text-xs text-gray-400 bg-swarm-dark px-2 py-1 rounded">
                {node.name}
              </span>
            </div>

            {/* Pulse animation for active agents */}
            {node.status === 'busy' && (
              <div
                className="absolute inset-0 rounded-full animate-ping"
                style={{
                  backgroundColor: getStatusColor(node.status),
                  opacity: 0.4,
                }}
              />
            )}
          </div>
        </motion.div>
      ))}

      {/* Center hub */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border-2 border-swarm-accent/50 flex items-center justify-center"
        style={{
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, transparent 70%)',
        }}
      >
        <div className="w-4 h-4 bg-swarm-accent rounded-full animate-pulse" />
      </div>
    </div>
  )
}
