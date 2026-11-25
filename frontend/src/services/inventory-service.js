import { check, page, truthy } from './service-helpers.js';

export function createInventoryService({ supabase }) {
  async function inventoryAssignments(clubId, itemId, params) {
    const result = await supabase
      .from('inventory_assignments')
      .select('*')
      .eq('club_id', clubId)
      .eq('inventory_item_id', itemId)
      .order('id', { ascending: false });
    return page(check(result) || [], params, 50);
  }

  async function inventoryIncidents(clubId) {
    if (typeof supabase?.rpc === 'function') {
      try {
        const res = await supabase.rpc('get_inventory_incidents_report', {
          p_club_id: clubId,
        });
        if (!res.error && res.data) {
          return { data: res.data };
        }
      } catch {}
    }

    const movements =
      check(
        await supabase
          .from('inventory_movements')
          .select('*,item:inventory_items(name,unit),assignment:inventory_assignments(player_name)')
          .eq('club_id', clubId)
          .in('type', ['damaged', 'lost'])
          .order('id', { ascending: false })
          .limit(100)
      ) || [];

    const mapped = movements.map((m) => ({
      ...m,
      item_name: m.item?.name || '',
      unit: m.item?.unit || '',
      player_name: m.assignment?.player_name || null,
    }));

    return {
      data: {
        damaged_count: mapped.filter((m) => m.type === 'damaged').length,
        lost_count: mapped.filter((m) => m.type === 'lost').length,
        data: mapped,
      },
    };
  }

  async function inventory(clubId, params) {
    let b = supabase
      .from('inventory_items')
      .select('*')
      .eq('club_id', clubId)
      .order('name');
    if (!truthy(params.get('archived'))) b = b.eq('archived', false);
    if (params.get('search')) b = b.ilike('name', `%${params.get('search')}%`);
    let rows = check(await b) || [];
    const lowStockCount = rows.filter(
      (x) => !x.archived && x.quantity <= x.low_stock_threshold
    ).length;

    let incidentCount = 0;
    try {
      const inc = await supabase
        .from('inventory_movements')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', clubId)
        .in('type', ['damaged', 'lost']);
      incidentCount = inc?.count || 0;
    } catch {}

    const totalItems = rows.length;
    if (truthy(params.get('low_stock'))) {
      rows = rows.filter((x) => x.quantity <= x.low_stock_threshold);
    }
    return {
      ...page(rows, params),
      total: rows.length,
      summary: {
        total_items: totalItems,
        low_stock_count: lowStockCount,
        incident_count: incidentCount,
      },
    };
  }

  async function handleInventoryRequest(clean, method, data, params, clubId) {
    if (!clubId) return null;

    if (clean === `/clubs/${clubId}/inventory/incidents` && method === 'GET') {
      return inventoryIncidents(clubId);
    }

    if (clean.endsWith('/inventory') && method === 'GET') {
      return inventory(clubId, params);
    }

    if (clean.endsWith('/inventory') && method === 'POST') {
      return {
        data: check(
          await supabase
            .from('inventory_items')
            .insert({
              club_id: clubId,
              name: data.name,
              category: data.category || null,
              unit: data.unit || 'cái',
              kind: data.kind || 'consumable',
              quantity: Number(data.quantity || 0),
              low_stock_threshold: Number(data.low_stock_threshold || 0),
              notes: data.notes || null,
            })
            .select()
            .single()
        ),
      };
    }

    const inventoryItem = clean.match(/\/inventory\/(\d+)$/);
    if (inventoryItem && method === 'PATCH') {
      return {
        data: check(
          await supabase.rpc('update_inventory_item', {
            p_club_id: clubId,
            p_item_id: Number(inventoryItem[1]),
            p_name: data.name,
            p_category: data.category || null,
            p_unit: data.unit,
            p_kind: data.kind,
            p_low_stock_threshold: Number(data.low_stock_threshold || 0),
            p_notes: data.notes || null,
          })
        ),
      };
    }

    if (inventoryItem && method === 'DELETE') {
      check(
        await supabase.rpc('archive_inventory_item', {
          p_club_id: clubId,
          p_item_id: Number(inventoryItem[1]),
        })
      );
      return {};
    }

    const inventoryRestore = clean.match(/\/inventory\/(\d+)\/restore$/);
    if (inventoryRestore && method === 'POST') {
      check(
        await supabase.rpc('restore_inventory_item', {
          p_club_id: clubId,
          p_item_id: Number(inventoryRestore[1]),
        })
      );
      return {};
    }

    const movement = clean.match(/\/inventory\/(\d+)\/movements$/);
    if (movement && method === 'POST') {
      const item = check(
        await supabase
          .from('inventory_items')
          .select('quantity')
          .eq('club_id', clubId)
          .eq('id', Number(movement[1]))
          .single()
      );
      const quantity = Number(data.quantity);
      const change =
        data.type === 'in'
          ? quantity
          : ['out', 'damaged', 'lost'].includes(data.type)
            ? -quantity
            : quantity - Number(item.quantity);
      return {
        data: check(
          await supabase.rpc('record_inventory_movement', {
            p_club_id: clubId,
            p_item_id: Number(movement[1]),
            p_type: data.type,
            p_change: change,
            p_reason: data.reason,
          })
        ),
      };
    }

    if (movement && method === 'GET') {
      return page(
        check(
          await supabase
            .from('inventory_movements')
            .select('*')
            .eq('club_id', clubId)
            .eq('inventory_item_id', Number(movement[1]))
            .order('id', { ascending: false })
        ) || [],
        params,
        50
      );
    }

    const inventoryAssignmentsRoute = clean.match(
      /\/inventory\/(\d+)\/assignments$/
    );
    if (inventoryAssignmentsRoute && method === 'GET') {
      return inventoryAssignments(
        clubId,
        Number(inventoryAssignmentsRoute[1]),
        params
      );
    }

    if (inventoryAssignmentsRoute && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('assign_inventory', {
            p_club_id: clubId,
            p_item_id: Number(inventoryAssignmentsRoute[1]),
            p_player_id: Number(data.player_id),
            p_quantity: Number(data.quantity),
            p_reason: data.reason,
          })
        ),
      };
    }

    const inventoryReturn = clean.match(
      /\/inventory\/(\d+)\/assignments\/(\d+)\/return$/
    );
    if (inventoryReturn && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('return_inventory_assignment', {
            p_club_id: clubId,
            p_item_id: Number(inventoryReturn[1]),
            p_assignment_id: Number(inventoryReturn[2]),
            p_quantity: Number(data.quantity),
            p_reason: data.reason,
          })
        ),
      };
    }

    const inventoryIncident = clean.match(
      /\/inventory\/(\d+)\/assignments\/(\d+)\/incident$/
    );
    if (inventoryIncident && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('report_inventory_assignment_incident', {
            p_club_id: clubId,
            p_item_id: Number(inventoryIncident[1]),
            p_assignment_id: Number(inventoryIncident[2]),
            p_incident_type: data.incident_type,
            p_quantity: Number(data.quantity),
            p_reason: data.reason,
          })
        ),
      };
    }

    if (clean === `/clubs/${clubId}/inventory/members` && method === 'GET') {
      let b = supabase
        .from('player_profiles')
        .select('id,full_name,date_of_birth,email')
        .eq('club_id', clubId)
        .order('full_name');
      if (params.get('search')) {
        b = b.ilike('full_name', `%${params.get('search')}%`);
      }
      return page(check(await b) || [], params, 50);
    }

    return null;
  }

  return {
    inventory,
    handleInventoryRequest,
  };
}
