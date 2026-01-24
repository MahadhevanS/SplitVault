import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
  SafeAreaView,
  Modal,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import { supabase } from '@/src/api/supabase';
import { createNewExpense } from '@/src/api/expenses';
import { Colors, CURRENCY } from '@/src/constants';

interface Member {
  user_id: string;
  name: string;
}

export default function SelectMembersScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { id, amount, payee } = route.params;

  const totalAmount = parseFloat(amount || '0');

  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [payerId, setPayerId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showPayerPicker, setShowPayerPicker] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { data: session } = await supabase.auth.getSession();
        const currentUserId = session.session?.user.id ?? null;

        const { data } = await supabase
          .from('trip_members')
          .select('user_id, users!trip_members_user_id_fkey(name)')
          .eq('trip_id', id);

        const normalized =
          data?.map((m: any) => ({
            user_id: m.user_id,
            name: m.users?.name ?? 'Unknown',
          })) ?? [];

        setMembers(normalized);
        setSelected(normalized.map(m => m.user_id));
        setPayerId(currentUserId ?? normalized[0]?.user_id ?? null);
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  const toggleMember = (uid: string) => {
    setSelected(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const splitAmount = selected.length ? totalAmount / selected.length : 0;
  const payer = members.find(m => m.user_id === payerId);

  async function handleConfirm() {
    if (!payerId || selected.length === 0) {
      Alert.alert('Incomplete', 'Select payer and members.');
      return;
    }

    try {
      setSubmitting(true);

      await createNewExpense({
        trip_id: id,
        name: payee || 'Expense',
        amount: totalAmount,
        payer_id: payerId,
        involvedMembers: selected.map(uid => ({
          user_id: uid,
          share_amount: splitAmount,
        })),
      });

      navigation.replace('TripHome', { id });
    } catch {
      Alert.alert('Error', 'Failed to save expense.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <ActivityIndicator size="large" style={{ flex: 1 }} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.payee}>{payee}</Text>
        <Text style={styles.amount}>{CURRENCY}{totalAmount.toFixed(2)}</Text>
        <TouchableOpacity onPress={() => setShowPayerPicker(true)}>
          <Text style={styles.payerText}>Paid by {payer?.name}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={members}
        keyExtractor={m => m.user_id}
        renderItem={({ item }) => {
          const active = selected.includes(item.user_id);
          return (
            <TouchableOpacity
              style={[styles.memberRow, active && styles.memberActive]}
              onPress={() => toggleMember(item.user_id)}
            >
              <Text>{item.name}</Text>
              <Text>{active ? '✓' : ''}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity
        style={styles.confirmBtn}
        onPress={handleConfirm}
        disabled={submitting}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Confirm Split</Text>}
      </TouchableOpacity>

      <Modal visible={showPayerPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Select Payer</Text>
            {members.map(m => (
              <TouchableOpacity
                key={m.user_id}
                style={[styles.modalOption, payerId === m.user_id && styles.selectedOption]}
                onPress={() => {
                  setPayerId(m.user_id);
                  setShowPayerPicker(false);
                }}
              >
                <Text style={[styles.modalText, payerId === m.user_id && { color: '#fff' }]}>{m.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 20, alignItems: 'center' },
  payee: { fontSize: 20, fontWeight: 'bold' },
  amount: { fontSize: 34, fontWeight: '900', color: '#188038' },
  payerText: { marginTop: 6, color: Colors.primary },
  memberRow: { margin: 10, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', flexDirection: 'row', justifyContent: 'space-between' },
  memberActive: { backgroundColor: '#e6f4ff', borderColor: Colors.primary },
  confirmBtn: { backgroundColor: Colors.primary, padding: 18, margin: 20, borderRadius: 12, alignItems: 'center' },
  confirmText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  modalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  modalOption: { padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#ccc', marginBottom: 6 },
  selectedOption: { backgroundColor: Colors.primary },
  modalText: { fontSize: 16, fontWeight: '600' },
});
