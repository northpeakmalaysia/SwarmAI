import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Globe,
  Users,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  Calendar,
  Save,
  RefreshCw,
  AlertCircle,
  Facebook,
  Twitter,
  Instagram,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Input } from '../common/Input';
import toast from 'react-hot-toast';
import api from '../../services/api';

export interface BackgroundInfoPanelProps {
  agenticId: string;
  className?: string;
}

interface BackgroundInfo {
  companyName: string;
  industry: string;
  description: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  foundedYear: number | null;
  employeeCount: string;
  timezone: string;
  workingHours: string;
  facebook: string;
  twitter: string;
  instagram: string;
  customFields: Record<string, string>;
}

const defaultBackground: BackgroundInfo = {
  companyName: '',
  industry: '',
  description: '',
  website: '',
  email: '',
  phone: '',
  address: '',
  foundedYear: null,
  employeeCount: '',
  timezone: 'UTC',
  workingHours: '9:00 AM - 5:00 PM',
  facebook: '',
  twitter: '',
  instagram: '',
  customFields: {},
};

const industries = [
  'Technology',
  'Healthcare',
  'Finance',
  'Education',
  'Manufacturing',
  'Retail',
  'Real Estate',
  'Consulting',
  'Marketing',
  'Legal',
  'Non-Profit',
  'Government',
  'Other',
];

const employeeRanges = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1001-5000',
  '5000+',
];

const timezones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Australia/Sydney',
];

