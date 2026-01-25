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
  Platform,
} from 'react-native';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import * as Contacts from 'expo-contacts';

import { createNewExpense } from '@/src/api/expenses';
import { supabase } from '@/src/api/supabase';
import { Colors, CURRENCY } from '@/src/constants';

/* ---------- TYPES ---------- */

interface Member {
  user_id: string;
  name: string; // This will now hold the Contact Name if available, else DB Name
  phone?: string;
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
      const uid = data.session?.user.id ?? null;
      setCurrentUserId(uid);
      if(uid && tripId){
        fetchMembersAndContacts(uid);
      }
    });
  }, []);

  useEffect(() => {
    if (tripId) fetchMembersAndContacts();
  }, [tripId]);

  useEffect(() => {
    // Default the payer to current user if they are in the list
    if (members.length && currentUserId && !payerId) {
      const isCurrentUserInList = members.some(m => m.user_id === currentUserId);
      if (isCurrentUserInList) {
        setPayerId(currentUserId);
      }
    }
  }, [members, currentUserId]);

  /* ---------- DATA FETCHING & MATCHING ---------- */

  const normalizePhone = (phone: string | null) => {
    if (!phone) return '';
    let cleaned = phone.replace(/[^0-9+]/g, '');
    // Standardize India code for matching
    if (cleaned.startsWith('+91')) cleaned = cleaned.slice(3);
    else if (cleaned.startsWith('91') && cleaned.length === 12) cleaned = cleaned.slice(2);
    return cleaned;
  };

  async function fetchMembersAndContacts(activeUid : string) {
    try {
      // 1. Fetch Trip Members + Phone Numbers from DB
      const { data: dbMembers, error } = await supabase
        .from('trip_members')
        .select(`
          user_id,
          nickname,
          users:users!trip_members_user_id_fkey (
            name,
            phone
          )
        `)
        .eq('trip_id', tripId);

      if (error) throw error;

      let finalMembers: Member[] = [];

      // 2. Request Contact Permissions
      const { status } = await Contacts.requestPermissionsAsync();
      
      let phoneToContactName = new Map<string, string>();

      if (status === 'granted') {
        // 3. Get Device Contacts if permission granted
        const { data: contactData } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        });

        // Create a Map: Normalized Phone -> Contact Name
        contactData.forEach(c => {
          c.phoneNumbers?.forEach(p => {
            const norm = normalizePhone(p.number!);
            if (norm) phoneToContactName.set(norm, c.name);
          });
        });
      }

      // 4. Merge Data
      finalMembers = dbMembers.map((m: any) => {
        if (m.user_id === activeUid) {
          return {
            user_id: m.user_id,
            name: 'You', // Force name to "You"
            phone: m.users?.phone,
            is_involved: true,
          };
        }
        
        const dbPhone = m.users?.phone;
        const normDbPhone = normalizePhone(dbPhone);
        
        // Priority: Nickname (Trip specific) > Device Contact Name > Global DB Name
        let displayName = m.nickname; 
        
        if (!displayName) {
           // If no nickname set in trip, check device contacts
           if (normDbPhone && phoneToContactName.has(normDbPhone)) {
             displayName = phoneToContactName.get(normDbPhone);
           } else {
             // Fallback to the name they registered with
             displayName = m.users?.name || 'Unknown User';
           }
        }

        return {
          user_id: m.user_id,
          name: displayName,
          phone: dbPhone,
          is_involved: true, // Default to all selected
        };
      });

      setMembers(finalMembers);

    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load trip members.');
    } finally {
      setLoading(false);
    }
  }

  /* ---------- LOGIC ---------- */

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

      // Reset stack to go back to Home -> TripHome
      navigation.dispatch(
        CommonActions.reset({
          index: 1, 
          routes: [
            { name: 'App', params: { screen: 'Home' } }, 
            { 
              name: 'App', 
              params: { 
                screen: 'Trip', 
                params: { 
                  screen: 'TripHome', 
                  params: { id: tripId } 
                } 
              } 
            }, 
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
    return <ActivityIndicator size="large" style={{ flex: 1, marginTop: 50 }} />;
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
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
        <View style={styles.splitHeaderRow}>
            <Text style={styles.sectionHeader}>Split Between</Text>
            <TouchableOpacity onPress={() => {
                const allSelected = members.every(m => m.is_involved);
                setMembers(prev => prev.map(m => ({ ...m, is_involved: !allSelected })));
            }}>
                <Text style={styles.selectAllText}>
                    {members.every(m => m.is_involved) ? 'Deselect All' : 'Select All'}
                </Text>
            </TouchableOpacity>
        </View>
        
        {members.map(m => (
          <TouchableOpacity
            key={m.user_id}
            style={[
              styles.memberRow,
              m.is_involved ? styles.involved : styles.notInvolved,
            ]}
            onPress={() => toggleInvolved(m.user_id)}
          >
            <Text style={[styles.memberName, !m.is_involved && {color: '#888'}]}>{m.name}</Text>
            
            {/* Checkbox Visual */}
            <View style={[styles.checkbox, m.is_involved && styles.checkboxSelected]}>
                {m.is_involved && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <Button
        title={isSaving ? 'Saving...' : 'Save Expense'}
        onPress={handleSaveExpense}
        disabled={isSaving}
        color={Colors.primary}
      />
      <View style={{height: 40}} /> 

      {/* Payer Selection Modal */}
      <Modal visible={showPayerPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Select Payer</Text>

            <ScrollView style={{maxHeight: 300}}>
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
            </ScrollView>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowPayerPicker(false)}
            >
              <Text style={{ color: Colors.danger, fontSize: 16 }}>Cancel</Text>
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
  section: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 20 },
  sectionHeader: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  label: { marginBottom: 5, color: '#666', fontWeight: '500' },
  input: { height: 48, backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#eee', borderRadius: 8, paddingHorizontal: 12, marginBottom: 15, fontSize: 16 },
  
  dropdown: { backgroundColor: '#fff', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', marginBottom: 20 },
  dropdownText: { fontSize: 16, fontWeight: '600', color: '#333' },
  
  splitHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  selectAllText: { color: Colors.primary, fontWeight: '600' },

  memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 10, borderRadius: 8, marginBottom: 6 },
  involved: { backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: '#BAE6FD' },
  notInvolved: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: 'transparent' },
  
  memberName: { fontSize: 16, fontWeight: '500' },
  
  // Custom Checkbox
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  checkboxSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  modalOption: { padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#eee', marginBottom: 8, backgroundColor: '#f9f9f9' },
  selectedOption: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  modalOptionText: { fontSize: 16, fontWeight: '600', textAlign: 'center', color: '#333' },
  cancelButton: { marginTop: 15, alignItems: 'center', padding: 10 },
});