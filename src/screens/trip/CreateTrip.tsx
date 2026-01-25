import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  SafeAreaView,
  Pressable, // Added for the modal backdrop
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Contacts from 'expo-contacts';

import { supabase } from '@/src/api/supabase';
import { createTrip } from '@/src/api/trips';
import { addMemberToTrip } from '@/src/api/tripMembers';
import { showAlert } from '@/src/utils/showAlert';
import { Colors } from '@/src/constants';

/* ---------------- TYPES & CONSTANTS ---------------- */

interface SelectedMember {
  email: string;
  name: string;
}

interface RegisteredContact {
  contact: Contacts.Contact;
  email: string;
  name: string;
}

// ✅ Defined the options you requested
const CURRENCY_OPTIONS = [
  { label: 'Indian Rupee', value: 'INR', symbol: '₹' },
  { label: 'US Dollar', value: 'USD', symbol: '$' },
  { label: 'NZ Dollar', value: 'NZD', symbol: 'NZ$' },
  { label: 'Japanese Yen', value: 'JPY', symbol: '¥' },
  { label: 'Euro', value: 'EUR', symbol: '€' },
];

/* ---------------- SCREEN ---------------- */

export default function CreateTripScreen() {
  const navigation = useNavigation<any>();

  const [name, setName] = useState('');
  
  // ✅ Default to INR object
  const [selectedCurrency, setSelectedCurrency] = useState(CURRENCY_OPTIONS[0]);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<SelectedMember[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  const [showContactModal, setShowContactModal] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<RegisteredContact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [contactLoading, setContactLoading] = useState(false);

  /* ---------------- INIT ---------------- */

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setCurrentUserEmail(user.email);
      }
    });
  }, []);

  /* ---------------- HELPERS ---------------- */

  const normalizePhone = (phone: string) => {
    let cleaned = phone.replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+91')) cleaned = cleaned.slice(3);
    return cleaned;
  };

  const filteredContacts = useMemo(() => {
    return deviceContacts.filter((c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, deviceContacts]);

  const toggleMember = (contact: RegisteredContact) => {
    setMembers((prev) => {
      const exists = prev.some((m) => m.email === contact.email);
      if (exists) {
        return prev.filter((m) => m.email !== contact.email);
      } else {
        return [...prev, { email: contact.email, name: contact.name }];
      }
    });
  };

  const removeMember = (email: string) => {
    setMembers((prev) => prev.filter((m) => m.email !== email));
  };

  /* ---------------- CONTACTS ---------------- */

  async function handleOpenContacts() {
    setContactLoading(true);
    setShowContactModal(true);

    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Enable contact access in settings.', [
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
        .select('phone, email, name')
        .in('phone', phoneNumbers);

      if (error) throw error;

      const matched: RegisteredContact[] = users
        .filter((u) => u.email !== currentUserEmail)
        .map((u) => ({
          contact: phoneToContact.get(u.phone)!,
          email: u.email,
          name: phoneToContact.get(u.phone)?.name || u.name || 'Unknown',
        }));

      setDeviceContacts(matched);
    } catch {
      showAlert('Error', 'Failed to load contacts');
    } finally {
      setContactLoading(false);
    }
  }

  /* ---------------- CREATE TRIP ---------------- */

  async function handleCreate() {
    if (!name.trim()) {
      showAlert('Invalid name', 'Trip name cannot be empty');
      return;
    }

    setLoading(true);
    try {
      // ✅ Pass the selected value (e.g., 'INR') to the backend
      const trip = await createTrip({ 
        name, 
        currency: selectedCurrency.value 
      });

      for (const member of members) {
        await addMemberToTrip({
          tripId: trip.trip_id,
          email: member.email,
          nickname: member.name,
        });
      }

      navigation.replace('TripHome', { id: trip.trip_id });
    } catch (e: any) {
      showAlert('Create Trip Failed', e.message);
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- UI ---------------- */

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          <Text style={styles.header}>Create New Trip</Text>

          {/* TRIP NAME INPUT */}
          <Text style={styles.label}>Trip Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Goa Trip 2024"
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
          />

          {/* ✅ CURRENCY DROPDOWN TRIGGER */}
          <Text style={styles.label}>Currency</Text>
          <TouchableOpacity 
            style={styles.input} // Reusing input style for consistency
            onPress={() => setShowCurrencyPicker(true)}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: '#000' }}>
                {selectedCurrency.value} ({selectedCurrency.symbol}) - {selectedCurrency.label}
              </Text>
              <Text style={{ color: '#666', fontSize: 12 }}>▼</Text>
            </View>
          </TouchableOpacity>


          {/* MEMBERS SECTION */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>Members</Text>
            <TouchableOpacity onPress={handleOpenContacts}>
              <Text style={styles.addBtnLink}>+ Add from Contacts</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.membersContainer}>
            {members.length === 0 && (
              <Text style={styles.emptyMembersText}>No members added yet.</Text>
            )}
            {members.map((m) => (
              <View key={m.email} style={styles.memberChip}>
                <Text style={styles.memberText}>{m.name}</Text>
                <TouchableOpacity onPress={() => removeMember(m.email)}>
                  <Text style={styles.removeMemberX}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>

        <TouchableOpacity
          style={[styles.createButton, (!name.trim() || loading) && { opacity: 0.5 }]}
          onPress={handleCreate}
          disabled={!name.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createButtonText}>Create Trip</Text>
          )}
        </TouchableOpacity>

        {/* ---------------- CONTACT MODAL ---------------- */}
        <Modal visible={showContactModal} animationType="slide">
          <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowContactModal(false)}>
                <Text style={styles.doneModalText}>Done</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Add Friends</Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={styles.searchBarContainer}>
              <TextInput
                style={styles.searchBar}
                placeholder="Search by name..."
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {contactLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} />
            ) : (
              <FlatList
                data={filteredContacts}
                keyExtractor={(i) => i.email}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
                renderItem={({ item }) => {
                  const isSelected = members.some((m) => m.email === item.email);
                  const initials = item.name.split(' ').map((n) => n[0]).slice(0, 2).join('');
                  return (
                    <TouchableOpacity
                      style={[styles.contactItem, isSelected && styles.contactItemSelected]}
                      onPress={() => toggleMember(item)}
                    >
                      <View style={styles.contactLeft}>
                        <View style={styles.contactAvatar}>
                          <Text style={styles.avatarText}>{initials}</Text>
                        </View>
                        <View>
                          <Text style={styles.contactName}>{item.name}</Text>
                          <Text style={styles.contactPhone}>{item.contact.phoneNumbers?.[0]?.number}</Text>
                        </View>
                      </View>
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                         {isSelected && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.emptyListText}>
                    {deviceContacts.length === 0
                      ? 'None of your contacts are on the app yet.'
                      : 'No contacts found.'}
                  </Text>
                }
              />
            )}
          </SafeAreaView>
        </Modal>

        {/* ---------------- ✅ CURRENCY PICKER MODAL ---------------- */}
        <Modal visible={showCurrencyPicker} transparent animationType="fade">
          <Pressable 
            style={styles.modalOverlay} 
            onPress={() => setShowCurrencyPicker(false)}
          >
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerTitle}>Select Currency</Text>
              {CURRENCY_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={styles.pickerOption}
                  onPress={() => {
                    setSelectedCurrency(opt);
                    setShowCurrencyPicker(false);
                  }}
                >
                  <Text style={[
                    styles.pickerOptionText,
                    selectedCurrency.value === opt.value && styles.pickerOptionTextSelected
                  ]}>
                    {opt.label} ({opt.symbol})
                  </Text>
                  {selectedCurrency.value === opt.value && (
                     <Text style={{color: Colors.primary, fontWeight:'bold'}}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Modal>

      </View>
    </SafeAreaView>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  header: { fontSize: 28, fontWeight: 'bold', marginBottom: 25 },
  label: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8 },
  input: {
    backgroundColor: '#F0F2F5',
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
    // ensure text and button height match
    minHeight: 50, 
    justifyContent: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addBtnLink: { color: Colors.primary, fontWeight: '700' },
  membersContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberChip: {
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberText: { color: '#fff', fontWeight: '600', marginRight: 8 },
  removeMemberX: { color: '#fff', fontWeight: 'bold' },
  emptyMembersText: { color: '#AAA', fontStyle: 'italic' },

  createButton: {
    backgroundColor: Colors.primary,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
  },
  createButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  // CONTACT MODAL
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  doneModalText: { color: Colors.primary, fontWeight: '700', fontSize: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  searchBarContainer: { padding: 16 },
  searchBar: {
    backgroundColor: '#F0F2F5',
    padding: 12,
    borderRadius: 10,
    fontSize: 16,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  contactItemSelected: { backgroundColor: '#F9FAFF' },
  contactLeft: { flexDirection: 'row', alignItems: 'center' },
  contactAvatar: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: '#E8F2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  avatarText: { color: Colors.primary, fontWeight: 'bold', fontSize: 18 },
  contactName: { fontSize: 16, fontWeight: '600' },
  contactPhone: { fontSize: 13, color: '#888' },
  emptyListText: { textAlign: 'center', marginTop: 40, color: '#AAA' },
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
  checkmark: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  // ✅ CURRENCY PICKER STYLES
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  pickerOption: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  pickerOptionText: {
    fontSize: 16,
    color: '#333',
  },
  pickerOptionTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  }
});