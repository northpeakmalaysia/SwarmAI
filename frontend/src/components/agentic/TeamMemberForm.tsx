import React, { useState, useCallback, useEffect } from 'react';
import {
  User,
  Briefcase,
  Clock,
  Globe,
  CheckSquare,
  Bell,
  Star,
  Tag,
  Save,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { SearchableSelect, SelectOption } from '../common/SearchableSelect';
import api from '../../services/api';

export interface TeamMemberFormData {
  contactId: string;
  contactName: string;
  role: string;
  department?: string;
  gender?: string;
  skills: string[];
  timezone?: string;
  availabilitySchedule?: Record<string, { start: string; end: string }>;
  maxConcurrentTasks: number;
  taskTypes: string[];
  priorityLevel: number;
  preferredChannel: 'email' | 'whatsapp' | 'telegram';
  notificationFrequency: 'immediate' | 'hourly' | 'daily';
}

export interface TeamMemberFormProps {
  /** Whether the modal is open */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** Submit handler */
  onSubmit: (data: TeamMemberFormData) => Promise<void>;
  /** Initial data for editing */
  initialData?: Partial<TeamMemberFormData>;
  /** Whether this is an edit operation */
  isEdit?: boolean;
  /** Additional className */
  className?: string;
}

const ROLES = [
  'Developer',
  'QA Engineer',
  'Designer',
  'Project Manager',
  'DevOps',
  'Support',
  'Sales',
  'Marketing',
  'Admin',
  'Other',
];

const DEPARTMENTS = [
  'Engineering',
  'QA',
  'Design',
  'Product',
  'Operations',
  'Marketing',
  'Sales',
  'Support',
  'HR',
  'Finance',
];

const SKILLS = [
  'code_review',
  'testing',
  'documentation',
  'design',
  'frontend',
  'backend',
  'devops',
  'database',
  'security',
  'communication',
  'project_management',
  'research',
  'analysis',
  'support',
];

const TASK_TYPES = [
  'code_review',
  'bug_fix',
  'feature',
  'documentation',
  'testing',
  'design',
  'research',
  'support',
  'deployment',
  'maintenance',
];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Jakarta',
  'Australia/Sydney',
];

const CHANNELS = [
  { id: 'email', label: 'Email' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'telegram', label: 'Telegram' },
];

const NOTIFICATION_FREQUENCIES = [
  { id: 'immediate', label: 'Immediate', description: 'Notify immediately when assigned' },
  { id: 'hourly', label: 'Hourly', description: 'Batch notifications every hour' },
  { id: 'daily', label: 'Daily', description: 'Single daily summary' },
];

/**
 * TeamMemberForm - Comprehensive form for adding/editing team members
 *
 * Includes all PRD-specified fields:
 * - Contact selection (searchable)
 * - Role & Department
 * - Skills (multi-select)
 * - Timezone
 * - Availability schedule
 * - Max concurrent tasks
 * - Task types (multi-select)
 * - Priority level
 * - Preferred channel
 * - Notification frequency
 */
