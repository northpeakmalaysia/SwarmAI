'use strict';

/**
 * Gender Detection Utility
 * Infers gender from names using Malay/Indonesian/English name patterns.
 * Returns 'male', 'female', or null (unknown).
 */

// Female name prefixes/parts (Malay/Indonesian)
const FEMALE_PATTERNS = [
  // Malay/Indonesian female prefixes
  'nur', 'siti', 'nurul', 'noor', 'noorul', 'wan', 'nik',
  // Common female names
  'aisyah', 'aishah', 'aisha', 'fatimah', 'khadijah', 'zainab',
  'sakinah', 'sakina', 'rahmah', 'hajar', 'maryam', 'mariam',
  'aminah', 'halimah', 'safiyyah', 'sofia', 'sophia',
  'farihah', 'faridah', 'farah', 'farhana', 'fitriah', 'fitri',
  'hidayah', 'hamidah', 'hanisah', 'hanis', 'hayati',
  'izzah', 'izzati', 'intan',
  'jamilah', 'jasmin', 'jasmine',
  'kartini', 'karimah', 'khairunnisa',
  'latifah', 'laila', 'lina',
  'maizura', 'marlina', 'mastura', 'mazlina', 'maziah',
  'nabila', 'nadia', 'nadiah', 'nadhirah', 'najwa', 'nasreen',
  'puteri', 'putri',
  'raihana', 'rania', 'rashidah', 'rohana', 'rosemary', 'rosmah', 'ruqayyah',
  'salmah', 'salma', 'sarah', 'sharifah', 'sumayyah', 'suraya', 'suzana',
  'tengku', // Can be both but often female in certain contexts
  'umi', 'ummi',
  'wardah', 'wati',
  'yasmin', 'yusra',
  'zahrah', 'zaiton', 'zakiah', 'zulaikha',
  // English/Western female names
  'alice', 'amanda', 'amy', 'angela', 'anna', 'anne',
  'barbara', 'betty', 'brenda', 'brittany',
  'carol', 'caroline', 'catherine', 'charlotte', 'christina', 'claire', 'cynthia',
  'deborah', 'diana', 'donna', 'dorothy',
  'elizabeth', 'emily', 'emma', 'eva', 'evelyn',
  'grace', 'hannah', 'heather', 'helen',
  'irene', 'isabella', 'jane', 'janet', 'jennifer', 'jessica', 'joan', 'joyce', 'julia', 'julie',
  'karen', 'kate', 'katherine', 'kelly', 'kim', 'kimberly',
  'laura', 'lauren', 'linda', 'lisa', 'lucy',
  'margaret', 'maria', 'marie', 'martha', 'mary', 'melissa', 'michelle', 'monica',
  'nancy', 'natalie', 'nicole',
  'olivia', 'pamela', 'patricia', 'rachel', 'rebecca', 'rose', 'ruth',
  'samantha', 'sandra', 'sharon', 'stephanie', 'susan', 'tammy', 'teresa', 'tiffany',
  'victoria', 'virginia', 'wendy',
];

