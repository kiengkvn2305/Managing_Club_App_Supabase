import { check, page } from './service-helpers.js';

export function createSponsorshipService({ supabase }) {
  async function handleSponsorshipRequest(clean, method, data, params, clubId, current) {
    if (!clubId) return null;

    if (clean.endsWith('/sponsors') && method === 'GET') {
      return page(
        check(
          await supabase
            .from('sponsors')
            .select('*')
            .eq('club_id', clubId)
            .order('name')
        ) || [],
        params
      );
    }

    if (clean.endsWith('/sponsors') && method === 'POST') {
      return {
        data: check(
          await supabase
            .from('sponsors')
            .insert({
              club_id: clubId,
              name: data.name,
              contact_name: data.contact_name || null,
              email: data.email || null,
              phone: data.phone || null,
              notes: data.notes || null,
            })
            .select()
            .single()
        ),
      };
    }

    const sponsor = clean.match(/\/sponsors\/(\d+)$/);
    if (sponsor && method === 'PATCH') {
      return {
        data: check(
          await supabase
            .from('sponsors')
            .update({
              name: data.name,
              contact_name: data.contact_name || null,
              email: data.email || null,
              phone: data.phone || null,
              notes: data.notes || null,
            })
            .eq('club_id', clubId)
            .eq('id', Number(sponsor[1]))
            .select()
            .single()
        ),
      };
    }

    if (sponsor && method === 'DELETE') {
      check(
        await supabase
          .from('sponsors')
          .delete()
          .eq('club_id', clubId)
          .eq('id', Number(sponsor[1]))
      );
      return {};
    }

    if (clean.endsWith('/sponsorships') && method === 'GET') {
      const rows =
        check(
          await supabase
            .from('sponsorships')
            .select('*,sponsor:sponsors(name)')
            .eq('club_id', clubId)
            .order('ends_on')
        ) || [];
      const receipts =
        check(
          await supabase
            .from('sponsorship_receipts')
            .select('sponsorship_id,value')
            .eq('club_id', clubId)
        ) || [];
      return page(
        rows.map((row) => ({
          ...row,
          sponsor_name: row.sponsor?.name,
          received_value: receipts
            .filter((receipt) => receipt.sponsorship_id === row.id)
            .reduce((sum, receipt) => sum + Number(receipt.value), 0),
        })),
        params
      );
    }

    if (clean.endsWith('/sponsorships') && method === 'POST') {
      return {
        data: check(
          await supabase
            .from('sponsorships')
            .insert({
              ...data,
              club_id: clubId,
              sponsor_id: Number(data.sponsor_id),
              value: Number(data.value),
            })
            .select()
            .single()
        ),
      };
    }

    const sponsorship = clean.match(/\/sponsorships\/(\d+)$/);
    if (sponsorship && method === 'PATCH') {
      return {
        data: check(
          await supabase
            .from('sponsorships')
            .update({
              ...data,
              sponsor_id: Number(data.sponsor_id),
              value: Number(data.value),
            })
            .eq('club_id', clubId)
            .eq('id', Number(sponsorship[1]))
            .select()
            .single()
        ),
      };
    }

    const sponsorshipReceipts = clean.match(/\/sponsorships\/(\d+)\/receipts$/);
    if (sponsorshipReceipts && method === 'GET') {
      return page(
        check(
          await supabase
            .from('sponsorship_receipts')
            .select('*')
            .eq('club_id', clubId)
            .eq('sponsorship_id', Number(sponsorshipReceipts[1]))
            .order('received_on', { ascending: false })
        ) || [],
        params
      );
    }

    if (sponsorshipReceipts && method === 'POST') {
      return {
        data: check(
          await supabase
            .from('sponsorship_receipts')
            .insert({
              club_id: clubId,
              sponsorship_id: Number(sponsorshipReceipts[1]),
              value: Number(data.value),
              received_on: data.received_on,
              notes: data.notes || null,
              actor_id: current.id,
            })
            .select()
            .single()
        ),
      };
    }

    return null;
  }

  return {
    handleSponsorshipRequest,
  };
}
