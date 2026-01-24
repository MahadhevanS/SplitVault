import React, { useState, useMemo } from 'react';
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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Contacts from 'expo-contacts';

import { supabase } from '@/src/api/supabase';
import { createTrip } from '@/src/api/trips';
import { addMemberToTrip } from '@/src/api/tripMembers';
import { showAlert } from '@/src/utils/showAlert';
import { Colors } from '@/src/constants';

interface SelectedMember {
  email: string;
  name: string;
}

export default function CreateTripScreen() {
  const navigation = useNavigation<any>();

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<SelectedMember[]>([]);

  const [showContactModal, setShowContactModal] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<Contacts.Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [contactLoading, setContactLoading] = useState(false);

  /* -------------------- HELPERS -------------------- */

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

  const removeMember = (email: string) => {
    setMembers(prev => prev.filter(m => m.email !== email));
  };

  /* -------------------- CONTACTS -------------------- */

  async function handleOpenContacts() {
    setContactLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Enable contact access in settings.', [
          { text: 'Cancel' },
          { text: 'Settings', onPress: () => Linking.openSettings() },
        ]);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        sort: Contacts.SortTypes.FirstName,
      });

      setDeviceContacts(data.filter((c) => c.phoneNumbers?.length));
      setShowContactModal(true);
    } catch (e) {
      showAlert('Error', 'Failed to load contacts');
    } finally {
      setContactLoading(false);
    }
  }

  async function selectContact(contact: Contacts.Contact) {
    if (!contact.phoneNumbers?.length) return;
    const cleanNumbers = contact.phoneNumbers.map((p) => normalizePhone(p.number!));

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('email')
        .in('phone', cleanNumbers);

      if (error) throw error;
      if (!data || data.length === 0) {
        showAlert('User not found', `${contact.name} is not registered on the app.`);
        return;
      }

      const email = data[0].email;
      if (members.some((m) => m.email === email)) {
        showAlert('Already added', `${contact.name} is already selected.`);
        return;
      }

      setMembers((prev) => [...prev, { email, name: contact.name }]);
      setShowContactModal(false);
      setSearchQuery('');
    } catch (e: any) {
      showAlert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  /* -------------------- CREATE TRIP -------------------- */

  async function handleCreate() {
    if (!name.trim()) {
      showAlert('Invalid name', 'Trip name cannot be empty');
      return;
    }

    setLoading(true);
    try {
      const trip = await createTrip({ name, currency });
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          <Text style={styles.header}>Create New Trip</Text>

          <Text style={styles.label}>Trip Details</Text>
          <TextInput style={styles.input} placeholder="e.g., Goa Trip 2024" value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Currency (e.g. INR)" value={currency} onChangeText={setCurrency} />

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>Members</Text>
            <TouchableOpacity onPress={handleOpenContacts}>
              <Text style={styles.addBtnLink}>+ Add from Contacts</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.membersContainer}>
            {members.length === 0 && <Text style={styles.emptyMembersText}>No members added yet.</Text>}
            {members.map((m, i) => (
              <View key={i} style={styles.memberChip}>
                <Text style={styles.memberText}>{m.name}</Text>
                <TouchableOpacity onPress={() => removeMember(m.email)}>
                  <Text style={styles.removeMemberX}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>

        <TouchableOpacity
          style={[styles.createButton, (loading || !name.trim()) && { opacity: 0.5 }]}
          onPress={handleCreate}
          disabled={loading || !name.trim()}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>Create Trip</Text>}
        </TouchableOpacity>

        {/* --- ENHANCED CONTACT MODAL --- */}
        <Modal 
          visible={showContactModal} 
          animationType="slide"
          onRequestClose={() => setShowContactModal(false)} // Handles Android back button
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowContactModal(false)} style={styles.closeModalBtn}>
                <Text style={styles.closeModalText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Select Friend</Text>
              <View style={{ width: 60 }} />
            </View>

            <View style={styles.searchBarContainer}>
              <TextInput
                style={styles.searchBar}
                placeholder="Search by name..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
            </View>

            {contactLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
            ) : (
              <FlatList
                data={filteredContacts}
                keyExtractor={(c) => c.id}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.contactItem} onPress={() => selectContact(item)}>
                    <View style={styles.contactAvatar}>
                      <Text style={styles.avatarText}>{item.name[0]}</Text>
                    </View>
                    <View>
                      <Text style={styles.contactName}>{item.name}</Text>
                      <Text style={styles.contactPhone}>{item.phoneNumbers?.[0]?.number}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptyListText}>No contacts found.</Text>
                }
              />
            )}
          </SafeAreaView>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  header: { fontSize: 28, fontWeight: 'bold', marginBottom: 25, color: '#1A1A1A' },
  label: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: '#F0F2F5', padding: 16, borderRadius: 14, marginBottom: 20, fontSize: 16 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addBtnLink: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
  membersContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberChip: { backgroundColor: Colors.primary, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, flexDirection: 'row', alignItems: 'center' },
  memberText: { color: '#fff', fontWeight: '600', marginRight: 8 },
  removeMemberX: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  emptyMembersText: { color: '#AAA', fontStyle: 'italic' },
  createButton: { backgroundColor: Colors.primary, padding: 18, borderRadius: 16, alignItems: 'center', position: 'absolute', bottom: 24, left: 24, right: 24 },
  createButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  /* Modal Styles */
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  closeModalText: { color: Colors.primary, fontSize: 16, fontWeight: '600' },
  closeModalBtn: { padding: 4 },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  searchBarContainer: { padding: 16 },
  searchBar: { backgroundColor: '#F0F2F5', padding: 12, borderRadius: 10, fontSize: 16 },
  contactItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  contactAvatar: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: '#E8F2FF', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  avatarText: { color: Colors.primary, fontWeight: 'bold', fontSize: 18 },
  contactName: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  contactPhone: { fontSize: 13, color: '#888', marginTop: 2 },
  emptyListText: { textAlign: 'center', marginTop: 40, color: '#AAA' },
});