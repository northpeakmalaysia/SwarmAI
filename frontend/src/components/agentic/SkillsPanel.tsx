import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  TrendingUp,
  Star,
  Search,
  Filter,
  Mail,
  MessageSquare,
  FileText,
  Globe,
  BarChart3,
  Workflow,
  Users,
  Zap,
  Brain,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Input } from '../common/Input';
import { Modal } from '../common/Modal';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatDate } from '@/utils/dateFormat';

// Types
interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  requiredLevel: number;
  xpPerLevel: number[];
  dependsOn?: string[];
  prerequisites?: string[];
}

interface SkillRecommendation {
  skill: Skill;
  score: number;
  reason: string;
  unlocks: number;
}

interface AgentSkill {
  id: string;
  skillId: string;
  // Backend returns 'name', not 'skillName'
  name: string;
  skillName?: string; // legacy alias
  description?: string;
  category: string;
  icon: string;
  // Backend returns 'currentLevel', not 'level'
  currentLevel: number;
  level?: number; // legacy alias
  levelName: string;
  maxLevel?: number;
  // Backend returns 'experiencePoints'/'pointsToNextLevel', not 'experience'/'nextLevelXp'
  experiencePoints: number;
  experience?: number; // legacy alias
  pointsToNextLevel: number;
  nextLevelXp?: number; // legacy alias
  progress?: number;
  toolsUnlocked?: string[];
  acquiredAt: string;
  lastUsedAt?: string;
  usageCount: number;
}

export interface SkillsPanelProps {
  /** Agentic profile ID */
  agenticId: string;
  /** Additional className */
  className?: string;
}

// Category configurations
const categoryConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  communication: { icon: MessageSquare, color: 'text-blue-400', label: 'Communication' },
  analysis: { icon: BarChart3, color: 'text-green-400', label: 'Analysis' },
  automation: { icon: Workflow, color: 'text-purple-400', label: 'Automation' },
  integration: { icon: Globe, color: 'text-orange-400', label: 'Integration' },
  management: { icon: Users, color: 'text-pink-400', label: 'Management' },
};

// Skill icon mapping
const skillIconMap: Record<string, React.ElementType> = {
  mail: Mail,
  message: MessageSquare,
  file: FileText,
  globe: Globe,
  chart: BarChart3,
  workflow: Workflow,
  users: Users,
  zap: Zap,
  brain: Brain,
  sparkles: Sparkles,
};

// Level configurations
const levelConfig: Record<number, { name: string; color: string }> = {
  1: { name: 'Beginner', color: 'text-gray-400' },
  2: { name: 'Intermediate', color: 'text-blue-400' },
  3: { name: 'Advanced', color: 'text-purple-400' },
  4: { name: 'Expert', color: 'text-yellow-400' },
};

/**
 * SkillsPanel - Displays and manages skills for an agentic profile
 */
