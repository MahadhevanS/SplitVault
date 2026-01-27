import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '@/src/api/supabase';
import { Colors, CURRENCY } from '@/src/constants';

/* ---------------- TYPES ---------------- */

interface Disputer {
  id: string;
  name: string;
  phone?: string;
}

// Flattened structure for the UI List
interface DisputedItem {
  consent_id: string;
  status: string;
  timestamp: string;
  debtor_user_id: string;
  debtor: Disputer;
  expense: {
    expense_id: string;
    name: string; // Mapped from expense_name
    amount: number;
    trip_id: string;
    payer_id: string;
  };
}

/* ---------------- HELPER API FUNCTIONS ---------------- */

async function fetchMyDisputes(tripId: string, payerId: string): Promise<DisputedItem[]> {
  // 1. Fetch Expenses paid by ME that have 'Disputed' consents
  const { data, error } = await supabase
    .from('expenses')
    .select(`
      expense_id,
      name,
      amount,
      trip_id,
      payer_id,
      consents!inner (
        consent_id,
        status,
        timestamp,
        debtor_user_id,
        debtor:users (
          id,
          name,
          phone
        )
      )
    `)
    .eq('trip_id', tripId)
    .eq('payer_id', payerId) // I am the Payer
    .eq('consents.status', 'Disputed') // Only fetch disputed consents
    .order('date_incurred', { ascending: false }); // Using 'date' as per your schema

  if (error) throw error;

  // 2. Flatten the nested result
  const flattened: DisputedItem[] = [];

  (data || []).forEach((exp: any) => {
    // exp.consents is an array of disputes for this expense
    if (Array.isArray(exp.consents)) {
      exp.consents.forEach((consent: any) => {
        flattened.push({
          consent_id: consent.consent_id,
          status: consent.status,
          timestamp: consent.timestamp,
          debtor_user_id: consent.debtor_user_id,
          debtor: consent.debtor,
          expense: {
            expense_id: exp.expense_id,
            name: exp.expense_name, // Mapping DB column 'expense_name' to 'name'
            amount: exp.amount,
            trip_id: exp.trip_id,
            payer_id: exp.payer_id,
          },
        });
      });
    }
  });

  return flattened;
}

async function resolveDisputeRemoveMember(
  consentId: string, 
  expenseId: string, 
  debtorId: string, 
  totalAmount: number
) {
  // 1. Delete the Consent record (The dispute is technically resolved by removal)
  const { error: consentError } = await supabase
    .from('consents')
    .delete()
    .eq('consent_id', consentId);

  if (consentError) throw consentError;

  // 2. Delete the Involvement record (Remove them from the split)
  const { error: invError } = await supabase
    .from('involvements')
    .delete()
    .eq('expense_id', expenseId)
    .eq('debtor_user_id', debtorId);

  if (invError) throw invError;

  // 3. RECALCULATE SPLIT for remaining members
  // a. Fetch who is left
  const { data: remainingInvolvements, error: fetchError } = await supabase
    .from('involvements')
    .select('debtor_user_id')
    .eq('expense_id', expenseId);
  
  if (fetchError) throw fetchError;

  const remainingCount = remainingInvolvements?.length || 0;

  if (remainingCount > 0) {
    // b. Calculate new share
    const newShare = totalAmount / remainingCount;
    
    // c. Update all remaining rows
    const { error: updateError } = await supabase
      .from('involvements')
      .update({ share_amount: newShare })
      .eq('expense_id', expenseId);

    if (updateError) throw updateError;
  }
}

async function rejectDisputeKeepMember(consentId: string) {
  // Set status back to 'Required' so it reappears in the debtor's feed to approve again
  const { error } = await supabase
    .from('consents')
    .update({ status: 'Required' })
    .eq('consent_id', consentId);
  
  if (error) throw error;
}

/* ---------------- COMPONENT ---------------- */

