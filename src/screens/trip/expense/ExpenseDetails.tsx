import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import { supabase } from '@/src/api/supabase';
import { Colors, CURRENCY } from '@/src/constants';
import { raiseDispute } from '@/src/api/expenses';

export default function ExpenseDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { expenseId } = route.params;

  const [expense, setExpense] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /* -------------------- LOAD -------------------- */

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const { data: auth } = await supabase.auth.getUser();
      setUserId(auth.user?.id ?? null);

      await reloadExpense();
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load expense.');
    } finally {
      setLoading(false);
    }
  }

  async function reloadExpense() {
    const { data, error } = await supabase
      .from('expenses')
      .select(`
        expense_id,
        name,
        amount,
        payer_id,
        consents (
          consent_id,
          debtor_user_id,
          status,
          debtor:users(name)
        )
      `)
      .eq('expense_id', expenseId)
      .single();

    if (error) throw error;
    setExpense(data);
  }

  /* -------------------- ACTIONS -------------------- */

  async function removeMember(debtorId: string) {
    const { error } = await supabase.rpc('remove_user_from_expense', {
      p_expense_id: expenseId,
      p_user_id: debtorId,
    });

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    await reloadExpense();
  }

  async function requestConsent(debtorId: string) {
    const { error } = await supabase.rpc('readd_user_with_consent', {
      p_expense_id: expenseId,
      p_user_id: debtorId,
    });

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    await reloadExpense();
  }

  /* -------------------- UI STATE -------------------- */

  if (loading) {
    return <ActivityIndicator size="large" style={{ flex: 1 }} />;
  }

  if (!expense) {
    return (
      <View style={styles.container}>
        <Text>Expense not found.</Text>
      </View>
    );
  }

  const isPayee = expense.payer_id === userId;
  const disputed = expense.consents.filter(
    (c: any) => c.status === 'Disputed'
  );
  const hasDisputed = disputed.some(
    (d: any) => d.debtor_user_id === userId
  );

  /* -------------------- RENDER -------------------- */

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{expense.name}</Text>
      <Text style={styles.amount}>
        {CURRENCY}{expense.amount.toFixed(2)}
      </Text>

      {/* ---------- MEMBER VIEW ---------- */}
      {!isPayee && !hasDisputed && (
        <TouchableOpacity
          onPress={async () => {
            if (!userId) return;

            try {
              await raiseDispute(expense.expense_id, userId);
              await reloadExpense();
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          }}
        >
          <Text style={{ color: Colors.danger }}>Raise Dispute</Text>
        </TouchableOpacity>
      )}

      {!isPayee && hasDisputed && (
        <Text style={{ color: '#856404' }}>
          You have disputed this expense
        </Text>
      )}

      {/* ---------- PAYEE VIEW ---------- */}
      {isPayee && disputed.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Disputed Members</Text>

          {disputed.map((d: any) => (
            <View key={d.consent_id} style={styles.disputeRow}>
              <Text>{d.debtor.name}</Text>

              <TouchableOpacity
                onPress={() => removeMember(d.debtor_user_id)}
              >
                <Text style={{ color: Colors.danger }}>Remove</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => requestConsent(d.debtor_user_id)}
              >
                <Text style={{ color: Colors.primary }}>
                  Request Consent
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

/* -------------------- STYLES -------------------- */

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold' },
  amount: { fontSize: 18, marginVertical: 10 },
  sectionHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 20,
  },
  disputeRow: {
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginVertical: 6,
  },
});
