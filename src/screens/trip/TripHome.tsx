import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  FlatList,
  Modal,
  Alert,
  Linking,
  SafeAreaView, // Added for better modal rendering
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Contacts from 'expo-contacts';

import { getTripBalances, getTripExpensesForUser } from '@/src/api/expenses';
import { addMemberToTrip } from '@/src/api/tripMembers';
import { supabase } from '@/src/api/supabase';

import { TripBalance } from '@/src/types/database';
import { CURRENCY, Colors } from '@/src/constants';
import { showAlert } from '@/src/utils/showAlert';

interface RegisteredContact {
  contact: Contacts.Contact;
  email: string;
  name: string;
}

export default function TripDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const tripId = route.params?.id;

  const [balances, setBalances] = useState<TripBalance[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [allTripExpenses, setAllTripExpenses] = useState<any[]>([]);

  // Contact & Search State
  const [showContactModal, setShowContactModal] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<RegisteredContact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<RegisteredContact[]>([]); // New: Multiple selection
  const [searchQuery, setSearchQuery] = useState('');
  const [contactLoading, setContactLoading] = useState(false);
  const [addingMember, setAddingMember] = useState(false);

  /* -------------------- DATA LOADING -------------------- */

  const refreshTripData = async (uid: string) => {
    try {
      const [balancesData, expensesData, membersResult, allExpensesResult] = await Promise.all([
        getTripBalances(tripId),
        getTripExpensesForUser(tripId, uid),
        supabase
          .from('trip_members')
          .select('user_id, nickname, users!trip_members_user_id_fkey(name)')
          .eq('trip_id', tripId),
        supabase
          .from('expenses')
          .select(`
            amount,
            payer_id,
            consents (debtor_user_id)
          `)
          .eq('trip_id', tripId)
      ]);

      setBalances(balancesData);
      setExpenses(expensesData || []);
      
      if (!membersResult.error) setMembers(membersResult.data ?? []);
      if (!allExpensesResult.error) setAllTripExpenses(allExpensesResult.data ?? []);

    } catch (err) {
      console.error("Refresh Error:", err);
    }
  };

  useEffect(() => {
    if (!tripId) return;
    async function load() {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        setLoading(false);
        return;
      }
      setCurrentUserId(uid);
      await refreshTripData(uid);
      setLoading(false);
    }
    load();
  }, [tripId]);

  /* -------------------- CALCULATION LOGIC -------------------- */

  const calculatePeerNet = (targetId: string, currentId: string | null, expensesArr: any[]) => {
    if (!currentId || !targetId) return 0;

    return expensesArr.reduce((acc, exp) => {
      const involved = exp.consents || [];
      const shareCount = involved.length+1;
      if (shareCount === 1) return acc;

      const shareAmount = exp.amount / shareCount;

      if (exp.payer_id === currentId) {
        const isTargetDebtor = involved.some((c: any) => c.debtor_user_id === targetId);
        if (isTargetDebtor) return acc + shareAmount;
      }

      if (exp.payer_id === targetId) {
        const amIDebtor = involved.some((c: any) => c.debtor_user_id === currentId);
        if (amIDebtor) return acc - shareAmount;
      }

      return acc;
    }, 0);
  };

  /* -------------------- CONTACT LOGIC -------------------- */

  const normalizePhone = (phone: string) => {
    let cleaned = phone.replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+91')) cleaned = cleaned.slice(3);
    return cleaned;
  };

  const filteredContacts = useMemo(() => {
    return deviceContacts.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, deviceContacts]);

  const toggleContact = (contact: RegisteredContact) => {
    setSelectedContacts((prev) => {
      const exists = prev.some((c) => c.email === contact.email);
      if (exists) {
        return prev.filter((c) => c.email !== contact.email);
      } else {
        return [...prev, contact];
      }
    });
  };

  async function handleOpenContacts() {
    setContactLoading(true);
    setSelectedContacts([]); // Clear previous selection
    setShowContactModal(true); // Open immediately

    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Allow contact access in settings.', [
          { text: 'Cancel', onPress: () => setShowContactModal(false) },
          { text: 'Settings', onPress: () => Linking.openSettings() },
        ]);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });

      // 🔹 Build phone → contact map
      const phoneToContact = new Map<string, Contacts.Contact>();

      data.forEach((c) => {
        c.phoneNumbers?.forEach((p) => {
          const phone = normalizePhone(p.number!);
          phoneToContact.set(phone, c);
        });
      });

      const phoneNumbers = Array.from(phoneToContact.keys());

      if (phoneNumbers.length === 0) {
        setDeviceContacts([]);
        return;
      }

      // 🔹 ONE Supabase query
      const { data: users, error } = await supabase
        .from('users')
        .select('id, email, phone, name') // Fetched ID to compare with members
        .in('phone', phoneNumbers);

      if (error) throw error;

      // 🔹 Filter out users ALREADY in this trip
      const existingUserIds = members.map((m) => m.user_id);

      const matched: RegisteredContact[] = users
        .filter((u) => !existingUserIds.includes(u.id)) // Exclude existing members
        .map((u) => ({
          contact: phoneToContact.get(u.phone)!,
          email: u.email,
          name: phoneToContact.get(u.phone)?.name || u.name || 'Unknown',
        }));

      setDeviceContacts(matched);
    } catch (e) {
      showAlert('Error', 'Failed to load contacts');
    } finally {
      setContactLoading(false);
    }
  }

  async function handleAddSelectedMembers() {
    if (selectedContacts.length === 0) {
      setShowContactModal(false);
      return;
    }

    setAddingMember(true);
    try {
      // Add all selected members sequentially or parallel
      const promises = selectedContacts.map(member => 
        addMemberToTrip({
          tripId,
          email: member.email,
          nickname: member.name,
        })
      );

      await Promise.all(promises);

      await refreshTripData(currentUserId!);
      setShowContactModal(false);
      setSearchQuery('');
      showAlert('Success', `${selectedContacts.length} members added`);
    } catch (e: any) {
      showAlert('Error', e.message);
    } finally {
      setAddingMember(false);
    }
  }


  if (loading) return <ActivityIndicator size="large" color={Colors.primary} style={styles.center} />;

  if (!tripId) {
    return (
      <View style={styles.center}>
        <Text>Trip ID missing.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: '#fff' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* RECENT EXPENSES */}
      <Text style={styles.sectionHeader}>Expenses</Text>
      <FlatList
        data={expenses}
        horizontal
        keyExtractor={e => e.expense_id}
        showsHorizontalScrollIndicator={false}
        ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyStateText}>No expenses yet.</Text></View>}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.expenseCard}
            onPress={() => navigation.navigate('ExpenseDetails', { id: tripId, expenseId: item.expense_id })}
          >
            <Text style={styles.expenseName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.expenseMeta}>Paid by {item.payer?.name ?? 'User'}</Text>
            <Text style={styles.expenseAmount}>{CURRENCY}{item.amount.toFixed(2)}</Text>
          </TouchableOpacity>
        )}
      />

      {/* QUICK ACTIONS */}
      <View style={styles.actionRow}>
        <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: Colors.primary }]} 
            onPress={() => navigation.navigate('ExpenseInput', { id: tripId })}
        >
          <Text style={styles.actionText}>+ Add Expense</Text>
        </TouchableOpacity>
        <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: Colors.secondary }]} 
            onPress={() => navigation.navigate('Consents', { id: tripId })}
        >
          <Text style={styles.actionText}>Review Consents</Text>
        </TouchableOpacity>
      </View>

      {/* MEMBERS & PEER BALANCES */}
      <View style={styles.memberHeader}>
        <Text style={styles.sectionHeader}>Members & Balances</Text>
        <TouchableOpacity style={styles.addIcon} onPress={handleOpenContacts}>
          <Text style={styles.addIconText}>＋</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.memberListCard}>
        {members.filter(m => m.user_id !== currentUserId).map((m, i, arr) => {
          const net = calculatePeerNet(m.user_id, currentUserId, allTripExpenses);
          const displayName = (m.nickname && m.nickname !== 'Creator') 
            ? m.nickname 
            : (m.users?.name || 'Unknown User');

          return (
            <View key={m.user_id || i} style={[styles.memberItemContainer, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
              <View>
                <Text style={styles.memberName}>{displayName}</Text>
                <Text style={styles.memberSubtext}>
                    {net > 0 ? 'owes you' : net < 0 ? 'you owe' : 'settled'}
                </Text>
              </View>
              <Text style={[styles.memberBalance, { color: net >= 0 ? Colors.success : Colors.danger }]}>
                {net > 0 ? '+' : ''}{CURRENCY}{Math.abs(net).toFixed(2)}
              </Text>
            </View>
          );
        })}
        {members.length <= 1 && (
            <Text style={{ padding: 16, color: '#999', fontStyle: 'italic' }}>No other members yet.</Text>
        )}
      </View>

      {/* SEARCH CONTACTS MODAL */}
      <Modal visible={showContactModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.contactModalContainer}>
          <View style={styles.modalHeader}>
             <TouchableOpacity onPress={() => setShowContactModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
             </TouchableOpacity>
             <Text style={styles.contactModalTitle}>Add Members</Text>
             <TouchableOpacity onPress={handleAddSelectedMembers} disabled={addingMember}>
                <Text style={[styles.doneText, addingMember && { opacity: 0.5 }]}>
                    {addingMember ? 'Adding...' : `Done (${selectedContacts.length})`}
                </Text>
             </TouchableOpacity>
          </View>

          <TextInput 
            style={styles.searchBar}
            placeholder="Search contacts..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />

          {addingMember && (
            <View style={styles.addingOverlay}>
               <ActivityIndicator color={Colors.primary} size="large" />
               <Text style={{marginTop: 10, color: '#666'}}>Adding members...</Text>
            </View>
          )}

          {contactLoading ? <ActivityIndicator size="large" color={Colors.primary} style={{marginTop: 20}} /> : (
            <FlatList
                data={filteredContacts}
                keyExtractor={(item) => item.email}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 40 }}
                renderItem={({ item }) => {
                  const isSelected = selectedContacts.some(c => c.email === item.email);
                  const initials = item.name
                    .split(' ')
                    .map(n => n[0])
                    .slice(0, 2)
                    .join('');

                  return (
                    <TouchableOpacity
                      style={[styles.contactItem, isSelected && styles.contactItemSelected]}
                      onPress={() => toggleContact(item)}
                    >
                      <View style={styles.contactLeft}>
                          <View style={styles.contactAvatar}>
                            <Text style={styles.avatarText}>{initials}</Text>
                          </View>
                          <View>
                            <Text style={styles.contactName}>{item.name}</Text>
                            <Text style={styles.contactPhone}>
                              {item.contact.phoneNumbers?.[0]?.number}
                            </Text>
                          </View>
                      </View>

                      {/* Checkbox Visual */}
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                         {isSelected && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.emptyListText}>
                    {deviceContacts.length === 0 
                        ? 'None of your contacts are on the app, or all are already in this trip.' 
                        : 'No contacts found.'}
                  </Text>
                }
              />
          )}
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionHeader: { fontSize: 20, fontWeight: '700', marginBottom: 12, color: '#1a1a1a', marginTop: 10 },
  expenseCard: { 
    padding: 16, 
    borderRadius: 16, 
    marginRight: 12, 
    width: 160, 
    backgroundColor: '#fff',
    elevation: 3, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 4 
  },
  expenseName: { fontWeight: '700', fontSize: 15 },
  expenseMeta: { fontSize: 12, color: '#666', marginVertical: 4 },
  expenseAmount: { fontWeight: 'bold', color: Colors.primary, fontSize: 16 },
  emptyState: { padding: 20, backgroundColor: '#f9f9f9', borderRadius: 12, alignItems: 'center', width: 200 },
  emptyStateText: { color: '#888', fontSize: 14 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 24 },
  actionButton: { width: '48%', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  actionText: { color: '#fff', fontWeight: '700' },
  memberHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  memberListCard: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: '#eee' },
  memberItemContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  memberName: { fontSize: 16, fontWeight: '600', color: '#333' },
  memberSubtext: { fontSize: 12, color: '#999', marginTop: 2 },
  memberBalance: { fontSize: 16, fontWeight: '700' },
  addIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  addIconText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  
  // Modal Styles
  contactModalContainer: { flex: 1, backgroundColor: '#fff', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 10 },
  contactModalTitle: { fontSize: 18, fontWeight: 'bold' },
  cancelText: { color: '#666', fontSize: 16 },
  doneText: { color: Colors.primary, fontWeight: '700', fontSize: 16 },

  searchBar: { backgroundColor: '#f0f0f0', padding: 12, borderRadius: 10, marginBottom: 10, fontSize: 16 },
  
  contactItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  contactItemSelected: { backgroundColor: '#F9FAFF' },
  contactLeft: { flexDirection: 'row', alignItems: 'center' },
  contactAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e1e1e1', alignItems: 'center', justifyContent: 'center', marginRight: 15 },
  avatarText: { fontWeight: 'bold', color: '#777' },
  contactName: { fontSize: 16, fontWeight: '600' },
  contactPhone: { fontSize: 13, color: '#888' },
  
  addingOverlay: { position: 'absolute', top: '50%', left: '10%', right: '10%', backgroundColor: 'rgba(255,255,255,0.95)', padding: 30, borderRadius: 16, alignItems: 'center', zIndex: 100, elevation: 10, shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity:0.25, shadowRadius:3.84 },
  backBtn: { marginTop: 10, backgroundColor: Colors.primary, padding: 10, borderRadius: 8 },
  emptyListText: { textAlign: 'center', marginTop: 40, color: '#AAA', paddingHorizontal: 20 },

  // Checkbox styles
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CCC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 14, 
    fontWeight: 'bold',
  }
});