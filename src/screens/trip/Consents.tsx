import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useRoute } from '@react-navigation/native';

import { getPendingConsents, updateConsentStatus } from '@/src/api/expenses';
import { supabase } from '@/src/api/supabase';
import { Colors, CURRENCY, CONSENT_STATUSES } from '@/src/constants';

interface ConsentItem {
  consent_id: string;
  expense: {
    name: string;
    amount: number;
    payer: { name: string };
  };
}

export default function Consents() {
  const route = useRoute<any>();
  const { id: tripId } = route.params;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pendingConsents, setPendingConsents] = useState<ConsentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (tripId && currentUserId) fetchConsents();
  }, [tripId, currentUserId]);

  async function fetchConsents() {
    try {
      setLoading(true);
      const data = await getPendingConsents(tripId, currentUserId!);
      setPendingConsents(data);
    } catch {
      Alert.alert('Error', 'Failed to load consents.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(
    consentId: string,
    action: 'Approved' | 'Disputed'
  ) {
    try {
      await updateConsentStatus(consentId, action);
      fetchConsents();
    } catch {
      Alert.alert('Error', 'Failed to update consent.');
    }
  }

  if (loading) {
    return <ActivityIndicator size="large" style={{ flex: 1 }} />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={pendingConsents}
        keyExtractor={(item) => item.consent_id}
        ListEmptyComponent={
          <Text style={styles.emptyText}>You have no pending approvals.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.expense.name}</Text>
            <Text>
              Paid by {item.expense.payer.name} — {CURRENCY}
              {item.expense.amount.toFixed(2)}
            </Text>

            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.button, styles.approve]}
                onPress={() =>
                  handleAction(item.consent_id, CONSENT_STATUSES.APPROVED)
                }
              >
                <Text style={styles.buttonText}>Approve</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.dispute]}
                onPress={() =>
                  handleAction(item.consent_id, CONSENT_STATUSES.DISPUTED)
                }
              >
                <Text style={styles.buttonText}>Dispute</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: Colors.background },
  emptyText: { textAlign: 'center', marginTop: 40 },

  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  name: { fontSize: 16, fontWeight: 'bold' },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  button: {
    width: '48%',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  approve: { backgroundColor: Colors.success },
  dispute: { backgroundColor: Colors.danger },
  buttonText: { color: '#fff', fontWeight: 'bold' },
});