export const TeamMemberForm: React.FC<TeamMemberFormProps> = ({
  open,
  onClose,
  onSubmit,
  initialData,
  isEdit = false,
  className,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<TeamMemberFormData>({
    contactId: initialData?.contactId || '',
    contactName: initialData?.contactName || '',
    role: initialData?.role || 'Developer',
    department: initialData?.department || 'Engineering',
    gender: initialData?.gender || '',
    skills: initialData?.skills || [],
    timezone: initialData?.timezone || 'UTC',
    availabilitySchedule: initialData?.availabilitySchedule,
    maxConcurrentTasks: initialData?.maxConcurrentTasks || 5,
    taskTypes: initialData?.taskTypes || [],
    priorityLevel: initialData?.priorityLevel || 3,
    preferredChannel: initialData?.preferredChannel || 'email',
    notificationFrequency: initialData?.notificationFrequency || 'immediate',
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open && initialData) {
      setFormData({
        contactId: initialData.contactId || '',
        contactName: initialData.contactName || '',
        role: initialData.role || 'Developer',
        department: initialData.department || 'Engineering',
        gender: initialData.gender || '',
        skills: initialData.skills || [],
        timezone: initialData.timezone || 'UTC',
        availabilitySchedule: initialData.availabilitySchedule,
        maxConcurrentTasks: initialData.maxConcurrentTasks || 5,
        taskTypes: initialData.taskTypes || [],
        priorityLevel: initialData.priorityLevel || 3,
        preferredChannel: initialData.preferredChannel || 'email',
        notificationFrequency: initialData.notificationFrequency || 'immediate',
      });
    } else if (open && !initialData) {
      setFormData({
        contactId: '',
        contactName: '',
        role: 'Developer',
        department: 'Engineering',
        gender: '',
        skills: [],
        timezone: 'UTC',
        availabilitySchedule: undefined,
        maxConcurrentTasks: 5,
        taskTypes: [],
        priorityLevel: 3,
        preferredChannel: 'email',
        notificationFrequency: 'immediate',
      });
    }
  }, [open, initialData]);

  // Fetch contacts for searchable select
  const fetchContacts = useCallback(async (query: string): Promise<SelectOption[]> => {
    try {
      const params = new URLSearchParams();
      if (query) params.append('search', query);
      params.append('limit', '50');

      const response = await api.get(`/contacts?${params.toString()}`);
      const contacts = response.data?.contacts || response.data || [];

      return contacts.map((c: {
        id: string;
        display_name?: string;
        displayName?: string;
        avatar?: string;
        avatarUrl?: string;
        email?: string;
        phone?: string;
      }) => ({
        id: c.id,
        label: c.display_name || c.displayName || 'Unknown',
        sublabel: c.email || c.phone || '',
        avatar: c.avatar || c.avatarUrl,
      }));
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
      return [];
    }
  }, []);

  // Toggle skill
  const toggleSkill = (skill: string) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter(s => s !== skill)
        : [...prev.skills, skill],
    }));
  };

  // Toggle task type
  const toggleTaskType = (type: string) => {
    setFormData(prev => ({
      ...prev,
      taskTypes: prev.taskTypes.includes(type)
        ? prev.taskTypes.filter(t => t !== type)
        : [...prev.taskTypes, type],
    }));
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!formData.contactId) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      // Error handling is done in parent
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Team Member' : 'Add Team Member'}
      size="lg"
      className={className}
      footer={
        <div className="flex gap-3 w-full justify-end">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={!formData.contactId}
            icon={<Save className="w-4 h-4" />}
          >
            {isEdit ? 'Save Changes' : 'Add Member'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6 max-h-[70vh] overflow-y-auto px-1">
        {/* Contact Selection */}
        <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700">
          <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <User className="w-4 h-4" />
            Contact Information
          </h4>

          <SearchableSelect
            label="Contact"
            value={formData.contactId}
            onChange={(id, option) => {
              setFormData(prev => ({
                ...prev,
                contactId: id || '',
                contactName: option?.label || '',
              }));
            }}
            fetchOptions={fetchContacts}
            placeholder="Search contacts..."
            showAvatars
            required
            disabled={isEdit}
            helperText={isEdit ? 'Contact cannot be changed after creation' : 'Select a contact to add as team member'}
          />
        </div>

        {/* Role & Department */}
        <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700">
          <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            Role & Department
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Role <span className="text-red-400">*</span>
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-slate-800/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
              >
                {ROLES.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Department
              </label>
              <select
                value={formData.department}
                onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-slate-800/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
              >
                {DEPARTMENTS.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Gender
            </label>
            <select
              value={formData.gender}
              onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))}
              aria-label="Gender"
              className="w-full px-3 py-2 text-sm bg-slate-800/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
            >
              <option value="">Auto-detect from contact name</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Leave as auto-detect to infer gender from contact name
            </p>
          </div>
        </div>

        {/* Skills */}
        <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700">
          <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Skills
          </h4>
          <p className="text-xs text-gray-500 mb-3">
            Select skills this team member has. Used for AI task assignment.
          </p>

          <div className="flex flex-wrap gap-2">
            {SKILLS.map(skill => (
              <button
                key={skill}
                type="button"
                onClick={() => toggleSkill(skill)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-full border transition-colors',
                  formData.skills.includes(skill)
                    ? 'bg-sky-500/20 border-sky-500 text-sky-400'
                    : 'bg-slate-800/50 border-slate-600 text-gray-400 hover:border-slate-500'
                )}
              >
                {skill.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Task Assignment */}
        <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700">
          <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <CheckSquare className="w-4 h-4" />
            Task Assignment
          </h4>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Max Concurrent Tasks
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={formData.maxConcurrentTasks}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  maxConcurrentTasks: parseInt(e.target.value) || 5,
                }))}
                className="w-full px-3 py-2 text-sm bg-slate-800/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Priority Level (1-5)
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(level => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, priorityLevel: level }))}
                    className={cn(
                      'w-10 h-10 rounded-lg border transition-colors flex items-center justify-center',
                      formData.priorityLevel === level
                        ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                        : 'bg-slate-800/50 border-slate-600 text-gray-400 hover:border-slate-500'
                    )}
                  >
                    <Star className={cn(
                      'w-4 h-4',
                      formData.priorityLevel >= level && 'fill-current'
                    )} />
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Higher priority = assigned first
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Task Types
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Select types of tasks this member can be assigned.
            </p>
            <div className="flex flex-wrap gap-2">
              {TASK_TYPES.map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleTaskType(type)}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-full border transition-colors',
                    formData.taskTypes.includes(type)
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                      : 'bg-slate-800/50 border-slate-600 text-gray-400 hover:border-slate-500'
                  )}
                >
                  {type.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Timezone & Availability */}
        <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700">
          <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Timezone & Availability
          </h4>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Timezone
            </label>
            <select
              value={formData.timezone}
              onChange={(e) => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-slate-800/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
            >
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Used to schedule tasks within working hours
            </p>
          </div>
        </div>

        {/* Notifications */}
        <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700">
          <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Notifications
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Preferred Channel
              </label>
              <select
                value={formData.preferredChannel}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  preferredChannel: e.target.value as 'email' | 'whatsapp' | 'telegram',
                }))}
                className="w-full px-3 py-2 text-sm bg-slate-800/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
              >
                {CHANNELS.map(ch => (
                  <option key={ch.id} value={ch.id}>{ch.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Notification Frequency
              </label>
              <select
                value={formData.notificationFrequency}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  notificationFrequency: e.target.value as 'immediate' | 'hourly' | 'daily',
                }))}
                className="w-full px-3 py-2 text-sm bg-slate-800/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
              >
                {NOTIFICATION_FREQUENCIES.map(freq => (
                  <option key={freq.id} value={freq.id}>{freq.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

TeamMemberForm.displayName = 'TeamMemberForm';

export default TeamMemberForm;