export const SkillsPanel: React.FC<SkillsPanelProps> = ({
  agenticId,
  className,
}) => {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [catalog, setCatalog] = useState<Skill[]>([]);
  const [recommendations, setRecommendations] = useState<SkillRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [isAcquiring, setIsAcquiring] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch agent's skills
  const fetchSkills = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/agentic/profiles/${agenticId}/skills`);
      setSkills(response.data.skills || []);
    } catch (error) {
      console.error('Failed to fetch skills:', error);
      toast.error('Failed to load skills');
    } finally {
      setIsLoading(false);
    }
  }, [agenticId]);

  // Fetch skill catalog
  const fetchCatalog = useCallback(async () => {
    try {
      const response = await api.get('/agentic/skills/catalog');
      setCatalog(response.data.skills || []);
    } catch (error) {
      console.error('Failed to fetch catalog:', error);
    }
  }, []);

  // Fetch recommendations
  const fetchRecommendations = useCallback(async () => {
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/skills/recommendations`);
      setRecommendations(response.data.recommendations || []);
    } catch (error) {
      console.error('Failed to fetch recommendations:', error);
    }
  }, [agenticId]);

  useEffect(() => {
    fetchSkills();
    fetchCatalog();
    fetchRecommendations();
  }, [fetchSkills, fetchCatalog, fetchRecommendations]);

  // Acquire a new skill
  const handleAcquireSkill = async (skillId: string) => {
    setIsAcquiring(true);
    try {
      await api.post(`/agentic/profiles/${agenticId}/skills`, { skillId });
      toast.success('Skill acquired!');
      fetchSkills();
      fetchRecommendations();
    } catch (error: unknown) {
      console.error('Failed to acquire skill:', error);
      const errorMessage = error instanceof Error ? error.message :
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to acquire skill';
      toast.error(errorMessage);
    } finally {
      setIsAcquiring(false);
    }
  };

  // Remove a skill
  const handleRemoveSkill = async (skillId: string) => {
    if (!confirm('Are you sure you want to remove this skill?')) return;

    setRemovingId(skillId);
    try {
      await api.delete(`/agentic/profiles/${agenticId}/skills/${skillId}`);
      toast.success('Skill removed');
      fetchSkills();
      fetchRecommendations();
    } catch (error) {
      console.error('Failed to remove skill:', error);
      toast.error('Failed to remove skill');
    } finally {
      setRemovingId(null);
    }
  };

  // Use a skill (adds XP)
  const handleUseSkill = async (skillId: string) => {
    try {
      await api.post(`/agentic/profiles/${agenticId}/skills/${skillId}/use`, {
        context: 'manual_trigger',
      });
      toast.success('Skill used (+10 XP)');
      fetchSkills();
    } catch (error) {
      console.error('Failed to use skill:', error);
      toast.error('Failed to use skill');
    }
  };

  // Get skill icon component
  const getSkillIcon = (iconName: string) => {
    return skillIconMap[iconName] || Sparkles;
  };

  // Filter catalog skills
  const filteredCatalog = catalog.filter((skill) => {
    // Exclude already acquired skills
    if (skills.some((s) => s.skillId === skill.id)) return false;

    // Apply category filter
    if (categoryFilter !== 'all' && skill.category !== categoryFilter) return false;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query)
      );
    }

    return true;
  });

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-400">Agent Skills</h4>
        <Button
          size="sm"
          variant="primary"
          onClick={() => setShowCatalogModal(true)}
          icon={<Plus className="w-4 h-4" />}
        >
          Add Skill
        </Button>
      </div>

      {/* Skills List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
        </div>
      ) : skills.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No skills acquired yet</p>
          <p className="text-xs mt-1">Add skills to enhance agent capabilities</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {skills.map((skill) => {
            const catConfig = categoryConfig[skill.category] || categoryConfig.automation;
            const SkillIcon = getSkillIcon(skill.icon);
            const level = skill.currentLevel || skill.level || 1;
            const levelCfg = levelConfig[level] || levelConfig[1];
            const xp = skill.experiencePoints || skill.experience || 0;
            const nextXp = skill.pointsToNextLevel || skill.nextLevelXp || 100;
            const progress = skill.progress || (nextXp > 0 ? Math.min(100, Math.round((xp / nextXp) * 100)) : 0);
            const displayName = skill.name || skill.skillName || skill.skillId;
            const tools = skill.toolsUnlocked || [];

            return (
              <div
                key={skill.id}
                className="p-4 bg-swarm-darker rounded-lg border border-swarm-border/20 hover:border-swarm-border/40 transition-colors"
              >
                {/* Header Row */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={cn('p-1.5 rounded-lg bg-swarm-dark', catConfig.color)}>
                      <SkillIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-medium text-white">{displayName}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="default" size="sm">{catConfig.label}</Badge>
                        <span className={cn('text-xs font-medium', levelCfg.color)}>
                          {levelCfg.name}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleUseSkill(skill.skillId)}
                      className="p-1 text-gray-400 hover:text-green-400 transition-colors"
                      title="Use skill (+10 XP)"
                    >
                      <Zap className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleRemoveSkill(skill.skillId)}
                      disabled={removingId === skill.skillId}
                      className="p-1 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
                      title="Remove skill"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Description */}
                {skill.description && (
                  <p className="text-xs text-gray-400 mb-2 leading-relaxed">
                    {skill.description}
                  </p>
                )}

                {/* Tools Unlocked */}
                {tools.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {tools.map((tool) => (
                      <span
                        key={tool}
                        className="px-1.5 py-0.5 text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                )}

                {/* XP Progress Bar */}
                <div className="mb-2">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span>Level {level} - {levelCfg.name}</span>
                    <span>{xp} / {nextXp} XP</span>
                  </div>
                  <div className="w-full h-2 bg-swarm-dark rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-purple-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Used {skill.usageCount || 0}x</span>
                  <span>Last used: {formatDate(skill.lastUsedAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recommendations Section */}
      {recommendations.length > 0 && (
        <div className="mt-6">
          <h5 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-400" />
            Recommended Skills
          </h5>
          <div className="flex flex-wrap gap-2">
            {recommendations.slice(0, 5).map((rec) => {
              const skill = rec.skill;
              const catConfig = categoryConfig[skill.category] || categoryConfig.automation;
              return (
                <button
                  key={skill.id}
                  onClick={() => handleAcquireSkill(skill.id)}
                  disabled={isAcquiring}
                  className="flex items-center gap-2 px-3 py-2 bg-swarm-dark hover:bg-sky-500/10 border border-swarm-border/20 hover:border-sky-500/30 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Sparkles className={cn('w-4 h-4', catConfig.color)} />
                  <span className="text-sm text-gray-300">{skill.name}</span>
                  <Plus className="w-3 h-3 text-gray-500" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Skill Catalog Modal */}
      <Modal
        open={showCatalogModal}
        onClose={() => setShowCatalogModal(false)}
        title="Skill Catalog"
        size="3xl"
      >
        <div className="space-y-4">
          {/* Search and Filter */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search skills..."
                className="pr-10"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-gray-300"
              title="Filter by category"
              aria-label="Filter by category"
            >
              <option value="all">All Categories</option>
              {Object.entries(categoryConfig).map(([cat, config]) => (
                <option key={cat} value={cat}>{config.label}</option>
              ))}
            </select>
          </div>

          {/* Catalog Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-1">
            {filteredCatalog.map((skill) => {
              const catConfig = categoryConfig[skill.category] || categoryConfig.automation;
              const SkillIcon = getSkillIcon(skill.icon);
              const deps = skill.dependsOn || skill.prerequisites || [];
              // Show related skills info but don't lock - all skills freely acquirable
              const relatedSkillNames = deps
                .map((dep) => catalog.find((c) => c.id === dep)?.name || dep)
                .filter(Boolean);

              return (
                <div
                  key={skill.id}
                  className="p-4 bg-swarm-darker rounded-lg border border-swarm-border/20 hover:border-sky-500/30 transition-colors flex flex-col"
                >
                  {/* Header: icon + name */}
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className={cn('p-2 rounded-lg bg-swarm-dark shrink-0', catConfig.color)}>
                      <SkillIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-white text-sm truncate">{skill.name}</span>
                      <Badge variant="default" size="sm" className="mt-0.5">
                        {catConfig.label}
                      </Badge>
                    </div>
                  </div>

                  {/* Full description */}
                  <p className="text-xs text-gray-400 leading-relaxed mb-3 flex-1">
                    {skill.description}
                  </p>

                  {/* Related skills info (informational, not blocking) */}
                  {relatedSkillNames.length > 0 && (
                    <div className="flex items-start gap-1.5 mb-3 p-2 bg-sky-500/5 border border-sky-500/10 rounded-md">
                      <Sparkles className="w-3 h-3 text-sky-500/70 mt-0.5 shrink-0" />
                      <span className="text-[11px] text-sky-500/70 leading-snug">
                        Related: {relatedSkillNames.join(', ')}
                      </span>
                    </div>
                  )}

                  {/* Action button */}
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleAcquireSkill(skill.id)}
                    disabled={isAcquiring}
                    icon={<Plus className="w-3.5 h-3.5" />}
                    className="w-full justify-center"
                  >
                    Add Skill
                  </Button>
                </div>
              );
            })}
          </div>

          {filteredCatalog.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No skills found</p>
              <p className="text-xs mt-1">Try adjusting your search or filters</p>
            </div>
          )}

          {/* Close Button */}
          <div className="flex justify-end pt-4 border-t border-swarm-border/20">
            <Button variant="ghost" onClick={() => setShowCatalogModal(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SkillsPanel;
