import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { supabase } from '@/src/api/supabase';
import { getDisputedExpenses } from '@/src/api/expenses';

export default function Disputes() {
  const route = useRoute<any>();
  const { id: tripId } = route.params;

  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!tripId || !userId) return;
    load();
  }, [tripId, userId]);

  async function load() {
    setLoading(true);
    const data = await getDisputedExpenses(tripId, userId!);
    setItems(data);
    setLoading(false);
  }

  if (loading) {
    return <ActivityIndicator size="large" style={{ flex: 1 }} />;
  }

  return (
    <View style={{ padding: 16 }}>
      {items.map((item) => (
        <View key={item.consent_id} style={{ marginBottom: 16 }}>
          <Text style={{ fontWeight: 'bold' }}>{item.expense.name}</Text>
        </View>
      ))}
    </View>
  );
}
