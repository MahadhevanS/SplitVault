import React, { useEffect, useState } from 'react';
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
import { Consent } from '@/src/types/database';

export default function Consents() {
  const route = useRoute<any>();
  const { id: tripId } = route.params;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pendingConsents, setPendingConsents] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(true);

  // Get current user
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user.id ?? null);
    });
  }, []);

  // Fetch consents when ready
  useEffect(() => {
    if (tripId && currentUserId) {
      fetchConsents();
    }
  }, [tripId, currentUserId]);

  async function fetchConsents() {
    try {
      setLoading(true);
      const data = await getPendingConsents(tripId, currentUserId!);
      setPendingConsents(data ?? []);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to load consents.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(
    consentId: string,
    action: typeof CONSENT_STATUSES.APPROVED | typeof CONSENT_STATUSES.DISPUTED
  ) {
    try {
      await updateConsentStatus(consentId, action);
      fetchConsents();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to update consent.');
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={pendingConsents}
        keyExtractor={(item) => item.consent_id}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            You have no pending approvals.
          </Text>
        }
        renderItem={({ item }) => {
          // 🛡️ Absolute safety guard
          if (!item.expense || !item.expense.payer) {
            return null;
          }

          return (
            <View style={styles.card}>
              <Text style={styles.name}>{item.expense.name}</Text>

              <Text style={styles.amount}>
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
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 15,
    backgroundColor: Colors.background,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: Colors.textSecondary,
  },

  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },

  name: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },

  amount: {
    fontSize: 14,
    color: Colors.textPrimary,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },

  button: {
    width: '48%',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },

  approve: {
    backgroundColor: Colors.success,
  },

  dispute: {
    backgroundColor: Colors.danger,
  },

  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
