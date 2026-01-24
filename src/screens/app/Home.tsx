import React, { useState, useEffect } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../api/supabase';
import { Trip } from '../../types/database';
import { Colors } from '../../constants';
import { showAlert } from '@/src/utils/showAlert';

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

export default function Home() {
  const navigation = useNavigation<any>();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrips();
  }, []);

  const fetchTrips = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const userId = session?.user?.id;

    if (!userId) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('trip_members')
      .select('trip:trip_id(*)')
      .eq('user_id', userId)
      .eq('trip.status', 'Active');

    if (error) {
      console.error('Error fetching trips:', error);
    } else if (data) {
      setTrips(
        data
          .map(item => item.trip)
          .filter((t): t is Trip => t !== null)
      );
    }

    setLoading(false);
  };

  /* ---------------- DELETE LOGIC ---------------- */

  const confirmDelete = (trip: Trip) => {
    Alert.alert(
      'Delete Trip',
      `Are you sure you want to delete "${trip.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteTrip(trip.trip_id),
        },
      ]
    );
  };

  const deleteTrip = async (tripId: string) => {
    try {
      const { error } = await supabase
        .from('trips')
        .update({ status: 'Deleted' })
        .eq('trip_id', tripId);

      if (error) throw error;

      setTrips(prev => prev.filter(t => t.trip_id !== tripId));
      showAlert('Success', 'Trip deleted successfully');
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to delete trip');
    }
  };

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
        onLongPress={() => confirmDelete(item)}
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

  if (loading) {
    return <ActivityIndicator size="large" style={{ flex: 1 }} />;
  }

  return (
    <View style={styles.container}>
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
        ListEmptyComponent={<EmptyTrips onCreate={() => navigation.navigate('Trip', { screen: 'CreateTrip' })} />}
      />

      <Button
        title="Logout"
        onPress={() => supabase.auth.signOut()}
        color={Colors.danger}
      />
    </View>
  );
}


/* -------------------- STYLES -------------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: Colors.background,
  },

  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },

  tripCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
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

  scanQrButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginLeft: 10,
  },

  scanQrText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 50,
  },

  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
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
