import { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useSwarmStore } from '../../stores/swarmStore';

export interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const taskTypes = [
  { value: 'collaboration', label: 'Collaboration', description: 'Multiple agents work together' },
  { value: 'parallel', label: 'Parallel', description: 'Agents work independently' },
  { value: 'sequential', label: 'Sequential', description: 'Agents work in order' },
  { value: 'voting', label: 'Voting', description: 'Agents vote on a decision' },
];

const priorities = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export function CreateTaskModal({ open, onClose, onCreated }: CreateTaskModalProps) {
  const { createTask } = useSwarmStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('collaboration');
  const [priority, setPriority] = useState('normal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!description.trim()) {
      setError('Description is required');
      return;
    }

    setIsSubmitting(true);

    try {
      await createTask(title.trim(), description.trim(), type, priority);
      // Reset form
      setTitle('');
      setDescription('');
      setType('collaboration');
      setPriority('normal');
      onCreated?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setError(null);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create Swarm Task"
      size="lg"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-task-form"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Create Task
              </>
            )}
          </button>
        </div>
      }
    >
      <form id="create-task-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="task-title" className="block text-sm font-medium text-gray-300 mb-1">
            Title
          </label>
          <input
            id="task-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter task title..."
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-sky-500"
          />
        </div>

        <div>
          <label htmlFor="task-description" className="block text-sm font-medium text-gray-300 mb-1">
            Description
          </label>
          <textarea
            id="task-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this task should accomplish..."
            rows={3}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-sky-500 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="task-type" className="block text-sm font-medium text-gray-300 mb-1">
              Type
            </label>
            <select
              id="task-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-sky-500"
            >
              {taskTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {taskTypes.find((t) => t.value === type)?.description}
            </p>
          </div>

          <div>
            <label htmlFor="task-priority" className="block text-sm font-medium text-gray-300 mb-1">
              Priority
            </label>
            <select
              id="task-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-sky-500"
            >
              {priorities.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default CreateTaskModal;
