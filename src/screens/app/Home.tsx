import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Button,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getTripBalances } from '../../api/expenses';
import { supabase } from '../../api/supabase';
import { Trip } from '../../types/database';
import { Colors } from '../../constants';
import { showAlert } from '@/src/utils/showAlert';

/* ---------------- EMPTY STATE ---------------- */

const EmptyTrips = ({ onCreate }: { onCreate: () => void }) => (
  <View style={styles.emptyContainer}>
    <Text style={styles.emptyText}>No active trips found.</Text>
    <Text style={styles.emptySubText}>
      Create a trip to start tracking expenses.
    </Text>

    <TouchableOpacity style={styles.createButton} onPress={onCreate}>
      <Text style={styles.createButtonText}>Create Trip</Text>
    </TouchableOpacity>
  </View>
);

/* ---------------- SCREEN ---------------- */

export default function Home() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  /* ---------------- DATA ---------------- */

  useFocusEffect(
    useCallback(() => {
      fetchTrips();
    }, [])
  );

  const fetchTrips = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const userId = session?.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }
    setCurrentUserId(userId);

    const { data, error } = await supabase
      .from('trip_members')
      .select('trip:trip_id(*)')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('trip.status', 'Active')
      .not('trip', 'is', null)
      .order('created_at', { foreignTable: 'trip', ascending: false });

    if (error) {
      console.error('Error fetching trips:', error);
    } else if (data) {
      setTrips(
        data
          .map((item: any) => item.trip)
          .filter((t): t is Trip => t !== null)
      );
    }

    setLoading(false);
  };

  /* ---------------- ACTIONS ---------------- */
  const handleLeaveRequest = async (trip: Trip) => {
    if (!currentUserId) return;
    setLoading(true);

    try {
      // 1. Calculate Balance before allowing leave
      const balances = await getTripBalances(trip.trip_id);
      
      // Find current user's balance
      const myBalanceData = balances.find(b => b.user_id === currentUserId);
      const myBalance = myBalanceData ? myBalanceData.net_balance : 0;

      setLoading(false);

      // 2. If balance is not ZERO (with small margin for float errors), Block them
      if (Math.abs(myBalance) > 0.01) {
        Alert.alert(
          "Cannot Leave Trip",
          `You have an outstanding balance of ${trip.currency}${myBalance.toFixed(2)}. \n\nPlease settle your debts (or get paid back) before leaving.`
        );
        return;
      }

      // 3. If Balance is Clear, Ask for Confirmation
      Alert.alert(
        'Leave Trip',
        `Are you sure you want to leave "${trip.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: () => processLeaveTrip(trip.trip_id),
          },
        ]
      );

    } catch (error) {
      setLoading(false);
      showAlert("Error", "Could not verify balance.");
    }
  };

  const processLeaveTrip = async (tripId: string) => {
    if (!currentUserId) return;
    
    try {
      const { error } = await supabase
        .from('trip_members')
        .update({ is_active: false }) 
        .eq('trip_id', tripId)
        .eq('user_id', currentUserId);

      if (error) throw error;

      // Remove from local list
      setTrips((prev) => prev.filter((t) => t.trip_id !== tripId));
      showAlert('Success', 'You have left the trip');
    } catch (error: any) {
      console.error(error);
      showAlert('Error', 'Failed to leave trip. Please try again.');
    }
  };

  const handleLongPress = (trip: Trip) => {
    if (!currentUserId) return;

    const isCreator = trip.creator_id === currentUserId;

    if (isCreator) {
      // Creator: Can Delete
      Alert.alert(
        'Delete Trip',
        `Are you sure you want to delete "${trip.name}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => deleteTrip(trip.trip_id),
          },
        ]
      );
    } else {
      handleLeaveRequest(trip);
    }
  };

  const deleteTrip = async (tripId: string) => {
    try {
      // Soft delete the trip
      const { error } = await supabase
        .from('trips')
        .update({ status: 'Deleted' })
        .eq('trip_id', tripId);

      if (error) throw error;

      setTrips((prev) => prev.filter((t) => t.trip_id !== tripId));
      showAlert('Success', 'Trip deleted successfully');
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to delete trip');
    }
  };

  const leaveTrip = async (tripId: string) => {
    if (!currentUserId) return;
    
    try {
      // Remove user from trip_members
      const { error } = await supabase
        .from('trip_members')
        .delete()
        .eq('trip_id', tripId)
        .eq('user_id', currentUserId);

      if (error) throw error;

      setTrips((prev) => prev.filter((t) => t.trip_id !== tripId));
      showAlert('Success', 'You have left the trip');
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to leave trip');
    }
  };

  /* ---------------- RENDER ITEM ---------------- */

  const renderTripItem = ({ item }: { item: Trip }) => (
    <View style={styles.tripCard}>
      <TouchableOpacity
        style={{ flex: 1 }}
        onPress={() =>
          navigation.navigate('Trip', {
            screen: 'TripHome',
            params: { id: item.trip_id },
          })
        }
        onLongPress={() => handleLongPress(item)}
        delayLongPress={500}
      >
        <Text style={styles.tripName}>{item.name}</Text>
        <Text style={styles.tripCurrency}>{item.currency}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() =>
          navigation.navigate('ScreenshotImport', {
            tripId: item.trip_id,
          })
        }
        style={styles.importBtn}
      >
        <Text style={styles.importText}>Import UPI Screenshot</Text>
      </TouchableOpacity>
    </View>
  );

  /* ---------------- LOADING ---------------- */

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  /* ---------------- UI ---------------- */

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View
        style={[
          styles.container,
          {
            paddingBottom: insets.bottom + 10,
          },
        ]}
      >
        <Text style={styles.header}>Your Active Trips</Text>

        <TouchableOpacity
          style={styles.createTripButton}
          onPress={() =>
            navigation.navigate('Trip', { screen: 'CreateTrip' })
          }
        >
          <Text style={styles.createTripText}>+ Create Trip</Text>
        </TouchableOpacity>

        <FlatList
          data={trips}
          keyExtractor={item => item.trip_id}
          renderItem={renderTripItem}
          ListEmptyComponent={
            <EmptyTrips
              onCreate={() =>
                navigation.navigate('Trip', { screen: 'CreateTrip' })
              }
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: 30,
          }}
        />

        <View style={{ marginTop: 12 }}>
          <Button
            title="Logout"
            onPress={() => supabase.auth.signOut()}
            color={Colors.danger}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },

  tripCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },

  tripName: {
    fontSize: 16,
    fontWeight: '600',
  },

  tripCurrency: {
    fontSize: 13,
    color: Colors.primary,
    marginTop: 2,
  },

  importBtn: {
    backgroundColor: '#E8F2FF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginLeft: 10,
  },

  importText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },

  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },

  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },

  emptySubText: {
    fontSize: 14,
    color: '#666',
    marginVertical: 10,
    textAlign: 'center',
  },

  createButton: {
    marginTop: 20,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },

  createButtonText: {
    color: '#fff',
    fontWeight: '600',
  },

  createTripButton: {
    backgroundColor: Colors.primary,
    padding: 14,
    borderRadius: 10,
    marginBottom: 15,
    alignItems: 'center',
  },

  createTripText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
