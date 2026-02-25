import React, { useState, useEffect } from 'react';
import { User, Mail, Globe, Clock, Camera, Save, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { Card, CardHeader, CardBody } from '../common/Card';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import api from '../../services/api';

/**
 * Timezone options organized by GMT offset for easy selection
 * Grouped by offset, sorted from UTC-12 to UTC+14
 */
const timezones = [
  // UTC-12:00
  { value: 'Etc/GMT+12', label: 'GMT -12:00 (Baker Island)', offset: -12 },

  // UTC-11:00
  { value: 'Pacific/Samoa', label: 'GMT -11:00 (Samoa)', offset: -11 },

  // UTC-10:00
  { value: 'Pacific/Honolulu', label: 'GMT -10:00 (Hawaii)', offset: -10 },

  // UTC-09:00
  { value: 'America/Anchorage', label: 'GMT -09:00 (Alaska)', offset: -9 },

  // UTC-08:00
  { value: 'America/Los_Angeles', label: 'GMT -08:00 (Los Angeles, Vancouver)', offset: -8 },

  // UTC-07:00
  { value: 'America/Denver', label: 'GMT -07:00 (Denver, Phoenix)', offset: -7 },

  // UTC-06:00
  { value: 'America/Chicago', label: 'GMT -06:00 (Chicago, Mexico City)', offset: -6 },

  // UTC-05:00
  { value: 'America/New_York', label: 'GMT -05:00 (New York, Toronto, Lima)', offset: -5 },

  // UTC-04:00
  { value: 'America/Halifax', label: 'GMT -04:00 (Halifax, Santiago)', offset: -4 },

  // UTC-03:00
  { value: 'America/Sao_Paulo', label: 'GMT -03:00 (Sao Paulo, Buenos Aires)', offset: -3 },

  // UTC-02:00
  { value: 'Atlantic/South_Georgia', label: 'GMT -02:00 (Mid-Atlantic)', offset: -2 },

  // UTC-01:00
  { value: 'Atlantic/Azores', label: 'GMT -01:00 (Azores)', offset: -1 },

  // UTC+00:00
  { value: 'UTC', label: 'GMT +00:00 (UTC, London, Accra)', offset: 0 },

  // UTC+01:00
  { value: 'Europe/Paris', label: 'GMT +01:00 (Paris, Berlin, Lagos)', offset: 1 },

  // UTC+02:00
  { value: 'Europe/Athens', label: 'GMT +02:00 (Athens, Cairo, Johannesburg)', offset: 2 },

  // UTC+03:00
  { value: 'Europe/Moscow', label: 'GMT +03:00 (Moscow, Riyadh, Nairobi)', offset: 3 },

  // UTC+04:00
  { value: 'Asia/Dubai', label: 'GMT +04:00 (Dubai, Baku)', offset: 4 },

  // UTC+05:00
  { value: 'Asia/Karachi', label: 'GMT +05:00 (Karachi, Tashkent)', offset: 5 },

  // UTC+05:30
  { value: 'Asia/Kolkata', label: 'GMT +05:30 (India, Sri Lanka)', offset: 5.5 },

  // UTC+06:00
  { value: 'Asia/Dhaka', label: 'GMT +06:00 (Dhaka, Almaty)', offset: 6 },

  // UTC+07:00
  { value: 'Asia/Bangkok', label: 'GMT +07:00 (Bangkok, Jakarta, Hanoi)', offset: 7 },

  // UTC+08:00
  { value: 'Asia/Kuala_Lumpur', label: 'GMT +08:00 (Malaysia, Singapore)', offset: 8 },
  { value: 'Asia/Shanghai', label: 'GMT +08:00 (China - Beijing, Shanghai, Hong Kong)', offset: 8 },
  { value: 'Asia/Taipei', label: 'GMT +08:00 (Taiwan)', offset: 8 },
  { value: 'Asia/Manila', label: 'GMT +08:00 (Philippines)', offset: 8 },
  { value: 'Australia/Perth', label: 'GMT +08:00 (Australia - Perth)', offset: 8 },
  { value: 'Asia/Brunei', label: 'GMT +08:00 (Brunei)', offset: 8 },

  // UTC+09:00
  { value: 'Asia/Tokyo', label: 'GMT +09:00 (Tokyo, Seoul)', offset: 9 },

  // UTC+09:30
  { value: 'Australia/Darwin', label: 'GMT +09:30 (Darwin, Adelaide)', offset: 9.5 },

  // UTC+10:00
  { value: 'Australia/Sydney', label: 'GMT +10:00 (Sydney, Melbourne, Brisbane)', offset: 10 },

  // UTC+11:00
  { value: 'Pacific/Noumea', label: 'GMT +11:00 (Noumea, Solomon Islands)', offset: 11 },

  // UTC+12:00
  { value: 'Pacific/Auckland', label: 'GMT +12:00 (Auckland, Fiji)', offset: 12 },

  // UTC+13:00
  { value: 'Pacific/Tongatapu', label: 'GMT +13:00 (Tonga)', offset: 13 },
];

/**
 * Language options for user preference
 */
const languages = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish (Espanol)' },
  { value: 'fr', label: 'French (Francais)' },
  { value: 'de', label: 'German (Deutsch)' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese (Simplified)' },
  { value: 'id', label: 'Indonesian (Bahasa)' },
  { value: 'pt', label: 'Portuguese (Portugues)' },
];

interface ProfileFormData {
  name: string;
  email: string;
  avatar: string;
  timezone: string;
  language: string;
}

/**
 * ProfileSettings Component
 *
 * Allows users to manage their profile information including
 * display name, email, avatar, timezone, and language preferences.
 */
export const ProfileSettings: React.FC = () => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [formData, setFormData] = useState<ProfileFormData>({
    name: '',
    email: '',
    avatar: '',
    timezone: 'UTC',
    language: 'en',
  });
  const [isDirty, setIsDirty] = useState(false);

  // Initialize form data from user
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        avatar: (user as { avatar?: string }).avatar || '',
        timezone: (user as { preferences?: { timezone?: string } }).preferences?.timezone || 'UTC',
        language: (user as { preferences?: { language?: string } }).preferences?.language || 'en',
      });
    }
  }, [user]);

  const handleInputChange = (field: keyof ProfileFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    setAvatarLoading(true);
    try {
      // Create FormData for upload
      const formDataUpload = new FormData();
      formDataUpload.append('avatar', file);

      const response = await api.post('/users/avatar', formDataUpload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setFormData(prev => ({ ...prev, avatar: response.data.avatarUrl }));
      toast.success('Avatar uploaded successfully');
    } catch (error) {
      console.error('Avatar upload error:', error);
      toast.error('Failed to upload avatar');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleSave = async () => {
    if (!isDirty) return;

    setLoading(true);
    try {
      await api.patch('/users/profile', {
        name: formData.name,
        avatar: formData.avatar,
        preferences: {
          timezone: formData.timezone,
          language: formData.language,
        },
      });

      // Refresh user data in auth store to get updated preferences
      const { refreshUser } = useAuthStore.getState();
      await refreshUser();

      toast.success('Profile updated successfully');
      setIsDirty(false);
    } catch (error) {
      console.error('Profile update error:', error);
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Avatar Section */}
      <Card variant="pressed">
        <CardHeader title="Profile Picture" subtitle="Upload a photo to personalize your account" />
        <CardBody>
          <div className="flex items-center gap-6">
            {/* Avatar Preview */}
            <div className="relative group">
              <div
                className={cn(
                  'w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden',
                  'border-2 border-slate-600'
                )}
              >
                {formData.avatar ? (
                  <img
                    src={formData.avatar}
                    alt="Profile avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-12 h-12 text-gray-400" />
                )}
              </div>
              {/* Overlay on hover */}
              <label
                className={cn(
                  'absolute inset-0 rounded-full bg-black/50 flex items-center justify-center',
                  'opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer'
                )}
              >
                {avatarLoading ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Camera className="w-6 h-6 text-white" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                  disabled={avatarLoading}
                />
              </label>
            </div>

            <div className="flex-1">
              <h4 className="text-sm font-medium text-white mb-1">Change avatar</h4>
              <p className="text-sm text-gray-400 mb-3">
                JPG, GIF or PNG. Max size 2MB.
              </p>
              <label className="inline-block">
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Camera className="w-4 h-4" />}
                  loading={avatarLoading}
                  disabled={avatarLoading}
                >
                  Upload Photo
                </Button>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                  disabled={avatarLoading}
                />
              </label>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Basic Info Section */}
      <Card variant="pressed">
        <CardHeader title="Basic Information" subtitle="Update your personal details" />
        <CardBody>
          <div className="space-y-4">
            <Input
              label="Display Name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Enter your name"
              iconLeft={<User className="w-4 h-4" />}
            />

            <Input
              label="Email Address"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="Enter your email"
              iconLeft={<Mail className="w-4 h-4" />}
              disabled
              helperText="Email cannot be changed. Contact support if you need to update it."
            />
          </div>
        </CardBody>
      </Card>

      {/* Preferences Section */}
      <Card variant="pressed">
        <CardHeader title="Preferences" subtitle="Customize your experience" />
        <CardBody>
          <div className="space-y-4">
            {/* Timezone Select */}
            <div className="flex flex-col gap-1.5 w-full">
              <label className="text-sm font-medium text-gray-300">
                Timezone
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Clock className="w-4 h-4" />
                </div>
                <select
                  value={formData.timezone}
                  onChange={(e) => handleInputChange('timezone', e.target.value)}
                  size={timezones.length}
                  aria-label="Select timezone"
                  className={cn(
                    'w-full rounded-lg border bg-slate-800/50 text-white',
                    'pl-10 pr-4 py-2 text-sm',
                    'transition-colors duration-200',
                    'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-900',
                    'border-slate-600 focus:border-sky-500 focus:ring-sky-500/50',
                    'cursor-pointer',
                    '[&>option]:py-2 [&>option]:px-2',
                    '[&>option:checked]:bg-sky-600 [&>option:checked]:text-white',
                    '[&>option:hover]:bg-slate-700'
                  )}
                >
                  {timezones.map((tz) => (
                    <option key={tz.value} value={tz.value} className="py-2">
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-sm text-gray-500">
                Used for displaying times and scheduling
              </p>
            </div>

            {/* Language Select */}
            <div className="flex flex-col gap-1.5 w-full">
              <label className="text-sm font-medium text-gray-300">
                Language
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <Globe className="w-4 h-4" />
                </div>
                <select
                  value={formData.language}
                  onChange={(e) => handleInputChange('language', e.target.value)}
                  aria-label="Select language"
                  className={cn(
                    'w-full rounded-lg border bg-slate-800/50 text-white',
                    'pl-10 pr-4 py-2 text-sm',
                    'transition-colors duration-200',
                    'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-900',
                    'border-slate-600 focus:border-sky-500 focus:ring-sky-500/50',
                    'appearance-none cursor-pointer'
                  )}
                >
                  {languages.map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                Choose your preferred language for the interface
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          variant="primary"
          icon={<Save className="w-4 h-4" />}
          onClick={handleSave}
          loading={loading}
          disabled={!isDirty || loading}
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default ProfileSettings;