export default function DisputesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { id: tripId } = route.params;

  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<DisputedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  /* --- INIT --- */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (tripId && userId) {
      loadData();
    }
  }, [tripId, userId]);

  const loadData = async () => {
    if (!userId) return;
    try {
      const data = await fetchMyDisputes(tripId, userId);
      setItems(data);
    } catch (error) {
      console.error('Error fetching disputes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [userId, tripId]);

  /* --- ACTIONS --- */

  const handleRemoveMember = async (item: DisputedItem) => {
    Alert.alert(
      "Remove Member?",
      `${item.debtor?.name || 'User'} will be removed from this expense. The cost will be re-distributed among the remaining members.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Confirm & Recalculate", 
          style: "destructive",
          onPress: async () => {
            setProcessingId(item.consent_id);
            try {
              await resolveDisputeRemoveMember(
                item.consent_id, 
                item.expense.expense_id, 
                item.debtor_user_id, 
                item.expense.amount
              );
              // Remove from UI immediately
              setItems(prev => prev.filter(i => i.consent_id !== item.consent_id));
              Alert.alert("Success", "Member removed. Splits have been updated.");
            } catch (e: any) {
              Alert.alert("Error", e.message);
            } finally {
              setProcessingId(null);
            }
          }
        }
      ]
    );
  };

  const handleKeepMember = async (item: DisputedItem) => {
    Alert.alert(
      "Reject Dispute?",
      `${item.debtor?.name || 'User'} will be kept in the split. The expense will be sent back to them for approval.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Reject Dispute", 
          onPress: async () => {
            setProcessingId(item.consent_id);
            try {
              await rejectDisputeKeepMember(item.consent_id);
              setItems(prev => prev.filter(i => i.consent_id !== item.consent_id));
              Alert.alert("Done", "Dispute rejected. Member is still involved.");
            } catch (e: any) {
              Alert.alert("Error", e.message);
            } finally {
              setProcessingId(null);
            }
          }
        }
      ]
    );
  };

  /* --- RENDER --- */

  const renderItem = ({ item }: { item: DisputedItem }) => {
    const isProcessing = processingId === item.consent_id;

    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.expenseName}>{item.expense.name}</Text>
          <Text style={styles.amountText}>{CURRENCY}{item.expense.amount}</Text>
        </View>
        
        <View style={styles.disputeBanner}>
          <View style={styles.iconCircle}><Text style={styles.iconText}>!</Text></View>
          <Text style={styles.disputeText}>
            <Text style={{fontWeight: '700'}}>{item.debtor?.name || 'Unknown'}</Text> disputed this.
          </Text>
        </View>

        <Text style={styles.helpText}>
          They claim they shouldn't pay for this. Do you want to remove them from the split or reject their claim?
        </Text>

        <View style={styles.buttonRow}>
          {/* REJECT (Keep Member) */}
          <TouchableOpacity 
            style={[styles.button, styles.keepButton]} 
            onPress={() => handleKeepMember(item)}
            disabled={isProcessing}
          >
            <Text style={[styles.buttonText, {color: Colors.primary}]}>Keep Member</Text>
          </TouchableOpacity>

          {/* ACCEPT (Remove Member) */}
          <TouchableOpacity 
            style={[styles.button, styles.removeButton]} 
            onPress={() => handleRemoveMember(item)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={[styles.buttonText, {color: '#fff'}]}>Remove Member</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.consent_id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.centerContainer}>
            <Text style={styles.emptyTitle}>No Disputes</Text>
            <Text style={styles.emptySubtitle}>
              There are no active disputes for expenses you paid.
            </Text>
          </View>
        }
      />
    </View>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F4F8',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    marginTop: 50,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  expenseName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
  },
  amountText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  disputeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2', // Light Red
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  iconText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  disputeText: {
    color: '#991B1B', // Dark Red
    fontSize: 14,
  },
  helpText: {
    color: '#6B7280',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  removeButton: {
    backgroundColor: '#EF4444', // Red
  },
  keepButton: {
    backgroundColor: '#EFF6FF', // Light Blue
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#374151',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },
});