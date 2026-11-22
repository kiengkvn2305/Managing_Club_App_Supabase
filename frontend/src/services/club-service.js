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

    // Ưu tiên phân quyền và thông tin thành viên tính toán tập trung từ backend
    if (typeof supabase?.rpc === 'function') {
      try {
        const { data: memberData, error: memberErr } = await supabase.rpc('get_my_club_membership', {
          p_club_id: club.id,
        });
        if (!memberErr && memberData && typeof memberData === 'object' && memberData.role) {
          return {
            ...club,
            membership_role: memberData.role,
            membership_title: memberData.title,
            is_system_admin: Boolean(memberData.is_system_admin),
            can_view_finance: Boolean(memberData.can_view_finance),
            can_manage_finance: Boolean(memberData.can_manage_finance),
            can_manage_roster: Boolean(memberData.can_manage_roster),
            can_manage_club: Boolean(memberData.can_manage_club),
            can_manage_inventory: Boolean(memberData.can_manage_inventory),
            can_view_inventory: Boolean(memberData.can_view_inventory),
            can_manage_activities: Boolean(memberData.can_manage_activities),
            can_view_activities: Boolean(memberData.can_view_activities),
            can_view_club: true,
          };
        }
      } catch {}
    }

    const currentProfile = await authService.profile(false).catch(() => null);
    const isSystemAdmin = currentProfile?.is_system_admin === true;
    const userEmail = currentProfile?.email || '';

    let membership = row.role
      ? row
      : null;

    if (!membership) {
      membership = check(
        await supabase
          .from('club_members')
          .select('role,title,permissions')
          .eq('club_id', club.id)
          .eq('user_id', userId)
          .eq('status', 'active')
          .maybeSingle()
      ) || {};
    }

    const role = isSystemAdmin ? 'owner' : (membership.role || 'member');
    const title = isSystemAdmin ? 'Hệ Thống Admin' : (membership.title || '').trim();
    const customPerms = membership.permissions || {};
    const perms = ROLE[role] || ROLE.member;

    let isBoardMember = false;
    let boardTitle = '';
    const boardMemberResult = await supabase
      .from('club_board_members')
      .select('title, player:player_profiles!inner(user_id, email)')
      .eq('club_id', club.id)
      .is('archived_at', null);

    const matchingBoardMember = (boardMemberResult?.data || []).find(
      (bm) => bm.player?.user_id === userId || (bm.player?.email && userEmail && bm.player.email.toLowerCase() === userEmail.toLowerCase())
    );

    if (matchingBoardMember) {
      isBoardMember = true;
      boardTitle = (matchingBoardMember.title || '').trim();
    }

    const isOwner = role === 'owner' || isSystemAdmin;

    const canViewFinance = isOwner || (customPerms.can_view_finance !== undefined
      ? Boolean(customPerms.can_view_finance)
      : (financeRoles.includes(role) || isFinanceTitle(title) || isBoardMember || ['hlv', 'huấn luyện viên'].includes(title.toLowerCase())));

    const canManageFinance = isOwner || (customPerms.can_manage_finance !== undefined
      ? Boolean(customPerms.can_manage_finance)
      : (financeManageRoles.includes(role) || isFinanceTitle(title) || isBoardMember));

    const canManageRoster = isOwner || (customPerms.can_manage_roster !== undefined
      ? Boolean(customPerms.can_manage_roster)
      : Boolean(perms.roster));

    const canManageClub = isOwner || (customPerms.can_manage_club !== undefined
      ? Boolean(customPerms.can_manage_club)
      : Boolean(perms.club));

    const canManageInventory = isOwner || (customPerms.can_manage_inventory !== undefined
      ? Boolean(customPerms.can_manage_inventory)
      : ['owner', 'co_owner', 'general_manager', 'equipment_manager'].includes(role));

    const canViewInventory = canManageInventory || ['owner', 'co_owner', 'general_manager', 'equipment_manager', 'sporting_manager'].includes(role);

    const canManageActivities = isOwner || (customPerms.can_manage_activities !== undefined
      ? Boolean(customPerms.can_manage_activities)
      : Boolean(perms.roster || isBoardMember || isFinanceTitle(title)));

    return {
      ...club,
      formats: club.formats || [club.format],
      membership_role: role,
      is_system_admin: isSystemAdmin,
      permissions: customPerms,
      can_view_finance: canViewFinance,
      can_manage_finance: canManageFinance,
      can_manage_roster: canManageRoster,
      can_manage_club: canManageClub,
      can_manage_inventory: canManageInventory,
      can_view_inventory: canViewInventory,
      can_manage_activities: canManageActivities,
      avatar_version: club.avatar_path || null,
      background_version: club.background_path || null,
    };
  }

  async function clubs() {
    const currentProfile = await authService.profile(false).catch(() => null);
    if (!currentProfile) return { data: [] };
    let activeRows = [];
    if (currentProfile.is_system_admin) {
      const allClubs = check(await supabase.from('clubs').select('*').is('deleted_at', null).order('id')) || [];
      activeRows = allClubs.map((club) => ({
        club,
        role: 'owner',
        title: 'Hệ Thống Admin',
        permissions: {},
      }));
    } else {
      const rows =
        check(
          await supabase
            .from('club_members')
            .select('role,title,permissions,club:clubs(*)')
            .eq('user_id', currentProfile.id)
            .eq('status', 'active')
        ) || [];
      activeRows = rows.filter((x) => x.club && !x.club.deleted_at);
    }

    const mapped = await Promise.all(
      activeRows.map((x) => resource(x, currentProfile.id))
    );
    return { data: mapped };
  }

  async function dashboard(clubId) {
    if (typeof supabase?.rpc === 'function') {
      try {
        const { data: metrics, error: metricsErr } = await supabase.rpc('get_club_dashboard_metrics', {
          p_club_id: clubId,
        });
        if (!metricsErr && metrics && typeof metrics === 'object') {
          return {
            data: {
              members_count: Number(metrics.players_count || 0),
              active_members_count: Number(metrics.active_players_count || 0),
              teams_count: Number(metrics.teams_count || 0),
              managers_count: Number(metrics.members_count || 0),
              finance_balance: Number(metrics.finance_balance || 0),
              uncollected_dues: Number(metrics.uncollected_dues || 0),
            },
          };
        }
      } catch {}
    }

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

    // System Admin Portal APIs
    if (clean === '/admin/stats' && method === 'GET') {
      return {
        data: check(await supabase.rpc('admin_get_system_stats')),
      };
    }

    if (clean === '/admin/clubs' && method === 'GET') {
      return {
        data: check(await supabase.rpc('admin_list_all_clubs')),
      };
    }

    const adminClubStatusMatch = clean.match(/^\/admin\/clubs\/(\d+)\/status$/);
    if (adminClubStatusMatch && method === 'PATCH') {
      return {
        data: check(
          await supabase.rpc('admin_toggle_club_status', {
            p_club_id: Number(adminClubStatusMatch[1]),
            p_status: data.status,
          })
        ),
      };
    }

    if (clean === '/admin/users' && method === 'GET') {
      return {
        data: check(await supabase.rpc('admin_list_all_users')),
      };
    }

    const adminUserAdminMatch = clean.match(/^\/admin\/users\/([^/]+)\/admin$/);
    if (adminUserAdminMatch && method === 'PATCH') {
      return {
        data: check(
          await supabase.rpc('admin_set_user_admin', {
            p_user_id: adminUserAdminMatch[1],
            p_is_admin: Boolean(data.is_admin),
          })
        ),
      };
    }

    const adminUserActiveMatch = clean.match(/^\/admin\/users\/([^/]+)\/active$/);
    if (adminUserActiveMatch && method === 'PATCH') {
      return {
        data: check(
          await supabase.rpc('admin_toggle_user_active', {
            p_user_id: adminUserActiveMatch[1],
            p_is_active: Boolean(data.is_active),
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
            p_email: data.email || null,
            p_role: data.role || 'member',
            p_title: data.title || 'Thành viên',
            p_permissions: data.permissions || {},
          })
        ),
      };
    }

    if (clean === `/clubs/${clubId}/invitations` && method === 'GET') {
      return {
        data: check(
          await supabase.rpc('list_club_invitations', {
            p_club_id: clubId,
          })
        ),
      };
    }

    const revokeMatch = clean.match(/^\/clubs\/\d+\/invitations\/(\d+)$/);
    if (revokeMatch && method === 'DELETE') {
      return {
        data: check(
          await supabase.rpc('revoke_club_invitation', {
            p_invitation_id: Number(revokeMatch[1]),
          })
        ),
      };
    }

    if (clean === `/clubs/${clubId}/leave` && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('leave_club', {
            p_club_id: clubId,
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
