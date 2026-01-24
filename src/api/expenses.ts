// src/api/expenses.ts

import { supabase } from './supabase';
import { Expense, TripBalance, UserProfile } from '../types/database';
import { EXPENSE_STATUSES, CONSENT_STATUSES, SPLIT_TYPES } from '../constants';
import { UUID } from 'crypto';

// --- TYPE UTILITIES ---

interface MemberShare {
  user_id: UUID;
  share_amount: number;
}

interface NewExpenseData {
  trip_id: UUID;
  name: string;
  amount: number;
  payer_id: UUID;
  involvedMembers: MemberShare[]; // Array of members and their calculated shares
}


// --- API FUNCTIONS ---

/**
 * Fetches all members for a given trip.
 */
export async function getTripMembers(tripId: UUID) {
  const { data, error } = await supabase
    .from('trip_members')
    .select('*, user:user_id(id, name)') // Join with user profiles
    .eq('trip_id', tripId);

  if (error) throw error;
  return data;
}


/**
 * Calculates and inserts a new expense, its involvements, and required consents.
 * This is the core business logic for expense creation.
 */
export async function createNewExpense({
  trip_id,
  name,
  amount,
  payer_id,
  involvedMembers,
}: NewExpenseData) {
  
  // 1. Insert the main expense record
  const { data: expenseData, error: expenseError } = await supabase
    .from('expenses')
    .insert({
      trip_id,
      name,
      amount,
      payer_id,
      status: EXPENSE_STATUSES.APPROVED,
    })
    .select('expense_id')
    .single();

  if (expenseError) throw expenseError;
  const newExpenseId = expenseData.expense_id;

  // 2. Prepare involvements and consents
  const involvements = involvedMembers.map(m => ({
    expense_id: newExpenseId,
    debtor_user_id: m.user_id,
    share_amount: m.share_amount,
    split_type: SPLIT_TYPES.EQUAL, // Simplified for now
  }));

  const consents = involvedMembers
    .filter(m => m.user_id !== payer_id) // Payer does not need to consent
    .map(m => ({
      expense_id: newExpenseId,
      debtor_user_id: m.user_id,
      status: CONSENT_STATUSES.REQUIRED,
    }));

  // 3. Insert Involvements (Debts)
  const { error: involveError } = await supabase
    .from('involvements')
    .insert(involvements);

  if (involveError) throw involveError;

  // 4. Insert Consents (Approvals)
  const { error: consentError } = await supabase
    .from('consents')
    .insert(consents);

  if (consentError) throw consentError;

  // NOTE: A Supabase database trigger/function should run after inserting consents
  // to check for 'Pre_Approved' delegates and update the status automatically.

  return { expenseId: newExpenseId, success: true };
}


/**
 * Fetches the calculated net balances for all members of a trip using the SQL View.
 */
export async function getTripBalances(tripId: UUID): Promise<TripBalance[]> {
  const { data, error } = await supabase
    .from('trip_balances') // This calls the SQL View we created
    .select('*')
    .eq('trip_id', tripId);

  if (error) throw error;
  return data;
}

export async function getPendingConsents(tripId: UUID, userId: UUID) {
  const { data, error } = await supabase
    .from('consents')
    .select(`
      consent_id,
      status,
      reason,
      expense:expense_id (
        expense_id,
        name,
        amount,
        payer:payer_id (name)
      )
    `)
    .eq('debtor_user_id', userId)
    .eq('status', CONSENT_STATUSES.REQUIRED)
    .eq('expense.trip_id', tripId)
    .order('timestamp', { ascending: false });

  if (error) throw error;
  // The join returns data in a nested format (e.g., data[0].expense.name)
  return data;
}

/**
 * Updates a user's consent status for a specific expense.
 */
export async function updateConsentStatus(
  consentId: UUID,
  newStatus: 'Approved' | 'Disputed',
  reason?: string
) {
  const { error } = await supabase
    .from('consents')
    .update({ 
        status: newStatus, 
        reason: reason || null,
        timestamp: new Date().toISOString() 
    })
    .eq('consent_id', consentId);

  if (error) throw error;
  
  // NOTE: This UPDATE triggers the server-side logic (Edge Function/Trigger) 
  // to check if ALL consents are now 'Approved' and update the main 'expenses' status.

  return { success: true };
}