export const BackgroundInfoPanel: React.FC<BackgroundInfoPanelProps> = ({
  agenticId,
  className,
}) => {
  const [background, setBackground] = useState<BackgroundInfo>(defaultBackground);
  const [inherited, setInherited] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    contact: true,
    social: false,
    custom: false,
  });
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');

  // Fetch background
  const fetchBackground = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/agentic/profiles/${agenticId}/background`);
      if (response.data.background) {
        setBackground({
          ...defaultBackground,
          ...response.data.background,
        });
      }
      setInherited(response.data.inherited || false);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to fetch background:', error);
    } finally {
      setIsLoading(false);
    }
  }, [agenticId]);

  useEffect(() => {
    fetchBackground();
  }, [fetchBackground]);

  // Update field
  const updateField = (field: keyof BackgroundInfo, value: string | number | null) => {
    setBackground((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  // Save background
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.put(`/agentic/profiles/${agenticId}/background`, background);
      toast.success('Background information saved');
      setHasChanges(false);
    } catch (error: any) {
      console.error('Failed to save background:', error);
      toast.error(error.response?.data?.error || 'Failed to save background');
    } finally {
      setIsSaving(false);
    }
  };

  // Add custom field
  const addCustomField = () => {
    if (!newFieldKey.trim()) return;
    setBackground((prev) => ({
      ...prev,
      customFields: {
        ...prev.customFields,
        [newFieldKey.trim()]: newFieldValue,
      },
    }));
    setNewFieldKey('');
    setNewFieldValue('');
    setHasChanges(true);
  };

  // Remove custom field
  const removeCustomField = (key: string) => {
    setBackground((prev) => {
      const { [key]: _, ...rest } = prev.customFields;
      return { ...prev, customFields: rest };
    });
    setHasChanges(true);
  };

  // Toggle section
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Section header component
  const SectionHeader = ({
    section,
    icon: Icon,
    title,
  }: {
    section: keyof typeof expandedSections;
    icon: React.ElementType;
    title: string;
  }) => (
    <button
      onClick={() => toggleSection(section)}
      className="flex items-center justify-between w-full p-3 bg-swarm-darker rounded-lg hover:bg-swarm-dark/50 transition-colors"
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-sky-400" />
        <span className="font-medium text-white">{title}</span>
      </div>
      {expandedSections[section] ? (
        <ChevronUp className="w-4 h-4 text-gray-400" />
      ) : (
        <ChevronDown className="w-4 h-4 text-gray-400" />
      )}
    </button>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-sky-400" />
          <h4 className="text-sm font-medium text-gray-400">Company Background</h4>
          {inherited && (
            <Badge variant="warning" size="sm">
              Inherited from Master
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchBackground}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={handleSave}
            disabled={!hasChanges || isSaving || inherited}
            loading={isSaving}
            icon={<Save className="w-4 h-4" />}
          >
            Save Changes
          </Button>
        </div>
      </div>

      {/* Inherited Warning */}
      {inherited && (
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">
            This is a sub-agent. Background information is inherited from the master profile.
          </span>
        </div>
      )}

      {/* Basic Information */}
      <div className="space-y-3">
        <SectionHeader section="basic" icon={Building2} title="Basic Information" />
        {expandedSections.basic && (
          <div className="space-y-4 p-4 bg-swarm-darker/50 rounded-lg border border-swarm-border/20">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Company Name *
                </label>
                <Input
                  value={background.companyName}
                  onChange={(e) => updateField('companyName', e.target.value)}
                  placeholder="ACME Corporation"
                  disabled={inherited}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Industry</label>
                <select
                  value={background.industry}
                  onChange={(e) => updateField('industry', e.target.value)}
                  disabled={inherited}
                  className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white disabled:opacity-50"
                >
                  <option value="">Select industry...</option>
                  {industries.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Description</label>
              <textarea
                value={background.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Brief description of the company..."
                disabled={inherited}
                className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white placeholder-gray-500 disabled:opacity-50"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Founded Year
                </label>
                <Input
                  type="number"
                  value={background.foundedYear || ''}
                  onChange={(e) =>
                    updateField('foundedYear', e.target.value ? parseInt(e.target.value) : null)
                  }
                  placeholder="2020"
                  min={1800}
                  max={new Date().getFullYear()}
                  disabled={inherited}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Employee Count
                </label>
                <select
                  value={background.employeeCount}
                  onChange={(e) => updateField('employeeCount', e.target.value)}
                  disabled={inherited}
                  className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white disabled:opacity-50"
                >
                  <option value="">Select range...</option>
                  {employeeRanges.map((range) => (
                    <option key={range} value={range}>
                      {range}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Timezone</label>
                <select
                  value={background.timezone}
                  onChange={(e) => updateField('timezone', e.target.value)}
                  disabled={inherited}
                  className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white disabled:opacity-50"
                >
                  {timezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Contact Information */}
      <div className="space-y-3">
        <SectionHeader section="contact" icon={Phone} title="Contact Information" />
        {expandedSections.contact && (
          <div className="space-y-4 p-4 bg-swarm-darker/50 rounded-lg border border-swarm-border/20">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  <Globe className="w-3 h-3 inline mr-1" />
                  Website
                </label>
                <Input
                  value={background.website}
                  onChange={(e) => updateField('website', e.target.value)}
                  placeholder="https://example.com"
                  disabled={inherited}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  <Mail className="w-3 h-3 inline mr-1" />
                  Email
                </label>
                <Input
                  type="email"
                  value={background.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="contact@example.com"
                  disabled={inherited}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  <Phone className="w-3 h-3 inline mr-1" />
                  Phone
                </label>
                <Input
                  value={background.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="+1 234 567 8900"
                  disabled={inherited}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  Working Hours
                </label>
                <Input
                  value={background.workingHours}
                  onChange={(e) => updateField('workingHours', e.target.value)}
                  placeholder="9:00 AM - 5:00 PM"
                  disabled={inherited}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                <MapPin className="w-3 h-3 inline mr-1" />
                Address
              </label>
              <Input
                value={background.address}
                onChange={(e) => updateField('address', e.target.value)}
                placeholder="123 Business Street, City, Country"
                disabled={inherited}
              />
            </div>
          </div>
        )}
      </div>

      {/* Social Media */}
      <div className="space-y-3">
        <SectionHeader section="social" icon={Globe} title="Social Media" />
        {expandedSections.social && (
          <div className="space-y-4 p-4 bg-swarm-darker/50 rounded-lg border border-swarm-border/20">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  <Facebook className="w-3 h-3 inline mr-1" />
                  Facebook
                </label>
                <Input
                  value={background.facebook}
                  onChange={(e) => updateField('facebook', e.target.value)}
                  placeholder="facebook.com/company"
                  disabled={inherited}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  <Twitter className="w-3 h-3 inline mr-1" />
                  Twitter / X
                </label>
                <Input
                  value={background.twitter}
                  onChange={(e) => updateField('twitter', e.target.value)}
                  placeholder="@company"
                  disabled={inherited}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  <Instagram className="w-3 h-3 inline mr-1" />
                  Instagram
                </label>
                <Input
                  value={background.instagram}
                  onChange={(e) => updateField('instagram', e.target.value)}
                  placeholder="@company"
                  disabled={inherited}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Custom Fields */}
      <div className="space-y-3">
        <SectionHeader section="custom" icon={Briefcase} title="Custom Fields" />
        {expandedSections.custom && (
          <div className="space-y-4 p-4 bg-swarm-darker/50 rounded-lg border border-swarm-border/20">
            {Object.entries(background.customFields).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(background.customFields).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 p-2 bg-swarm-dark rounded-lg"
                  >
                    <span className="text-sm text-gray-400 font-medium min-w-[120px]">{key}:</span>
                    <span className="text-sm text-white flex-1">{value}</span>
                    {!inherited && (
                      <button
                        onClick={() => removeCustomField(key)}
                        className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-2">
                No custom fields added yet
              </p>
            )}

            {!inherited && (
              <div className="flex items-center gap-2 pt-3 border-t border-swarm-border/20">
                <Input
                  value={newFieldKey}
                  onChange={(e) => setNewFieldKey(e.target.value)}
                  placeholder="Field name"
                  className="flex-1"
                />
                <Input
                  value={newFieldValue}
                  onChange={(e) => setNewFieldValue(e.target.value)}
                  placeholder="Value"
                  className="flex-1"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={addCustomField}
                  disabled={!newFieldKey.trim()}
                  icon={<Plus className="w-4 h-4" />}
                >
                  Add
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BackgroundInfoPanel;
