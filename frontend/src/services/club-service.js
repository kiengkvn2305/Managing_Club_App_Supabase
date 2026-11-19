import { check, dashboardMetrics, page, ROLE } from './service-helpers.js';

export function createClubService({ supabase, authService }) {
  const financeRoles = [
    'owner',
    'co_owner',
    'general_manager',
    'treasurer',
    'sporting_manager',
    'equipment_manager',
    'hr_manager',
  ];
  const financeManageRoles = ['owner', 'co_owner', 'general_manager', 'treasurer'];

  const isFinanceTitle = (t) => {
    if (!t) return false;
    const lower = t.toLowerCase().trim();
    return (
      lower.includes('thủ quỹ') ||
      lower.includes('tài chính') ||
      lower.includes('chủ nhiệm') ||
      lower.includes('kế toán') ||
      lower.includes('quản lý') ||
      lower.includes('ban chủ nhiệm') ||
      lower.includes('bcn') ||
      lower.includes('cán sự') ||
      lower.includes('uỷ viên') ||
      lower.includes('ủy viên')
    );
  };

  async function resource(row, userId) {
    const club = row.club || row;
    const membership = row.role
      ? row
      : check(
          await supabase
            .from('club_members')
            .select('role,title')
            .eq('club_id', club.id)
            .eq('user_id', userId)
            .eq('status', 'active')
            .maybeSingle()
        ) || {};

    const role = membership.role || 'member';
    const title = (membership.title || '').trim();
    const perms = ROLE[role] || ROLE.member;

    let isBoardMember = false;
    let boardTitle = '';
    const boardMemberResult = await supabase
      .from('club_board_members')
      .select('title, player:player_profiles!inner(user_id)')
      .eq('club_id', club.id)
      .eq('player.user_id', userId)
      .is('archived_at', null)
      .maybeSingle();

    if (boardMemberResult?.data) {
      isBoardMember = true;
      boardTitle = (boardMemberResult.data.title || '').trim();
    }

    const canViewFinance =
      financeRoles.includes(role) ||
      isFinanceTitle(title) ||
      isBoardMember ||
      ['hlv', 'huấn luyện viên'].includes(title.toLowerCase());

    const canManageFinance =
      financeManageRoles.includes(role) ||
      isFinanceTitle(title) ||
      isBoardMember;

    return {
      ...club,
      formats: club.formats || [club.format],
      membership_role: role,
      can_view_finance: canViewFinance,
      can_manage_finance: canManageFinance,
      can_manage_activities:
        perms.roster ||
        isBoardMember ||
        isFinanceTitle(title),
      can_view_inventory: [
        'owner',
        'co_owner',
        'general_manager',
        'equipment_manager',
      ].includes(role),
      can_manage_inventory: [
        'owner',
        'co_owner',
        'general_manager',
        'equipment_manager',
      ].includes(role),
      avatar_version: club.avatar_path || null,
      background_version: club.background_path || null,
    };
  }

  async function clubs() {
    const current = await authService.user();
    const rows =
      check(
        await supabase
          .from('club_members')
          .select('role,title,club:clubs(*)')
          .eq('user_id', current.id)
          .eq('status', 'active')
      ) || [];

    const activeRows = rows.filter((x) => x.club && !x.club.deleted_at);
    const mapped = await Promise.all(
      activeRows.map((x) => resource(x, current.id))
    );
    return { data: mapped };
  }

  async function dashboard(clubId) {
    const [playersResult, teamsResult, membershipsResult] = await Promise.all([
      supabase.from('player_profiles').select('status').eq('club_id', clubId),
      supabase.from('teams').select('id', { count: 'exact', head: true }).eq('club_id', clubId),
      supabase
        .from('club_members')
        .select('role,status')
        .eq('club_id', clubId)
        .eq('status', 'active'),
    ]);

    const players = check(playersResult) || [];
    const memberships = check(membershipsResult) || [];
    check(teamsResult);

    return {
      data: dashboardMetrics({
        players,
        managerMemberships: memberships,
        teamsCount: teamsResult.count || 0,
      }),
    };
  }

  async function handleClubRequest(clean, method, data, params, clubId) {
    if (clean === '/clubs' && method === 'GET') {
      return clubs();
    }

    if (clean === '/clubs' && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('create_club', {
            p_name: data.name,
            p_description: data.description || null,
            p_city: data.city || null,
            p_home_ground: data.home_ground || null,
            p_formats: data.formats || ['7'],
          })
        ),
      };
    }

    if (clean === '/invitations/accept' && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('accept_club_invitation', {
            p_token: data.token,
          })
        ),
      };
    }

    if (clean === '/discover/clubs') {
      let b = supabase
        .from('clubs')
        .select('*')
        .eq('status', 'active')
        .eq('is_discoverable', true)
        .order('name');
      if (params.get('q')) {
        b = b.or(`name.ilike.%${params.get('q')}%,city.ilike.%${params.get('q')}%`);
      }
      const rows = check(await b) || [];
      return page(
        rows.map((row) => ({
          ...row,
          avatar_version: row.avatar_path || null,
        })),
        params,
        12
      );
    }

    if (!clubId) return null;

    if (clean.endsWith('/dashboard') && method === 'GET') {
      return dashboard(clubId);
    }

    const clubImage = clean.match(/\/clubs\/(\d+)\/images\/(avatar|background)$/);
    if (clubImage && (method === 'POST' || method === 'DELETE')) {
      const column = `${clubImage[2]}_path`;
      const old = check(
        await supabase.from('clubs').select(column).eq('id', clubId).single()
      )?.[column];

      if (method === 'DELETE') {
        check(
          await supabase.from('clubs').update({ [column]: null }).eq('id', clubId)
        );
        await authService.deletePrivateImage(old);
        return { data: { version: null } };
      }

      const file = data.image;
      const path = `clubs/${clubId}/${clubImage[2]}-${crypto.randomUUID()}.${file.type.split('/')[1] || 'bin'}`;
      await authService.uploadPrivateImage(path, file);
      check(
        await supabase.from('clubs').update({ [column]: path }).eq('id', clubId)
      );
      if (old) await authService.deletePrivateImage(old);
      return { data: { version: path } };
    }

    if (clean === `/clubs/${clubId}` && method === 'PATCH') {
      const payload = { ...data };
      if (payload.formats) payload.format = payload.formats[0];
      return {
        data: check(
          await supabase
            .from('clubs')
            .update(payload)
            .eq('id', clubId)
            .select()
            .single()
        ),
      };
    }

    if (clean === `/clubs/${clubId}` && method === 'DELETE') {
      check(
        await supabase
          .from('clubs')
          .update({ deleted_at: new Date().toISOString(), status: 'archived' })
          .eq('id', clubId)
      );
      return {};
    }

    if (clean === `/clubs/${clubId}/invitations` && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('create_club_invitation', {
            p_club_id: clubId,
            p_email: data.email,
            p_role: data.role,
          })
        ),
      };
    }

    if (clean === `/clubs/${clubId}/friendlies` && method === 'GET') {
      const rows =
        check(
          await supabase
            .from('friendly_invitations')
            .select(
              '*,source:clubs!friendly_invitations_source_club_id_fkey(name),target:clubs!friendly_invitations_target_club_id_fkey(name)'
            )
            .or(`source_club_id.eq.${clubId},target_club_id.eq.${clubId}`)
            .order('created_at', { ascending: false })
        ) || [];
      return {
        data: rows.map((row) => ({
          ...row,
          source_name: row.source?.name,
          target_name: row.target?.name,
        })),
      };
    }

    if (clean === `/clubs/${clubId}/friendlies` && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('create_friendly_invitation', {
            p_source_club_id: clubId,
            p_target_club_id: Number(data.target_club_id),
            p_match_date: data.match_date,
            p_match_time: data.match_time || null,
            p_location: data.location || null,
            p_message: data.message || null,
          })
        ),
      };
    }

    const friendly = clean.match(/\/friendlies\/(\d+)$/);
    if (friendly && method === 'PATCH') {
      check(
        await supabase.rpc('respond_friendly_invitation', {
          p_club_id: clubId,
          p_invitation_id: Number(friendly[1]),
          p_status: data.status,
        })
      );
      return {};
    }

    if (clean.endsWith('/public-settings') && method === 'GET') {
      const row = check(
        await supabase
          .from('club_public_settings')
          .select('*')
          .eq('club_id', clubId)
          .maybeSingle()
      );
      return {
        data: row || {
          club_id: clubId,
          public_slug: null,
          is_published: false,
          headline: null,
          content: {},
        },
      };
    }

    if (
      clean.endsWith('/public-settings') &&
      (method === 'POST' || method === 'PATCH')
    ) {
      const current = await authService.user(false);
      const row = check(
        await supabase
          .from('club_public_settings')
          .upsert(
            {
              club_id: clubId,
              public_slug: data.public_slug || null,
              is_published: Boolean(data.is_published),
              headline: data.headline || null,
              content: data.content || {},
              updated_by: current?.id || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'club_id' }
          )
          .select()
          .single()
      );
      return { data: row };
    }

    return null;
  }

  return {
    resource,
    clubs,
    dashboard,
    handleClubRequest,
  };
}
