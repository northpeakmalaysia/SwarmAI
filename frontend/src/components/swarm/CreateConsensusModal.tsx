import { useState } from 'react';
import { Plus, Loader2, X, Vote } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useSwarmStore } from '../../stores/swarmStore';
import { useAgentStore } from '../../stores/agentStore';

export interface CreateConsensusModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

interface OptionInput {
  id: string;
  label: string;
  description: string;
}

export function CreateConsensusModal({ open, onClose, onCreated }: CreateConsensusModalProps) {
  const { createConsensus } = useSwarmStore();
  const { agents } = useAgentStore();

  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<OptionInput[]>([
    { id: '1', label: '', description: '' },
    { id: '2', label: '', description: '' },
  ]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeAgents = agents.filter(a => a.status !== 'offline');

  const addOption = () => {
    if (options.length < 5) {
      setOptions([
        ...options,
        { id: String(Date.now()), label: '', description: '' },
      ]);
    }
  };

  const removeOption = (id: string) => {
    if (options.length > 2) {
      setOptions(options.filter((o) => o.id !== id));
    }
  };

  const updateOption = (id: string, field: 'label' | 'description', value: string) => {
    setOptions(options.map((o) => (o.id === id ? { ...o, [field]: value } : o)));
  };

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!topic.trim()) {
      setError('Topic is required');
      return;
    }

    if (!description.trim()) {
      setError('Description is required');
      return;
    }

    const validOptions = options.filter((o) => o.label.trim() && o.description.trim());
    if (validOptions.length < 2) {
      setError('At least 2 options with labels and descriptions are required');
      return;
    }

    if (selectedAgents.length < 1) {
      setError('At least 1 agent must be selected to vote');
      return;
    }

    setIsSubmitting(true);

    try {
      await createConsensus(
        topic.trim(),
        description.trim(),
        validOptions.map((o) => ({ label: o.label.trim(), description: o.description.trim() })),
        selectedAgents
      );
      // Reset form
      setTopic('');
      setDescription('');
      setOptions([
        { id: '1', label: '', description: '' },
        { id: '2', label: '', description: '' },
      ]);
      setSelectedAgents([]);
      onCreated?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create consensus vote');
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
      title="Create Consensus Vote"
      size="xl"
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
            form="create-consensus-form"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Vote className="w-4 h-4" />
                Create Vote
              </>
            )}
          </button>
        </div>
      }
    >
      <form id="create-consensus-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="consensus-topic" className="block text-sm font-medium text-gray-300 mb-1">
            Topic
          </label>
          <input
            id="consensus-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What should agents vote on?"
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        <div>
          <label htmlFor="consensus-description" className="block text-sm font-medium text-gray-300 mb-1">
            Description
          </label>
          <textarea
            id="consensus-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Provide context for the vote..."
            rows={2}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-300">
              Options ({options.length}/5)
            </label>
            {options.length < 5 && (
              <button
                type="button"
                onClick={addOption}
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Option
              </button>
            )}
          </div>
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={option.id} className="flex gap-2">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={option.label}
                    onChange={(e) => updateOption(option.id, 'label', e.target.value)}
                    placeholder={`Option ${index + 1} label`}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
                  />
                  <input
                    type="text"
                    value={option.description}
                    onChange={(e) => updateOption(option.id, 'description', e.target.value)}
                    placeholder="Description"
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
                  />
                </div>
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(option.id)}
                    className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                    title="Remove option"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Participating Agents ({selectedAgents.length} selected)
          </label>
          {activeAgents.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {activeAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => toggleAgent(agent.id)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    selectedAgents.includes(agent.id)
                      ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                      : 'bg-slate-800 border-slate-700 text-gray-400 hover:border-slate-600'
                  }`}
                >
                  {agent.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No active agents available</p>
          )}
        </div>
      </form>
    </Modal>
  );
}

export default CreateConsensusModal;