// Male name prefixes/parts (Malay/Indonesian)
const MALE_PATTERNS = [
  // Malay/Indonesian male prefixes
  'muhammad', 'mohd', 'mohamad', 'mohamed', 'mohammad', 'muhamad',
  'ahmad', 'ahmed',
  'abu', 'bin', 'ibn',
  // Common male names
  'abdul', 'abdullah', 'adnan', 'afiq', 'aiman', 'akhtar', 'akmal', 'ali', 'amir', 'amin', 'anwar', 'arif', 'ashraf', 'azhar', 'aziz', 'azlan', 'azman',
  'badrul', 'bakar',
  'danial', 'danish',
  'faiz', 'faizal', 'fakhrul', 'farhan', 'fauzi', 'fikri', 'fuad',
  'hafiz', 'hakim', 'hamdan', 'haris', 'harith', 'hasif', 'hassan', 'haziq', 'husain', 'hussein',
  'idris', 'ikmal', 'ilham', 'imran', 'irfan', 'iskandar', 'ismail', 'izzat',
  'jamal', 'johan',
  'kamal', 'khairul', 'khalid', 'khalil',
  'luqman',
  'mahdi', 'malik', 'mazlan', 'mizan', 'muaz', 'mujahid', 'mukhriz', 'munir', 'mustafa', 'muzaffar',
  'nabil', 'nafis', 'naim', 'nasir', 'nazri', 'nizam', 'nordin',
  'omar', 'osman',
  'qadir', 'qusyairi',
  'rafiq', 'rahim', 'rahman', 'rashid', 'razak', 'redzuan', 'ridzuan', 'rizal', 'rizwan', 'roslan',
  'saiful', 'syaiful', 'salahuddin', 'shafiq', 'shahril', 'shahrizal', 'shahrul', 'shaiful', 'suhaimi', 'syahmi',
  'taufik', 'taufiq',
  'umar', 'uthman',
  'wafi', 'wahid',
  'yusof', 'yusuf', 'yusri',
  'zafri', 'zaidi', 'zainal', 'zaki', 'zamri', 'zulkifli', 'zulkarnain',
  // English/Western male names
  'adam', 'alan', 'albert', 'alexander', 'andrew', 'anthony', 'arthur',
  'benjamin', 'brandon', 'brian', 'bruce',
  'carl', 'charles', 'chris', 'christopher', 'craig',
  'daniel', 'david', 'dennis', 'donald', 'douglas',
  'edward', 'eric', 'eugene',
  'frank', 'frederick', 'gary', 'george', 'gerald', 'gregory',
  'harold', 'harry', 'henry', 'howard',
  'jack', 'jacob', 'james', 'jason', 'jeffrey', 'jeremy', 'jimmy', 'joe', 'john', 'jonathan', 'joseph', 'joshua', 'justin',
  'keith', 'kenneth', 'kevin', 'kyle',
  'larry', 'lawrence', 'leonard', 'louis', 'luke',
  'mark', 'martin', 'matthew', 'michael', 'nathan', 'nicholas', 'noah',
  'patrick', 'paul', 'peter', 'philip',
  'ralph', 'raymond', 'richard', 'robert', 'roger', 'ronald', 'russell', 'ryan',
  'samuel', 'scott', 'sean', 'simon', 'stephen', 'steven', 'terry', 'thomas', 'timothy', 'todd', 'tyler',
  'vincent', 'walter', 'wayne', 'william',
];

// Build Sets for fast lookup
const FEMALE_SET = new Set(FEMALE_PATTERNS);
const MALE_SET = new Set(MALE_PATTERNS);

/**
 * Clean a display name to extract meaningful name parts.
 * Removes emojis, special characters, prefixes like "~~", etc.
 */
function cleanName(displayName) {
  if (!displayName) return [];

  let cleaned = displayName
    // Remove emojis
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}]/gu, '')
    // Remove special prefixes like ~~
    .replace(/^[~!@#$%^&*()_+=\[\]{}|\\:;"'<>,.?/-]+/, '')
    // Remove trailing special chars
    .replace(/[~!@#$%^&*()_+=\[\]{}|\\:;"'<>,.?/-]+$/, '')
    // Remove phone number patterns
    .replace(/\+?\d{8,}/g, '')
    .trim();

  // Split into words and filter empty
  return cleaned.split(/\s+/).filter(w => w.length >= 2);
}

/**
 * Detect gender from a display name.
 * @param {string} displayName - The contact's display name
 * @returns {'male'|'female'|null} - Detected gender or null if unknown
 */
function detectGender(displayName) {
  const nameParts = cleanName(displayName);

  if (nameParts.length === 0) return null;

  // Check each name part against patterns
  for (const part of nameParts) {
    const lower = part.toLowerCase();

    // Check female patterns first (Nur, Siti are strong female indicators)
    if (FEMALE_SET.has(lower)) return 'female';

    // Check male patterns
    if (MALE_SET.has(lower)) return 'male';
  }

  // Check for partial matches (prefix matching for compound names)
  for (const part of nameParts) {
    const lower = part.toLowerCase();

    // Strong male prefixes
    if (lower.startsWith('muhd') || lower.startsWith('mohd') || lower.startsWith('muhamma')) return 'male';

    // Strong female prefixes
    if (lower.startsWith('nuru') || lower.startsWith('siti')) return 'female';
  }

  return null; // Unknown
}

module.exports = { detectGender, cleanName };
