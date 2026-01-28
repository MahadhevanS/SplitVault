import { supabase } from '@/src/api/supabase';

export async function createTrip({
  name,
  currency,
}: {
  name: string;
  currency: string;
}) {
  // ✅ AUTHORITATIVE USER FETCH (FIX)
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error('Not authenticated');
  }

  const userId = data.user.id;

  // 1. Create trip
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .insert({
      name,
      creator_id: userId,
      currency,
    })
    .select()
    .single();

  if (tripError) {
    throw tripError;
  }

  // 2. Add creator as member
  const { error: memberError } = await supabase
    .from('trip_members')
    .insert({
      trip_id: trip.trip_id,
      user_id: userId,
    });

  if (memberError) {
    throw memberError;
  }

  return trip;
}
