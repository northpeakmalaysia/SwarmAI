import { useState } from 'react';
import { X, User, Mail, Phone, MessageSquare, Building, Tag, FileText } from 'lucide-react';
import { useContactStore, ContactCreateInput, PlatformType } from '../../stores/contactStore';

export interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const TAG_OPTIONS = [
  { value: 'Customer', color: 'bg-blue-500' },
  { value: 'Lead', color: 'bg-yellow-500' },
  { value: 'VIP', color: 'bg-purple-500' },
  { value: 'Partner', color: 'bg-green-500' },
  { value: 'Enterprise', color: 'bg-orange-500' },
];

const PLATFORM_OPTIONS: { value: PlatformType; label: string; icon: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp', icon: 'W' },
  { value: 'telegram-user', label: 'Telegram', icon: 'T' },
  { value: 'email', label: 'Email', icon: 'E' },
];

export function AddContactModal({ isOpen, onClose, onSuccess }: AddContactModalProps) {
  const { createContact, addTag, isLoading } = useContactStore();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    notes: '',
    platform: 'whatsapp' as PlatformType,
  });

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const getInitials = () => {
    const first = formData.firstName.charAt(0).toUpperCase();
    const last = formData.lastName.charAt(0).toUpperCase();
    return first + last || 'NC';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.firstName.trim()) {
      setError('First name is required');
      return;
    }

    try {
      const contactInput: ContactCreateInput = {
        displayName: `${formData.firstName} ${formData.lastName}`.trim(),
        primaryEmail: formData.email || undefined,
        primaryPhone: formData.phone || undefined,
        company: formData.company || undefined,
        notes: formData.notes || undefined,
      };

      const newContact = await createContact(contactInput);

      // Add tags to the new contact
      for (const tag of selectedTags) {
        const tagOption = TAG_OPTIONS.find(t => t.value === tag);
        await addTag(newContact.id, tag, tagOption?.color);
      }

      // Reset form
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        company: '',
        notes: '',
        platform: 'whatsapp',
      });
      setSelectedTags([]);

      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create contact');
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-swarm-card border border-swarm-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-swarm-border">
          <h2 className="text-lg font-semibold text-white">Add New Contact</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-swarm-dark rounded-lg transition-colors text-gray-400 hover:text-white"
            type="button"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Avatar Preview */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-swarm-primary to-swarm-secondary flex items-center justify-center text-white text-2xl font-bold">
              {getInitials()}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Name Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">First Name *</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="John"
                  className="w-full pl-10 pr-4 py-2.5 bg-swarm-dark border border-swarm-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-swarm-primary focus:border-transparent"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Last Name</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                placeholder="Doe"
                className="w-full px-4 py-2.5 bg-swarm-dark border border-swarm-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-swarm-primary focus:border-transparent"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="john@example.com"
                className="w-full pl-10 pr-4 py-2.5 bg-swarm-dark border border-swarm-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-swarm-primary focus:border-transparent"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+1 234 567 8900"
                className="w-full pl-10 pr-4 py-2.5 bg-swarm-dark border border-swarm-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-swarm-primary focus:border-transparent"
              />
            </div>
          </div>

          {/* Platform Selection */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Primary Platform</label>
            <div className="flex gap-2">
              {PLATFORM_OPTIONS.map((platform) => (
                <button
                  key={platform.value}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, platform: platform.value }))}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border transition-all ${
                    formData.platform === platform.value
                      ? 'bg-swarm-primary/20 border-swarm-primary text-swarm-primary'
                      : 'bg-swarm-dark border-swarm-border text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-sm">{platform.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Company */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Company</label>
            <div className="relative">
              <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                placeholder="Company name"
                className="w-full pl-10 pr-4 py-2.5 bg-swarm-dark border border-swarm-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-swarm-primary focus:border-transparent"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-400 mb-2">
              <Tag className="w-4 h-4" />
              Tags
            </label>
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map((tag) => (
                <button
                  key={tag.value}
                  type="button"
                  onClick={() => toggleTag(tag.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    selectedTags.includes(tag.value)
                      ? `${tag.color} text-white`
                      : 'bg-swarm-dark text-gray-400 hover:bg-swarm-darker'
                  }`}
                >
                  {tag.value}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-400 mb-1.5">
              <FileText className="w-4 h-4" />
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Add any notes about this contact..."
              rows={3}
              className="w-full px-4 py-2.5 bg-swarm-dark border border-swarm-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-swarm-primary focus:border-transparent resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-swarm-dark border border-swarm-border rounded-lg text-gray-300 hover:bg-swarm-darker transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-swarm-primary hover:bg-swarm-primary/90 rounded-lg text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating...' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
