import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
  SafeAreaView,
  Pressable,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import * as Contacts from 'expo-contacts';

import { getTripBalances, getTripExpensesForUser } from '@/src/api/expenses';
import { addMemberToTrip } from '@/src/api/tripMembers';
import { supabase } from '@/src/api/supabase';

import { TripBalance } from '@/src/types/database';
import { CURRENCY, Colors } from '@/src/constants';
import { showAlert } from '@/src/utils/showAlert';

/* ---------------- TYPES ---------------- */

interface RegisteredContact {
  id?: string; // ✅ Added ID to help identify existing inactive members
  contact: Contacts.Contact;
  email: string;
  name: string;
}

/* ---------------- SCREEN ---------------- */

export default function TripDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const tripId = route.params?.id;

  const [balances, setBalances] = useState<TripBalance[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]); // Contains Active AND Inactive
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [tripCreatorId, setTripCreatorId] = useState<string | null>(null); // ✅ Store Creator ID
  const [loading, setLoading] = useState(true);
  
  const [allTripExpenses, setAllTripExpenses] = useState<any[]>([]);

  // Contact & Search State
  const [showContactModal, setShowContactModal] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<RegisteredContact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<RegisteredContact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [contactLoading, setContactLoading] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [contactNameMap, setContactNameMap] = useState<Map<string, string>>(new Map());

  /* -------------------- DATA LOADING -------------------- */

  const refreshTripData = async (uid: string) => {
    try {
      const [balancesData, expensesData, membersResult, allExpensesResult, tripResult] = await Promise.all([
        getTripBalances(tripId),
        getTripExpensesForUser(tripId, uid),
        supabase
          .from('trip_members')
          // ✅ Select is_active to filter list and handle re-adds
          .select('user_id, is_active, users!trip_members_user_id_fkey(name,phone)')
          .eq('trip_id', tripId),
        supabase
          .from('expenses')
          .select(`
            amount,
            payer_id,
            consents (debtor_user_id)
          `)
          .eq('trip_id', tripId),
        // ✅ Fetch Trip Info to get Created By
        supabase.from('trips').select('creator_id').eq('trip_id', tripId).single()
      ]);

      setBalances(balancesData);
      setExpenses(expensesData || []);
      
      if (tripResult.data) setTripCreatorId(tripResult.data.creator_id);
      if (!membersResult.error) setMembers(membersResult.data ?? []);
      if (!allExpensesResult.error) setAllTripExpenses(allExpensesResult.data ?? []);

    } catch (err) {
      console.error("Refresh Error:", err);
    }
  };

  // Initial Load
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

  useEffect(() => {
    (async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') return;

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });

      const map = new Map<string, string>();

      data.forEach(contact => {
        contact.phoneNumbers?.forEach(p => {
          const phone = normalizePhone(p.number!);
          map.set(phone, contact.name);
        });
      });

      setContactNameMap(map);
    })();
  }, []);

  // Refresh when coming back to screen
  useFocusEffect(
    useCallback(() => {
      if (currentUserId && tripId) {
        refreshTripData(currentUserId);
      }
    }, [currentUserId, tripId])
  );

  /* -------------------- CALCULATION LOGIC -------------------- */

  const calculatePeerNet = (targetId: string, currentId: string | null, expensesArr: any[]) => {
    if (!currentId || !targetId) return 0;

    return expensesArr.reduce((acc, exp) => {
      const involved = exp.consents || [];
      const shareCount = involved.length + 1; 
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

  /* -------------------- REMOVE MEMBER LOGIC -------------------- */

  const handleRemoveMember = async (member: any) => {
    // 1. Check if Creator ID is loaded
    if (!tripCreatorId || !currentUserId) {
        // Data hasn't loaded yet
        return; 
    }

    // 2. Permission Check with Feedback
    if (currentUserId !== tripCreatorId) {
      Alert.alert("Permission Denied", "Only the trip creator can remove members.");
      return;
    }

    // 3. Cannot remove self
    if (member.user_id === currentUserId) {
        Alert.alert("Action Not Allowed", "You cannot remove yourself. Please 'Leave Trip' from the home screen instead.");
        return;
    }

    // 4. Check Balance
    const memberBalanceData = balances.find(b => b.user_id === member.user_id);
    const balanceAmount = memberBalanceData ? memberBalanceData.net_balance : 0;

    // Use a small epsilon for float comparison
    if (Math.abs(balanceAmount) > 0.02) {
      Alert.alert(
        "Cannot Remove Member",
        `This member has an outstanding balance of ${CURRENCY}${balanceAmount.toFixed(2)}. All debts must be settled before they can be removed.`
      );
      return;
    }

    const memberName = member.users?.name || 'this member';

    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${memberName}? They can be added back later.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove", 
          style: "destructive", 
          onPress: async () => {
            try {
              // 5. Soft Delete
              const { error } = await supabase
                .from('trip_members')
                .update({ is_active: false })
                .eq('trip_id', tripId)
                .eq('user_id', member.user_id);

              if (error) throw error;
              
              showAlert("Success", "Member removed");
              refreshTripData(currentUserId!);
            } catch (e) {
              showAlert("Error", "Failed to remove member");
            }
          }
        }
      ]
    );
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
    setSelectedContacts([]); 
    setShowContactModal(true); 

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

      const { data: users, error } = await supabase
        .from('users')
        .select('id, email, phone, name') 
        .in('phone', phoneNumbers);

      if (error) throw error;

      // Filter out ONLY ACTIVE members from the contact list
      // We want to allow selecting INACTIVE members so we can add them back
      const activeMemberIds = members
        .filter(m => m.is_active !== false)
        .map(m => m.user_id);

      const matched: RegisteredContact[] = users
        .filter((u) => !activeMemberIds.includes(u.id)) 
        .map((u) => ({
          id: u.id, // ✅ Store ID for re-activation check
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
      const promises = selectedContacts.map(async (contact) => {
        // ✅ RE-ADD LOGIC:
        // Check if this contact corresponds to an existing (inactive) member
        const existingMember = members.find(m => m.user_id === contact.id);

        if (existingMember) {
          // If exists (inactive), update to active
          return supabase
            .from('trip_members')
            .update({ is_active: true })
            .eq('trip_id', tripId)
            .eq('user_id', contact.id);
        } else {
          // If new, insert row
          return addMemberToTrip({
            tripId,
            email: contact.email,
          });
        }
      });

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

  /* -------------------- RENDER -------------------- */

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

  // Filter for rendering: only show ACTIVE members
  const activeMembers = members.filter(m => m.is_active !== false);

  return (
    <SafeAreaView style={styles.safeAreaContainer}>
      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* 1. RECENT EXPENSES */}
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

        {/* 2. ACTION GRID */}
        <View style={styles.actionGrid}>
          <TouchableOpacity 
              style={[styles.gridButton, { backgroundColor: Colors.primary }]} 
              onPress={() => navigation.navigate('ExpenseInput', { id: tripId })}
          >
            <Text style={styles.actionText}>+ Expense</Text>
          </TouchableOpacity>

          <TouchableOpacity 
              style={[styles.gridButton, { backgroundColor: Colors.secondary }]} 
              onPress={() => navigation.navigate('Consents', { id: tripId })}
          >
            <Text style={styles.actionText}>Approvals</Text>
          </TouchableOpacity>

          <TouchableOpacity 
              style={[styles.gridButton, { backgroundColor: '#EF4444' }]} 
              onPress={() => navigation.navigate('Disputes', { id: tripId })}
          >
            <Text style={styles.actionText}>Disputes</Text>
          </TouchableOpacity>
        </View>

        {/* 3. MEMBERS & BALANCES */}
        <View style={styles.memberHeader}>
          <Text style={styles.sectionHeader}>Members & Balances</Text>
          <TouchableOpacity style={styles.addIcon} onPress={handleOpenContacts}>
            <Text style={styles.addIconText}>＋</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.memberListCard}>
          {activeMembers.filter(m => m.user_id !== currentUserId).map((m, i, arr) => {
            const net = calculatePeerNet(m.user_id, currentUserId, allTripExpenses);
            const userPhone = m.users?.phone || '';
            const normalizedDbPhone = normalizePhone(userPhone);
            
            const contactName = contactNameMap.get(normalizedDbPhone);
            const displayName = contactName || m.users?.name || 'Unknown User';

            return (
              // ✅ CHANGED: TouchableOpacity with onLongPress for removal
              <TouchableOpacity 
                key={m.user_id || i} 
                style={[styles.memberItemContainer, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => {}}
                onLongPress={() => handleRemoveMember(m)}
                delayLongPress={200}
                activeOpacity={0.6}
              >
                <View>
                  <Text style={styles.memberName}>{displayName}</Text>
                  <Text style={styles.memberSubtext}>
                      {net > 0 ? 'owes you' : net < 0 ? 'you owe' : 'settled'}
                  </Text>
                </View>
                <Text style={[styles.memberBalance, { color: net >= 0 ? Colors.success : Colors.danger }]}>
                  {net > 0 ? '+' : ''}{CURRENCY}{Math.abs(net).toFixed(2)}
                </Text>
              </TouchableOpacity>
            );
          })}
          {activeMembers.length <= 1 && (
              <Text style={{ padding: 16, color: '#999', fontStyle: 'italic' }}>No other members yet.</Text>
          )}
        </View>

        {/* 4. CONTACTS MODAL */}
        <Modal 
          visible={showContactModal} 
          animationType="slide"
          onRequestClose={() => setShowContactModal(false)}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Members</Text>
            </View>

            <View style={styles.searchBarContainer}>
              <TextInput 
                style={styles.searchBar}
                placeholder="Search contacts..."
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {contactLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} size="large" color={Colors.primary} />
            ) : (
              <FlatList
                  data={filteredContacts}
                  keyExtractor={(item) => item.email}
                  contentContainerStyle={{ paddingBottom: 120 }}
                  ListEmptyComponent={
                    <Text style={styles.emptyListText}>
                      {deviceContacts.length === 0 
                        ? 'No available contacts found on the app.' 
                        : 'No contacts match your search.'}
                    </Text>
                  }
                  renderItem={({ item }) => {
                    const isSelected = selectedContacts.some(c => c.email === item.email);
                    
                    return (
                      <TouchableOpacity
                        style={[
                          styles.contactItem,
                          isSelected && styles.contactItemSelected,
                        ]}
                        onPress={() => toggleContact(item)}
                      >
                        <View>
                          <Text style={styles.contactName}>{item.name}</Text>
                          <Text style={styles.contactPhone}>
                            {item.contact.phoneNumbers?.[0]?.number}
                          </Text>
                        </View>
                        
                        {isSelected && (
                          <Text style={styles.checkmark}>✓</Text>
                        )}
                      </TouchableOpacity>
                    );
                  }}
              />
            )}

            {/* FLOATING DONE BUTTON */}
            {selectedContacts.length > 0 && (
              <Pressable
                style={styles.floatingDoneButton}
                onPress={handleAddSelectedMembers}
                disabled={addingMember}
              >
                {addingMember ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.floatingDoneIcon}>✓</Text>
                )}
              </Pressable>
            )}

          </SafeAreaView>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ✅ UPDATED: Safe area styles
  safeAreaContainer: { 
    flex: 1, 
    backgroundColor: Colors.background 
  },
  scrollView: {
    padding: 16,
  },
  
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionHeader: { fontSize: 20, fontWeight: '700', marginBottom: 12, color: '#1a1a1a', marginTop: 10 },
  
  // Expenses
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
  
  // Action Grid
  actionGrid: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    gap: 10,
    marginVertical: 24 
  },
  gridButton: { 
    flex: 1, 
    paddingVertical: 14, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center',
    elevation: 2 
  },
  actionText: { 
    color: '#fff', 
    fontWeight: '700', 
    fontSize: 13 
  },
  
  // Members List
  memberHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  memberListCard: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: '#eee' },
  memberItemContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  memberName: { fontSize: 16, fontWeight: '600', color: '#333' },
  memberSubtext: { fontSize: 12, color: '#999', marginTop: 2 },
  memberBalance: { fontSize: 16, fontWeight: '700' },
  addIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  addIconText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  backBtn: { marginTop: 10, backgroundColor: Colors.primary, padding: 10, borderRadius: 8 },

  /* ---------------- MODAL STYLES ---------------- */

  modalHeader: {
    paddingTop: 24,
    paddingBottom: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },

  searchBarContainer: { padding: 16 },
  searchBar: {
    backgroundColor: '#F0F2F5',
    padding: 12,
    borderRadius: 10,
    fontSize: 16,
  },

  contactItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactItemSelected: { backgroundColor: '#F9FAFF' },
  contactName: { fontSize: 16, fontWeight: '500' },
  contactPhone: { fontSize: 12, color: '#888', marginTop: 2 },
  
  checkmark: { color: Colors.primary, fontWeight: 'bold', fontSize: 18 },
  emptyListText: { textAlign: 'center', marginTop: 40, color: '#AAA', paddingHorizontal: 20 },

  // Floating Button
  floatingDoneButton: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  floatingDoneIcon: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
});