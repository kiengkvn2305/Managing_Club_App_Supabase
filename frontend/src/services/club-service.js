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
            formats: club.formats || (club.format ? [club.format] : ['7']),
            membership_role: memberData.role,
            membership_title: memberData.title,
            is_co_owner: Boolean(memberData.is_co_owner),
            is_system_admin: Boolean(memberData.is_system_admin),
            permissions: memberData.permissions || club.permissions || {},
            can_view_finance: Boolean(memberData.can_view_finance),
            can_manage_finance: Boolean(memberData.can_manage_finance),
            can_manage_roster: Boolean(memberData.can_manage_roster),
            can_manage_club: Boolean(memberData.can_manage_club),
            can_manage_inventory: Boolean(memberData.can_manage_inventory),
            can_view_inventory: Boolean(memberData.can_view_inventory),
            can_manage_activities: Boolean(memberData.can_manage_activities),
            can_view_activities: Boolean(memberData.can_view_activities),
            can_manage_attendance: Boolean(memberData.can_manage_attendance),
            can_view_attendance: memberData.can_view_attendance !== false,
            can_view_club: true,
            avatar_version: club.avatar_version || club.avatar_path || null,
            background_version: club.background_version || club.background_path || null,
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
    const isCoOwner = role === 'co_owner' || /phó chủ nhiệm/i.test(title);
    const isFullLeader = isOwner || isCoOwner;
    const isTreasurer = role === 'treasurer' || /(thủ quỹ|kế toán)/i.test(title);
    const isCommsOrExternal = /(truyền thông|đối ngoại|media)/i.test(title);

    const canManageFinance = isFullLeader || (customPerms.can_manage_finance !== undefined
      ? Boolean(customPerms.can_manage_finance)
      : (role === 'general_manager' || isTreasurer));

    const canViewFinance = isFullLeader || canManageFinance || (customPerms.can_view_finance !== undefined
      ? Boolean(customPerms.can_view_finance)
      : (role === 'general_manager' || isTreasurer));

    const canManageRoster = isFullLeader || (customPerms.can_manage_roster !== undefined
      ? Boolean(customPerms.can_manage_roster)
      : Boolean(perms.roster));

    const canManageClub = isFullLeader || (customPerms.can_manage_club !== undefined
      ? Boolean(customPerms.can_manage_club)
      : Boolean(perms.club));

    const canManageInventory = isFullLeader || (customPerms.can_manage_inventory !== undefined
      ? Boolean(customPerms.can_manage_inventory)
      : ['owner', 'co_owner', 'general_manager', 'equipment_manager'].includes(role));

    const canViewInventory = isFullLeader || canManageInventory || (customPerms.can_view_inventory !== undefined
      ? Boolean(customPerms.can_view_inventory)
      : ['owner', 'co_owner', 'general_manager', 'equipment_manager', 'sporting_manager'].includes(role));

    const canManageActivities = isFullLeader || (customPerms.can_manage_activities !== undefined
      ? Boolean(customPerms.can_manage_activities)
      : (role === 'general_manager' || isCommsOrExternal));

    const canManageAttendance = isFullLeader || Boolean(customPerms.can_manage_attendance);

    return {
      ...club,
      formats: club.formats || [club.format],
      membership_role: role,
      membership_title: title,
      is_co_owner: isCoOwner,
      is_system_admin: isSystemAdmin,
      permissions: customPerms,
      can_view_finance: canViewFinance,
      can_manage_finance: canManageFinance,
      can_manage_roster: canManageRoster,
      can_manage_club: canManageClub,
      can_manage_inventory: canManageInventory,
      can_view_inventory: canViewInventory,
      can_manage_activities: canManageActivities,
      can_view_activities: canManageActivities,
      can_manage_attendance: canManageAttendance,
      can_view_attendance: true,
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
      try {
        const rpcRes = await supabase.rpc('admin_get_system_stats');
        if (!rpcRes.error && rpcRes.data) {
          return { data: rpcRes.data };
        }
      } catch (err) {
        console.warn('admin_get_system_stats fallback:', err);
      }

      try {
        const [
          { count: totalClubs },
          { count: activeClubs },
          { count: totalUsers },
          { count: adminUsers },
          { count: totalPlayers },
          { count: totalTx },
        ] = await Promise.all([
          supabase.from('clubs').select('*', { count: 'exact', head: true }).is('deleted_at', null),
          supabase.from('clubs').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'active'),
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_system_admin', true),
          supabase.from('player_profiles').select('*', { count: 'exact', head: true }),
          (async () => {
            try {
              return await supabase.from('finance_transactions').select('*', { count: 'exact', head: true });
            } catch {
              return { count: 0 };
            }
          })(),
        ]);

        return {
          data: {
            total_clubs: totalClubs || 0,
            active_clubs: activeClubs || 0,
            archived_clubs: Math.max(0, (totalClubs || 0) - (activeClubs || 0)),
            total_users: totalUsers || 0,
            active_users: totalUsers || 0,
            admin_users: adminUsers || 1,
            total_players: totalPlayers || 0,
            total_transactions: totalTx || 0,
            total_income: 0,
            total_expense: 0,
          },
        };
      } catch {
        return { data: null };
      }
    }

    if (clean === '/admin/clubs' && method === 'GET') {
      let rpcClubs = null;
      try {
        const rpcRes = await supabase.rpc('admin_list_all_clubs');
        if (!rpcRes.error && Array.isArray(rpcRes.data) && rpcRes.data.length > 0) {
          rpcClubs = rpcRes.data;
        }
      } catch (err) {
        console.warn('admin_list_all_clubs fallback:', err);
      }

      if (rpcClubs && rpcClubs.length > 0) {
        return { data: rpcClubs };
      }

      const { data: rawClubs, error: clubErr } = await supabase
        .from('clubs')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (clubErr) {
        console.warn('admin clubs fallback error:', clubErr);
        return { data: rpcClubs || [] };
      }

      const enriched = await Promise.all(
        (rawClubs || []).map(async (c) => {
          let owner_name = null;
          let owner_email = null;
          let member_count = 0;
          let player_count = 0;

          try {
            const { data: ownerMember } = await supabase
              .from('club_members')
              .select('user_id, profiles(name, email)')
              .eq('club_id', c.id)
              .eq('role', 'owner')
              .eq('status', 'active')
              .maybeSingle();

            if (ownerMember?.profiles) {
              owner_name = ownerMember.profiles.name;
              owner_email = ownerMember.profiles.email;
            }
          } catch {}

          try {
            const { count: mCount } = await supabase
              .from('club_members')
              .select('*', { count: 'exact', head: true })
              .eq('club_id', c.id)
              .eq('status', 'active');
            member_count = mCount || 0;
          } catch {}

          try {
            const { count: pCount } = await supabase
              .from('player_profiles')
              .select('*', { count: 'exact', head: true })
              .eq('club_id', c.id);
            player_count = pCount || 0;
          } catch {}

          return {
            id: c.id,
            name: c.name,
            description: c.description || '',
            city: c.city || '',
            home_ground: c.home_ground || '',
            format: c.format || '7',
            formats: c.formats || (c.format ? [c.format] : ['7']),
            status: c.status || 'active',
            activity_start_date: c.activity_start_date || c.created_at?.slice(0, 10),
            created_at: c.created_at,
            avatar_version: c.avatar_path || null,
            background_version: c.background_path || null,
            owner_name,
            owner_email,
            member_count,
            player_count,
          };
        })
      );

      return { data: enriched };
    }

    const adminClubStatusMatch = clean.match(/^\/admin\/clubs\/(\d+)\/status$/);
    if (adminClubStatusMatch && method === 'PATCH') {
      const pClubId = Number(adminClubStatusMatch[1]);
      try {
        const rpcRes = await supabase.rpc('admin_toggle_club_status', {
          p_club_id: pClubId,
          p_status: data.status,
        });
        if (!rpcRes.error && rpcRes.data) return { data: rpcRes.data };
      } catch {}
      const { data: updated, error } = await supabase
        .from('clubs')
        .update({ status: data.status, updated_at: new Date().toISOString() })
        .eq('id', pClubId)
        .select()
        .single();
      if (error) throw error;
      return { data: updated };
    }

    if (clean === '/admin/users' && method === 'GET') {
      let rpcUsers = null;
      try {
        const rpcRes = await supabase.rpc('admin_list_all_users');
        if (!rpcRes.error && Array.isArray(rpcRes.data) && rpcRes.data.length > 0) {
          rpcUsers = rpcRes.data;
        }
      } catch (err) {
        console.warn('admin_list_all_users fallback:', err);
      }

      if (rpcUsers && rpcUsers.length > 0) {
        return { data: rpcUsers };
      }

      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) return { data: [] };

      const usersList = await Promise.all(
        (profiles || []).map(async (p) => {
          let club_count = 0;
          try {
            const { count } = await supabase
              .from('club_members')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', p.id)
              .eq('status', 'active');
            club_count = count || 0;
          } catch {}
          return {
            id: p.id,
            name: p.name || 'Người dùng',
            email: p.email,
            avatar_path: p.avatar_path || null,
            is_system_admin: Boolean(p.is_system_admin),
            is_active: p.is_active !== false,
            created_at: p.created_at,
            updated_at: p.updated_at,
            club_count,
          };
        })
      );

      return { data: usersList };
    }

    const adminUserAdminMatch = clean.match(/^\/admin\/users\/([^/]+)\/admin$/);
    if (adminUserAdminMatch && method === 'PATCH') {
      const pUserId = adminUserAdminMatch[1];
      const pIsAdmin = Boolean(data.is_admin);
      try {
        const rpcRes = await supabase.rpc('admin_set_user_admin', {
          p_user_id: pUserId,
          p_is_admin: pIsAdmin,
        });
        if (!rpcRes.error && rpcRes.data) return { data: rpcRes.data };
      } catch {}
      const { data: updated, error } = await supabase
        .from('profiles')
        .update({ is_system_admin: pIsAdmin, updated_at: new Date().toISOString() })
        .eq('id', pUserId)
        .select()
        .single();
      if (error) throw error;
      return { data: updated };
    }

    const adminUserActiveMatch = clean.match(/^\/admin\/users\/([^/]+)\/active$/);
    if (adminUserActiveMatch && method === 'PATCH') {
      const pUserId = adminUserActiveMatch[1];
      const pIsActive = Boolean(data.is_active);
      try {
        const rpcRes = await supabase.rpc('admin_toggle_user_active', {
          p_user_id: pUserId,
          p_is_active: pIsActive,
        });
        if (!rpcRes.error && rpcRes.data) return { data: rpcRes.data };
      } catch {}
      const { data: updated, error } = await supabase
        .from('profiles')
        .update({ is_active: pIsActive, updated_at: new Date().toISOString() })
        .eq('id', pUserId)
        .select()
        .single();
      if (error) throw error;
      return { data: updated };
    }

    if (!clubId) return null;

    if (clean.endsWith('/dashboard') && method === 'GET') {
      return dashboard(clubId);
    }

    const clubImage = clean.match(/\/clubs\/(\d+)\/images\/(avatar|background)$/);
    if (clubImage && (method === 'POST' || method === 'DELETE')) {
      const kind = clubImage[2];
      const column = `${kind}_path`;
      const old = check(
        await supabase.from('clubs').select(column).eq('id', clubId).single()
      )?.[column];

      if (method === 'DELETE') {
        let rpcOk = false;
        if (typeof supabase?.rpc === 'function') {
          try {
            const { error: rpcErr } = await supabase.rpc('update_club_image', {
              p_club_id: clubId,
              p_kind: kind,
              p_image_path: null,
            });
            if (!rpcErr) rpcOk = true;
          } catch {}
        }
        if (!rpcOk) {
          check(
            await supabase.from('clubs').update({ [column]: null }).eq('id', clubId)
          );
        }
        if (old) await authService.deletePrivateImage(old);
        return { data: { version: null } };
      }

      const file = data.image;
      const path = `clubs/${clubId}/${kind}-${crypto.randomUUID()}.${file.type.split('/')[1] || 'bin'}`;
      await authService.uploadPrivateImage(path, file);
      let rpcOk = false;
      if (typeof supabase?.rpc === 'function') {
        try {
          const { error: rpcErr } = await supabase.rpc('update_club_image', {
            p_club_id: clubId,
            p_kind: kind,
            p_image_path: path,
          });
          if (!rpcErr) rpcOk = true;
        } catch {}
      }
      if (!rpcOk) {
        check(
          await supabase.from('clubs').update({ [column]: path }).eq('id', clubId)
        );
      }
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

    if (clean === `/clubs/${clubId}/notifications` && method === 'GET') {
      if (typeof supabase?.rpc === 'function') {
        try {
          const res = await supabase.rpc('get_my_club_notifications', {
            p_club_id: clubId,
          });
          if (!res.error && res.data) {
            return { data: res.data };
          }
        } catch {}
      }
      return { data: { items: [], unread_count: 0 } };
    }

    if (clean === `/clubs/${clubId}/notifications/read` && method === 'POST') {
      if (typeof supabase?.rpc === 'function') {
        check(
          await supabase.rpc('mark_club_notifications_read', {
            p_club_id: clubId,
            p_keys: Array.isArray(data.keys) ? data.keys : [],
          })
        );
      }
      return { data: { ok: true } };
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
