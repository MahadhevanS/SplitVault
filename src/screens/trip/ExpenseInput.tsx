import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import { getTripMembers, createNewExpense } from '@/src/api/expenses';
import { supabase } from '@/src/api/supabase';
import { Colors, CURRENCY } from '@/src/constants';

/* ---------- TYPES ---------- */

interface Member {
  user_id: string;
  name: string;
  is_involved: boolean;
}

/* ---------- COMPONENT ---------- */

export default function ExpenseInputScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { 
    id: tripId, 
    amount: importedAmount, 
    payee: importedPayee 
  } = route.params || {};
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState(importedPayee || '');
  const [amount, setAmount] = useState(importedAmount ? String(importedAmount) : '');

  const [members, setMembers] = useState<Member[]>([]);
  const [payerId, setPayerId] = useState<string | null>(null);
  const [showPayerPicker, setShowPayerPicker] = useState(false);

  /* ---------- EFFECTS ---------- */

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (tripId) fetchMembers();
  }, [tripId]);

  useEffect(() => {
    if (members.length && currentUserId && !payerId) {
      setPayerId(currentUserId);
    }
  }, [members, currentUserId]);

  /* ---------- DATA ---------- */

  async function fetchMembers() {
    try {
      const data = await getTripMembers(tripId);

      const normalized: Member[] = data.map((tm: any) => ({
        user_id: tm.user_id,
        name: tm.user.name,
        is_involved: true,
      }));

      setMembers(normalized);
    } catch (e) {
      Alert.alert('Error', 'Failed to load trip members.');
    } finally {
      setLoading(false);
    }
  }

  /* ---------- HELPERS ---------- */

  function toggleInvolved(userId: string) {
    setMembers(prev =>
      prev.map(m =>
        m.user_id === userId
          ? { ...m, is_involved: !m.is_involved }
          : m
      )
    );
  }

  const selectedPayer = members.find(m => m.user_id === payerId);

  /* ---------- SAVE ---------- */

  async function handleSaveExpense() {
    const parsedAmount = parseFloat(amount);
    const involved = members.filter(m => m.is_involved);

    if (!name.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Input', 'Enter valid name and amount.');
      return;
    }

    if (!payerId) {
      Alert.alert('Missing Payer', 'Please select who paid.');
      return;
    }

    if (involved.length === 0) {
      Alert.alert('Invalid Split', 'Select at least one member.');
      return;
    }

    setIsSaving(true);

    try {
      const shareAmount = parsedAmount / involved.length;

      await createNewExpense({
        trip_id: tripId,
        name,
        amount: parsedAmount,
        payer_id: payerId,
        involvedMembers: involved.map(m => ({
          user_id: m.user_id,
          share_amount: shareAmount,
        })),
      });

      navigation.dispatch(
        CommonActions.reset({
          index: 1, // This tells the app to stay on the 2nd route (TripHome)
          routes: [
            { name: 'App', params: { screen: 'Home' } }, // Route index 0 (The "Back" destination)
            { 
              name: 'App', 
              params: { 
                screen: 'Trip', 
                params: { 
                  screen: 'TripHome', 
                  params: { id: tripId } 
                } 
              } 
            }, // Route index 1 (The current screen)
          ],
        })
      );
    } catch {
      Alert.alert('Error', 'Failed to save expense.');
    } finally {
      setIsSaving(false);
    }
  }

  /* ---------- UI ---------- */

  if (loading) {
    return <ActivityIndicator size="large" style={{ flex: 1 }} />;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>Expense Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Dinner, Taxi, Hotel..."
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Amount ({CURRENCY})</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="0.00"
          value={amount}
          onChangeText={setAmount}
        />
      </View>

      <Text style={styles.sectionHeader}>Paid By</Text>

      <TouchableOpacity
        style={styles.dropdown}
        onPress={() => setShowPayerPicker(true)}
      >
        <Text style={styles.dropdownText}>
          {selectedPayer ? selectedPayer.name : 'Select payer'}
        </Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Split Between</Text>
        {members.map(m => (
          <TouchableOpacity
            key={m.user_id}
            style={[
              styles.memberRow,
              m.is_involved ? styles.involved : styles.notInvolved,
            ]}
            onPress={() => toggleInvolved(m.user_id)}
          >
            <Text style={styles.memberName}>{m.name}</Text>
            <Text style={styles.statusText}>
              {m.is_involved ? 'INCLUDED' : 'EXCLUDED'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Button
        title={isSaving ? 'Saving...' : 'Save Expense'}
        onPress={handleSaveExpense}
        disabled={isSaving}
      />

      <Modal visible={showPayerPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Select Payer</Text>

            {members.map(m => (
              <TouchableOpacity
                key={m.user_id}
                style={[
                  styles.modalOption,
                  payerId === m.user_id && styles.selectedOption,
                ]}
                onPress={() => {
                  setPayerId(m.user_id);
                  setShowPayerPicker(false);
                }}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    payerId === m.user_id && { color: '#fff' },
                  ]}
                >
                  {m.name}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowPayerPicker(false)}
            >
              <Text style={{ color: Colors.danger }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

/* ---------- STYLES ---------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 15 },
  section: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 20 },
  sectionHeader: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  label: { marginBottom: 5 },
  input: { height: 45, borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 10, marginBottom: 15 },
  dropdown: { backgroundColor: '#fff', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#ccc', marginBottom: 20 },
  dropdownText: { fontSize: 16, fontWeight: '600' },
  memberRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 6, marginBottom: 6 },
  involved: { backgroundColor: Colors.secondary + '20', borderWidth: 1, borderColor: Colors.secondary },
  notInvolved: { backgroundColor: '#f5f5f5' },
  memberName: { fontSize: 16 },
  statusText: { fontWeight: '600', color: Colors.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  modalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  modalOption: { padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#ccc', marginBottom: 6 },
  selectedOption: { backgroundColor: Colors.primary },
  modalOptionText: { fontSize: 16, fontWeight: '600' },
  cancelButton: { marginTop: 10, alignItems: 'center' },
});
