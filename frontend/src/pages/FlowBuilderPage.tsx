import { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Plus,
  Save,
  Play,
  Pause,
  ArrowLeft,
  Trash2,
  Settings,
  History,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Monitor,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { useFlowStore } from '../stores/flowStore';
import {
  FlowCanvas,
  NodePalette,
  NodeConfigPanel,
  ExecutionPreview,
  ExecutionPanel,
  AiFlowGeneratorModal,
  nodeTypes,
} from '../components/flowbuilder';
import { Button, ConfirmDialog, PromptDialog } from '../components/common';
import { useIsMobileOrTablet } from '../hooks/useMediaQuery';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';

/**
 * Small Screen Warning component for FlowBuilder
 * Shows when screen is below 1024px
 */
const SmallScreenWarning: React.FC<{
  onDismiss: () => void;
  onContinue: () => void;
}> = ({ onDismiss, onContinue }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full p-6">
      <div className="flex items-center gap-4 mb-4">
        <div className="p-3 bg-amber-500/20 rounded-lg">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Small Screen Detected</h2>
          <p className="text-sm text-gray-400">FlowBuilder works best on larger screens</p>
        </div>
      </div>

      <div className="mb-6 p-4 bg-slate-700/50 rounded-lg">
        <div className="flex items-center gap-3 mb-3">
          <Monitor className="w-5 h-5 text-sky-400" />
          <span className="text-sm font-medium text-white">Recommended: 1024px or wider</span>
        </div>
        <p className="text-sm text-gray-300">
          The FlowBuilder canvas requires dragging, connecting nodes, and configuring complex workflows.
          These interactions are optimized for desktop screens with mouse input.
        </p>
      </div>

      <div className="space-y-3">
        <Button
          onClick={onDismiss}
          variant="primary"
          className="w-full"
        >
          View Flow List Instead
        </Button>
        <Button
          onClick={onContinue}
          variant="ghost"
          className="w-full text-gray-400"
        >
          Continue Anyway (Limited Experience)
        </Button>
      </div>
    </div>
  </div>
);

// Generate unique node ID
const generateNodeId = (type: string) => `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export default function FlowBuilderPage() {
  const { flowId } = useParams();
  const navigate = useNavigate();
  const {
    flows,
    currentFlow,
    executions,
    isSaving,
    isLoading,
    hasUnsavedChanges,
    fetchFlows,
    fetchFlow,
    createFlow,
    updateFlow,
    deleteFlow,
    toggleFlowStatus,
    executeFlow,
    setCurrentFlow,
    markAsChanged,
  } = useFlowStore();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [showFlowList, setShowFlowList] = useState(!flowId);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [showExecutionPanel, setShowExecutionPanel] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingNodeId, setExecutingNodeId] = useState<string | null>(null);
  const [dismissedSmallScreenWarning, setDismissedSmallScreenWarning] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAiGenerator, setShowAiGenerator] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);

  // Track initial flow data for change detection
  const initialFlowRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);

  // Check for small screen
  const isSmallScreen = useIsMobileOrTablet();
  const showSmallScreenWarning = isSmallScreen && !showFlowList && flowId && !dismissedSmallScreenWarning;

  // Fetch flows on mount
  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  // Load flow when flowId changes
  useEffect(() => {
    if (flowId) {
      fetchFlow(flowId).then((flow) => {
        const flowNodes = flow.nodes || [];
        const flowEdges = flow.edges || [];
        setNodes(flowNodes);
        setEdges(flowEdges);
        // Store initial state for change detection
        initialFlowRef.current = {
          nodes: JSON.parse(JSON.stringify(flowNodes)),
          edges: JSON.parse(JSON.stringify(flowEdges)),
        };
        setShowFlowList(false);
      }).catch(() => {
        toast.error('Failed to load flow');
        navigate('/flows');
      });
    } else {
      setCurrentFlow(null);
      setNodes([]);
      setEdges([]);
      initialFlowRef.current = null;
      setShowFlowList(true);
    }
  }, [flowId, fetchFlow, setCurrentFlow, navigate]);

  // Detect changes to enable save button
  useEffect(() => {
    if (!initialFlowRef.current || !currentFlow) return;

    const hasNodeChanges = JSON.stringify(nodes) !== JSON.stringify(initialFlowRef.current.nodes);
    const hasEdgeChanges = JSON.stringify(edges) !== JSON.stringify(initialFlowRef.current.edges);

    if ((hasNodeChanges || hasEdgeChanges) && !hasUnsavedChanges) {
      markAsChanged();
    }
  }, [nodes, edges, currentFlow, hasUnsavedChanges, markAsChanged]);

  // Handle connection
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Handle node selection
  const handleNodeSelect = useCallback((node: Node | null) => {
    setSelectedNode(node);
  }, []);

  // Handle node drop from palette
  const handleNodeDrop = useCallback(
    (type: string, position: { x: number; y: number }, data: Record<string, unknown>) => {
      const newNode: Node = {
        id: generateNodeId(type),
        type,
        position,
        data: {
          ...data,
          config: {},
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  // Handle node update from config panel
  const handleUpdateNode = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data,
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // Handle node delete
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      if (selectedNode?.id === nodeId) {
        setSelectedNode(null);
      }
    },
    [setNodes, setEdges, selectedNode]
  );

  // Handle edge delete
  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
    },
    [setEdges]
  );

  // Handle node duplicate
  const handleDuplicateNode = useCallback(
    (node: Node) => {
      const newNode: Node = {
        ...node,
        id: generateNodeId(node.type || 'node'),
        position: {
          x: node.position.x + 50,
          y: node.position.y + 50,
        },
        selected: false,
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  // Handle drag start from palette
  const handleDragStart = useCallback(
    (event: React.DragEvent, nodeType: string, nodeData: Record<string, unknown>) => {
      event.dataTransfer.setData(
        'application/reactflow',
        JSON.stringify({ type: nodeType, data: nodeData })
      );
      event.dataTransfer.effectAllowed = 'move';
    },
    []
  );

  // Create new flow - opens prompt dialog
  const handleCreateFlowClick = () => {
    setShowCreateDialog(true);
  };

  // Handle create flow submit
  const handleCreateFlowSubmit = async (name: string) => {
    try {
      const flow = await createFlow(name, '');
      setShowCreateDialog(false);
      navigate(`/flows/${flow.id}`);
    } catch {
      toast.error('Failed to create flow');
    }
  };

  // Save flow
  const handleSave = async () => {
    if (!currentFlow) return;
    try {
      await updateFlow(currentFlow.id, { nodes, edges });
      // Update initial reference to current state after save
      initialFlowRef.current = {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      };
      toast.success('Flow saved');
    } catch {
      toast.error('Failed to save flow');
    }
  };

  // Execute flow
  const handleExecute = async () => {
    if (!currentFlow) return;

    setIsExecuting(true);
    setShowExecutionPanel(true);

    try {
      // Simulate step-by-step execution for preview
      const nodeOrder = nodes.filter((n) => n.type === 'trigger');
      if (nodeOrder.length > 0) {
        setExecutingNodeId(nodeOrder[0].id);
      }

      await executeFlow(currentFlow.id);
      toast.success('Flow execution completed');
    } catch {
      toast.error('Failed to execute flow');
    } finally {
      setIsExecuting(false);
      setExecutingNodeId(null);
    }
  };

  // Delete flow - opens confirm dialog
  const handleDeleteClick = (id: string) => {
    setDeleteDialog({ open: true, id });
  };

  // Handle delete flow confirm
  const handleDeleteConfirm = async () => {
    if (!deleteDialog.id) return;
    setIsDeleting(true);
    try {
      await deleteFlow(deleteDialog.id);
      if (currentFlow?.id === deleteDialog.id) {
        navigate('/flows');
      }
      toast.success('Flow deleted');
      setDeleteDialog({ open: false, id: null });
    } catch {
      toast.error('Failed to delete flow');
    } finally {
      setIsDeleting(false);
    }
  };

  // Get current execution
  const currentExecution = useMemo(() => {
    if (!currentFlow) return null;
    return executions.find((e) => e.flowId === currentFlow.id);
  }, [currentFlow, executions]);

  // Flow list view
  if (showFlowList) {
    return (
      <div className="page-container stack-lg">
        <div className="page-header-actions !mb-0">
          <div>
            <h1 className="page-title">FlowBuilder</h1>
            <p className="page-subtitle">Create and manage automation workflows</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowAiGenerator(true)}
              variant="outline"
              icon={<Sparkles className="w-5 h-5" />}
            >
              AI Generate
            </Button>
            <Button
              onClick={handleCreateFlowClick}
              variant="primary"
              icon={<Plus className="w-5 h-5" />}
            >
              New Flow
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          </div>
        ) : flows.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-slate-800 rounded-full flex items-center justify-center">
              <Settings className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-lg font-medium text-white mb-1">No flows yet</h3>
            <p className="text-gray-500 mb-4">Create your first automation workflow</p>
            <Button onClick={handleCreateFlowClick} variant="primary">
              Create Flow
            </Button>
          </div>
        ) : (
          <div className="cards-grid">
            {flows.map((flow) => (
              <div
                key={flow.id}
                onClick={() => navigate(`/flows/${flow.id}`)}
                className={cn(
                  'card cursor-pointer transition-all duration-200',
                  'hover:border-sky-500/50 hover:shadow-lg hover:shadow-sky-500/10',
                  'hover:translate-y-[-2px]'
                )}
              >
                <h3 className="text-lg font-semibold text-white">{flow.name}</h3>
                <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                  {flow.description || 'No description'}
                </p>

                {/* Stats */}
                <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
                  <span>{flow.nodes?.length || 0} nodes</span>
                  <span>{flow.runCount || 0} runs</span>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-800">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFlowStatus(flow.id);
                      }}
                      className={cn(
                        'p-1.5 rounded-md transition-colors',
                        flow.isActive
                          ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                          : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      )}
                      title={flow.isActive ? 'Deactivate flow' : 'Activate flow'}
                    >
                      {flow.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <span
                      className={cn(
                        'px-2 py-1 text-xs font-medium rounded',
                        flow.isActive
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-gray-500/20 text-gray-400'
                      )}
                    >
                      {flow.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClick(flow.id);
                    }}
                    className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                    title="Delete flow"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Flow Prompt Dialog */}
        <PromptDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          onSubmit={handleCreateFlowSubmit}
          title="Create New Flow"
          message="Enter a name for your new automation workflow."
          placeholder="Enter flow name..."
          submitText="Create"
          required
        />

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          open={deleteDialog.open}
          onClose={() => setDeleteDialog({ open: false, id: null })}
          onConfirm={handleDeleteConfirm}
          title="Delete Flow"
          message="Are you sure you want to delete this flow? This action cannot be undone."
          confirmText="Delete"
          variant="danger"
          loading={isDeleting}
        />

        {/* AI Flow Generator Modal */}
        <AiFlowGeneratorModal
          isOpen={showAiGenerator}
          onClose={() => setShowAiGenerator(false)}
          onFlowGenerated={async (generatedFlow) => {
            try {
              const newFlow = await createFlow(
                generatedFlow.name || 'AI Generated Flow',
                generatedFlow.description || ''
              );
              if (newFlow?.id) {
                // Update the flow with the generated nodes and edges
                await updateFlow(newFlow.id, {
                  nodes: generatedFlow.nodes,
                  edges: generatedFlow.edges,
                });
                toast.success('Flow imported successfully');
                navigate(`/flows/${newFlow.id}`);
              }
            } catch (error) {
              toast.error('Failed to import flow');
              console.error('Error importing flow:', error);
            }
          }}
        />
      </div>
    );
  }

  // Flow editor view
  return (
    <div className="fixed inset-x-0 top-14 bottom-0 flex flex-col bg-slate-900">
      {/* Small screen warning */}
      {showSmallScreenWarning && (
        <SmallScreenWarning
          onDismiss={() => {
            setDismissedSmallScreenWarning(false);
            navigate('/flows');
          }}
          onContinue={() => setDismissedSmallScreenWarning(true)}
        />
      )}

      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-900">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => navigate('/flows')}
            variant="ghost"
            size="sm"
            icon={<ArrowLeft className="w-4 h-4" />}
          >
            Back
          </Button>
          <div className="h-6 w-px bg-slate-700" />
          <h2 className="text-lg font-semibold text-white">
            {currentFlow?.name || 'Untitled Flow'}
          </h2>
          {hasUnsavedChanges && (
            <span className="ml-2 px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full font-medium">
              Unsaved changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowExecutionPanel(!showExecutionPanel)}
            variant={showExecutionPanel ? 'secondary' : 'ghost'}
            size="sm"
            icon={<History className="w-4 h-4" />}
          >
            Execution
          </Button>
          <div className="h-6 w-px bg-slate-700" />
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
            loading={isSaving}
            variant={hasUnsavedChanges ? 'primary' : 'outline'}
            size="sm"
            icon={<Save className="w-4 h-4" />}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button
            onClick={handleExecute}
            disabled={isExecuting}
            loading={isExecuting}
            variant="primary"
            size="sm"
            icon={<Play className="w-4 h-4" />}
          >
            Run
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Node Palette */}
        <div className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-700 overflow-hidden flex flex-col">
          <div className="p-4 flex-1 overflow-hidden flex flex-col">
            <NodePalette onDragStart={handleDragStart} />
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlowProvider>
            <FlowCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeSelect={handleNodeSelect}
              onNodeDelete={handleDeleteNode}
              onEdgeDelete={handleDeleteEdge}
              onNodeDrop={handleNodeDrop}
              isLocked={isLocked}
              onLockToggle={() => setIsLocked(!isLocked)}
              executingNodeId={executingNodeId}
            />
          </ReactFlowProvider>
        </div>

        {/* Right Panel - Config or Execution */}
        <div
          className={cn(
            'bg-slate-900 border-l border-slate-700 transition-all duration-300 overflow-hidden flex flex-col',
            selectedNode || showExecutionPanel ? 'w-80' : 'w-0'
          )}
        >
          {/* Panel Toggle Tabs */}
          {(selectedNode || showExecutionPanel) && (
            <div className="flex border-b border-slate-700">
              <button
                onClick={() => {
                  if (selectedNode) {
                    setShowExecutionPanel(false);
                  }
                }}
                className={cn(
                  'flex-1 px-4 py-2 text-sm font-medium transition-colors',
                  !showExecutionPanel
                    ? 'text-white bg-slate-800 border-b-2 border-sky-500'
                    : 'text-gray-500 hover:text-gray-300'
                )}
              >
                Config
              </button>
              <button
                onClick={() => setShowExecutionPanel(true)}
                className={cn(
                  'flex-1 px-4 py-2 text-sm font-medium transition-colors',
                  showExecutionPanel
                    ? 'text-white bg-slate-800 border-b-2 border-sky-500'
                    : 'text-gray-500 hover:text-gray-300'
                )}
              >
                Execution
              </button>
            </div>
          )}

          {/* Panel Content */}
          <div className="flex-1 overflow-hidden">
            {showExecutionPanel ? (
              <ExecutionPanel
                onClose={() => setShowExecutionPanel(false)}
              />
            ) : (
              <div className="p-4 h-full">
                <NodeConfigPanel
                  node={selectedNode}
                  onUpdate={handleUpdateNode}
                  onDelete={handleDeleteNode}
                  onDuplicate={handleDuplicateNode}
                  onClose={() => setSelectedNode(null)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
