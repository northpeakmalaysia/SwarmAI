
/**
 * Format contact display name from raw platform IDs
 * Converts WhatsApp IDs like "60123782993@c.us" to formatted phone numbers
 */
export const formatContactDisplay = (name: string | undefined, id?: string): string => {
  const displayName = name || id || '';

  // Handle WhatsApp user IDs: 60123782993@c.us
  if (displayName.includes('@c.us')) {
    const phone = displayName.replace('@c.us', '');
    // Format: +60 123 782 993 (Malaysia format example)
    if (phone.length >= 10) {
      const countryCode = phone.slice(0, 2);
      const rest = phone.slice(2);
      // Split rest into groups of 3-4 digits
      const parts = rest.match(/.{1,3}/g) || [];
      return `+${countryCode} ${parts.join(' ')}`;
    }
    return `+${phone}`;
  }

  // Handle WhatsApp group IDs: 120363163332595884@g.us
  if (displayName.includes('@g.us')) {
    return 'Group Chat';
  }

  // Handle Telegram IDs
  if (displayName.startsWith('telegram:')) {
    return displayName.replace('telegram:', '@');
  }

  return displayName || 'Unknown';
};