export async function getTripExpenses(tripId: string) {
  const { data, error } = await supabase
    .from('expenses')
    .select(`
      expense_id,
      name,
      amount,
      date_incurred,
      status,
      payer_id,
      payer:users!expenses_payer_id_fkey (
        id,
        name
      ),
      consents:consents (
        debtor_user_id,
        status
      )
    `)
    .eq('trip_id', tripId)
    .order('date_incurred', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getTripExpensesForUser(
  tripId: string,
  userId: string
) {
  if (!tripId || !userId) return [];

  /* 1️⃣ Expenses paid by the user */
  const { data: paid, error: e1 } = await supabase
    .from('expenses')
    .select(`
      expense_id,
      name,
      amount,
      payer_id,
      payer:users!expenses_payer_id_fkey(name),
      consents (
        debtor_user_id,
        status
      )
    `)
    .eq('trip_id', tripId)
    .eq('payer_id', userId);

  if (e1) throw e1;

  /* 2️⃣ Get expense IDs where user is involved */
  const { data: consentRows, error: e2 } = await supabase
    .from('consents')
    .select('expense_id')
    .eq('debtor_user_id', userId);

  if (e2) throw e2;

  const expenseIds = (consentRows ?? []).map(r => r.expense_id);

  /* 3️⃣ Fetch those expenses */
  let involved: any[] = [];
  if (expenseIds.length > 0) {
    const { data, error: e3 } = await supabase
      .from('expenses')
      .select(`
        expense_id,
        name,
        amount,
        payer_id,
        payer:users!expenses_payer_id_fkey(name),
        consents (
          debtor_user_id,
          status
        )
      `)
      .eq('trip_id', tripId)
      .in('expense_id', expenseIds);

    if (e3) throw e3;
    involved = data ?? [];
  }

  /* 4️⃣ Merge + deduplicate */
  const map = new Map<string, any>();
  [...(paid ?? []), ...involved].forEach(e =>
    map.set(e.expense_id, e)
  );

  return Array.from(map.values());
}

export async function getPeerBalance(
  tripId: string,
  currentUserId: string,
  targetUserId: string
) {
  if (!tripId || !currentUserId || !targetUserId) return 0;

  // 1. Fetch all expenses for this trip where either person was the payer
  const { data: expenses, error } = await supabase
    .from('expenses')
    .select(`
      amount,
      payer_id,
      consents (
        debtor_user_id
      )
    `)
    .eq('trip_id', tripId)
    .or(`payer_id.eq.${currentUserId},payer_id.eq.${targetUserId}`);

  if (error) throw error;

  let netBalance = 0;

  expenses.forEach((expense) => {
    const totalAmount = expense.amount;
    const involved = expense.consents || [];
    const shareCount = involved.length;

    if (shareCount === 0) return;
    const shareAmount = totalAmount / shareCount;

    // SCENARIO A: Current User paid
    if (expense.payer_id === currentUserId) {
      // Check if Target User owes a share
      const isTargetInvolved = involved.some(c => c.debtor_user_id === targetUserId);
      if (isTargetInvolved) {
        netBalance += shareAmount; // They owe you
      }
    }

    // SCENARIO B: Target User paid
    if (expense.payer_id === targetUserId) {
      // Check if Current User owes a share
      const amIInvolved = involved.some(c => c.debtor_user_id === currentUserId);
      if (amIInvolved) {
        netBalance -= shareAmount; // You owe them
      }
    }
  });

  return netBalance;
}

export async function getDisputedExpenses(tripId: UUID, payerId: UUID) {
  const { data, error } = await supabase
    .from('consents')
    .select(`
      consent_id,
      debtor_user_id,
      expense:expense_id (
        expense_id,
        name,
        amount,
        payer_id
      )
    `)
    .eq('status', CONSENT_STATUSES.DISPUTED)
    .eq('expense.trip_id', tripId)
    .eq('expense.payer_id', payerId);

  if (error) throw error;
  return data;
}

export async function raiseDispute(expenseId: string, userId: string) {
  const { error } = await supabase
    .from('consents')
    .update({
      status: 'Disputed',
      timestamp: new Date().toISOString(),
    })
    .eq('expense_id', expenseId)
    .eq('debtor_user_id', userId);

  if (error) throw error;
}
