// src/types/database.ts

import { UUID } from 'crypto';

// General user profile information linked to Supabase Auth
export interface UserProfile {
  id: UUID;
  name: string;
  email: string;
  default_upi_vpa: string | null;
}

// Data from the 'trips' table
export interface Trip {
  trip_id: UUID;
  name: string;
  creator_id: UUID;
  currency: 'INR' | 'USD' | string;
  status: 'Active' | 'Settlement' | 'Archived';
}

// Data from the 'expenses' table
export interface Expense {
  expense_id: UUID;
  trip_id: UUID;
  name: string;
  amount: number;
  payer_id: UUID;
  date_incurred: string;
  status: 'Pending' | 'Approved' | 'Disputed' | 'Settled';
}

// Data from the 'trip_balances' SQL VIEW
export interface TripBalance {
  trip_id: UUID;
  user_id: UUID;
  user_name: string;
  total_paid: number;
  total_owed: number;
  net_balance: number; // Positive = Lender, Negative = Debtor
}

export interface ExpenseWithPayer {
  name: string;
  amount: number;
  payer: UserProfile | null;
}

export interface Consent {
  consent_id: UUID;
  expense: ExpenseWithPayer | null;
}
