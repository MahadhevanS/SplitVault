// src/api/expenses.ts

import { supabase } from './supabase';
import { Expense, TripBalance, UserProfile } from '../types/database';
import { EXPENSE_STATUSES, CONSENT_STATUSES, SPLIT_TYPES } from '../constants';
import { UUID } from 'crypto';

// --- TYPE UTILITIES ---

interface MemberShare {
  user_id: string;
  share_amount: number;
}

interface NewExpenseData {
  trip_id: string;
  name: string;
  amount: number;
  payer_id: string;
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

  /* ---------- VALIDATIONS ---------- */

  if (!trip_id || !payer_id) {
    throw new Error('Trip ID and Payer ID are required');
  }

  if (!Array.isArray(involvedMembers)) {
    throw new Error('Involved members must be an array');
  }

  if (involvedMembers.length === 0) {
    throw new Error('At least one debtor is required');
  }

  // Ensure payer is NOT part of debtors
  if (involvedMembers.some(m => m.user_id === payer_id)) {
    throw new Error('Payer cannot be a debtor');
  }

  /* ---------- STEP 1: INSERT EXPENSE ---------- */

  const { data: expenseData, error: expenseError } = await supabase
    .from('expenses')
    .insert({
      trip_id,          // UUID as string ✅
      name,
      amount,
      payer_id,         // UUID as string ✅
      status: EXPENSE_STATUSES.APPROVED,
    })
    .select('expense_id')
    .single();

  if (expenseError) throw expenseError;

  const newExpenseId = expenseData.expense_id;

  /* ---------- STEP 2: PREPARE INVOLVEMENTS ---------- */

  const involvements = involvedMembers.map(m => ({
    expense_id: newExpenseId,
    debtor_user_id: m.user_id,       // UUID as string ✅
    share_amount: m.share_amount,
    split_type: SPLIT_TYPES.EQUAL,
  }));

  /* ---------- STEP 3: PREPARE CONSENTS ---------- */
  // Payer already excluded — no filter needed

  const consents = involvedMembers.map(m => ({
    expense_id: newExpenseId,
    debtor_user_id: m.user_id,
    status: CONSENT_STATUSES.REQUIRED,
  }));

  /* ---------- STEP 4: INSERT INVOLVEMENTS ---------- */

  const { error: involveError } = await supabase
    .from('involvements')
    .insert(involvements);

  if (involveError) {
    // Cleanup orphan expense
    await supabase.from('expenses').delete().eq('expense_id', newExpenseId);
    throw involveError;
  }

  /* ---------- STEP 5: INSERT CONSENTS ---------- */

  const { error: consentError } = await supabase
    .from('consents')
    .insert(consents);

  if (consentError) {
    // Cleanup orphan records
    await supabase.from('involvements').delete().eq('expense_id', newExpenseId);
    await supabase.from('expenses').delete().eq('expense_id', newExpenseId);
    throw consentError;
  }

  return {
    expenseId: newExpenseId,
    success: true,
  };
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
) {
  const { error } = await supabase
    .from('consents')
    .update({ 
        status: newStatus, 
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

export async function acceptDispute(consentId: string) {
  await supabase
    .from('expense_consents')
    .update({ status: 'Accepted' })
    .eq('consent_id', consentId);
}

export async function requestReconsideration(consentId: string) {
  await supabase
    .from('expense_consents')
    .update({ status: 'Reconsider' })
    .eq('consent_id', consentId);
}
