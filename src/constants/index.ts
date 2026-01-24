// src/constants/index.ts

export const CURRENCY = '₹';

export const TRIP_STATUSES = {
  ACTIVE: 'Active',
  SETTLEMENT: 'Settlement',
  ARCHIVED: 'Archived',
} as const;

export const EXPENSE_STATUSES = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  SETTLED: 'Settled',
} as const;

export const CONSENT_STATUSES = {
  REQUIRED: 'Required',
  PRE_APPROVED: 'Pre_Approved',
  APPROVED: 'Approved',
  DISPUTED: 'Disputed',
} as const;

export const SPLIT_TYPES = {
  EQUAL: 'Equal',
  CUSTOM: 'Custom',
  PERCENTAGE: 'Percentage',
} as const;

// Shared styles (optional, but good practice)
export const Colors = {
  primary: '#007AFF',
  secondary: '#34C759',
  background: '#F9F9F9',
  text: '#1C1C1E',
  danger: '#FF3B30',
  success: '#34C759',
};