export const APP_NAME = 'Community Events';
export const TAGLINE  = 'Create – Share – Connect';

export const EVENT_TYPES = [
  'Majlis',
  'Milad',
  'Prayers',
  'Dua',
  'Prayers & Amal',
  'Birthday',
  'Informal get together',
  'Custom'           // ← triggers custom type text box
];

export const AUDIENCE_TYPES = [
  'Gents only',
  'Ladies only',
  'Kids only',
  'Family Event'
];

export const RECITER_TYPES = [
  'Soz', 'Salam', 'Manqebat', 'Noha', 'Marsiya', 'Hadees-e-Kisa', 'Reciter', 'Peshkhani', 'Other'
];

export const ROLES = {
  USER:        'user',
  ADMIN:       'admin',
  SUPER_ADMIN: 'superAdmin'
};

export const STATUS = { ACTIVE: 'active' };

// Event types that show Speaker + Reciters
// Custom type also shows them (requirement #2)
export const RELIGIOUS_EVENT_TYPES = ['Majlis', 'Milad', 'Prayers', 'Dua', 'Prayers & Amal', 'Custom'];
