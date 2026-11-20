import {
  check,
  page,
  numeric,
  hashValue,
  latestTeamDuesRate,
} from './service-helpers.js';
import { compareVietnameseNames } from '../utils.js';

export function createRosterService({ supabase, authService }) {
  const financeRoles = ['owner', 'co_owner', 'general_manager', 'treasurer'];
  const financeTitles = [
    'Chủ nhiệm CLB',
    'Phó chủ nhiệm CLB',
    'Thủ quỹ',
    'HLV',
    'Quản lý tài chính',
  ];

  async function teams(clubId, userId) {
    const [teamResult, managerResult, membershipResult, playerResult] =
      await Promise.all([
        supabase.from('teams').select('*').eq('club_id', clubId).order('name'),
        supabase
          .from('team_managers')
          .select('team_id,membership_id')
          .eq('club_id', clubId),
        supabase
          .from('club_members')
          .select('id,role,title,user_id,profile:profiles(name,email)')
          .eq('club_id', clubId)
          .eq('status', 'active'),
        supabase
          .from('team_players')
          .select('team_id,player_id')
          .eq('club_id', clubId),
      ]);

    const rows = check(teamResult) || [];
    const managers = check(managerResult) || [];
    const membershipRows = check(membershipResult) || [];
    const playerRows = check(playerResult) || [];

    const viewer = membershipRows.find(
      (membership) => membership.user_id === userId
    );
    const canViewFinance =
      viewer &&
      (financeRoles.includes(viewer.role) ||
        financeTitles.includes((viewer.title || '').trim()));

    const duesRates = canViewFinance
      ? check(
          await supabase
            .from('team_dues_rates')
            .select('team_id,effective_month,amount')
            .eq('club_id', clubId)
        ) || []
      : [];

    const captainIds = rows.map((team) => team.captain_id).filter(Boolean);
    const captains = captainIds.length
      ? check(
          await supabase
            .from('player_profiles')
            .select('id,full_name')
            .eq('club_id', clubId)
            .in('id', captainIds)
        ) || []
      : [];

    return {
      data: rows.map((team) => ({
        ...team,
        members_count: playerRows.filter(
          (player) => player.team_id === team.id
        ).length,
        monthly_dues: latestTeamDuesRate(duesRates, team.id),
        captain_name:
          captains.find((player) => player.id === team.captain_id)?.full_name ||
          null,
        managers: managers
          .filter((manager) => manager.team_id === team.id)
          .map((manager) => {
            const membership = membershipRows.find(
              (candidate) => candidate.id === manager.membership_id
            );
            return {
              id: manager.membership_id,
              name: membership?.profile?.name || '',
              email: membership?.profile?.email || '',
              role: membership?.role || 'member',
              title: membership?.title || '',
            };
          }),
      })),
    };
  }

  async function members(clubId, params) {
    let rows =
      check(
        await supabase
          .from('player_profiles')
          .select(
            '*,team_players(team_id,jersey_number,position,team:teams(id,name,format))'
          )
          .eq('club_id', clubId)
          .order('full_name')
      ) || [];

    const q = (params.get('q') || '').toLowerCase();
    const teamId = params.get('team_id');
    const status = params.get('status');

    rows = rows.filter(
      (x) =>
        (!q ||
          [x.full_name, x.email, x.phone, x.notes].some((v) =>
            String(v || '').toLowerCase().includes(q)
          )) &&
        (!status || x.status === status) &&
        (!teamId ||
          (x.team_players || []).some(
            (t) => String(t.team_id) === String(teamId)
          ))
    );

    rows = rows.map((x) => ({
      ...x,
      avatar_version: x.avatar_path || null,
      team:
        (x.team_players || []).find(
          (t) => String(t.team_id) === String(x.team_id)
        )?.team || null,
      teams: (x.team_players || []).map((t) => ({
        ...t.team,
        jersey_number: t.jersey_number,
        position: t.position,
      })),
    }));

    const sortField = params.get('sort') || 'full_name';
    const direction = params.get('direction') === 'desc' ? -1 : 1;

    rows.sort((a, b) => {
      let diff = 0;
      if (sortField === 'full_name') {
        diff = compareVietnameseNames(a.full_name || '', b.full_name || '');
      } else if (sortField === 'date_of_birth') {
        diff = (a.date_of_birth || '').localeCompare(b.date_of_birth || '');
      } else if (sortField === 'notes') {
        diff = (a.notes || '').localeCompare(b.notes || '', 'vi');
      } else if (sortField === 'preferred_foot') {
        diff = (a.preferred_foot || '').localeCompare(b.preferred_foot || '', 'vi');
      } else if (sortField === 'position') {
        const posA = a.teams?.find((t) => String(t.id) === String(teamId))?.position || a.position || '';
        const posB = b.teams?.find((t) => String(t.id) === String(teamId))?.position || b.position || '';
        diff = posA.localeCompare(posB, 'vi');
      } else if (sortField === 'jersey_number') {
        const jA = a.teams?.find((t) => String(t.id) === String(teamId))?.jersey_number ?? 9999;
        const jB = b.teams?.find((t) => String(t.id) === String(teamId))?.jersey_number ?? 9999;
        diff = Number(jA) - Number(jB);
      }
      return diff * direction;
    });

    return page(rows, params, Math.min(100, Number(params.get('per_page') || 15)));
  }

  async function handleRosterRequest(clean, method, data, params, clubId, current) {
    if (!clubId) return null;

    if (clean === `/clubs/${clubId}/team-manager-candidates` && method === 'GET') {
      const [membersResult, playersResult] = await Promise.all([
        supabase
          .from('club_members')
          .select('id,role,title,user_id,profile:profiles(name,email)')
          .eq('club_id', clubId)
          .eq('status', 'active')
          .order('id'),
        supabase
          .from('player_profiles')
          .select('id,user_id,email,full_name,notes,preferred_foot')
          .eq('club_id', clubId),
      ]);
      const members = check(membersResult) || [];
      const players = check(playersResult) || [];
      const playerByUser = new Map();
      const playerByEmail = new Map();
      for (const p of players) {
        if (p.user_id) playerByUser.set(p.user_id, p);
        if (p.email) playerByEmail.set(p.email.toLowerCase(), p);
      }

      return {
        data: members.map((row) => {
          const player =
            playerByUser.get(row.user_id) ||
            (row.profile?.email ? playerByEmail.get(row.profile.email.toLowerCase()) : null);
          const displayName =
            row.profile?.name || player?.full_name || row.profile?.email || `Thành viên #${row.id}`;
          return {
            id: row.id,
            role: row.role,
            title: row.title,
            name: displayName,
            full_name: displayName,
            email: row.profile?.email || player?.email,
            notes: player?.notes || '',
            preferred_foot: player?.preferred_foot || '',
          };
        }),
      };
    }

    if (clean === `/clubs/${clubId}/club-memberships` && method === 'GET') {
      const rows =
        check(
          await supabase
            .from('club_members')
            .select('id,role,title,user_id,permissions,profile:profiles(name,email)')
            .eq('club_id', clubId)
            .eq('status', 'active')
            .order('id')
        ) || [];
      return {
        data: rows.map((row) => ({
          id: row.id,
          role: row.role,
          title: row.title,
          user_id: row.user_id,
          permissions: row.permissions || {},
          name: row.profile?.name || row.profile?.email || `Thành viên #${row.id}`,
          email: row.profile?.email,
        })),
      };
    }

    const memberPermissions = clean.match(/\/club-memberships\/(\d+)\/permissions$/);
    if (memberPermissions && method === 'PATCH') {
      return {
        data: check(
          await supabase.rpc('update_member_custom_permissions', {
            p_club_id: clubId,
            p_member_id: Number(memberPermissions[1]),
            p_permissions: data.permissions || {},
          })
        ),
      };
    }

    if (clean === `/clubs/${clubId}/transfer-ownership` && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('transfer_club_ownership', {
            p_club_id: clubId,
            p_new_owner_user_id: data.new_owner_user_id,
            p_my_new_role: data.my_new_role || 'member',
          })
        ),
      };
    }

    const membership = clean.match(/\/club-memberships\/(\d+)$/);
    if (membership && method === 'PATCH') {
      return {
        data: check(
          await supabase
            .from('club_members')
            .update({ title: data.title || null })
            .eq('club_id', clubId)
            .eq('id', Number(membership[1]))
            .select('id,title,role')
            .single()
        ),
      };
    }

    const playerImage = clean.match(/\/members\/(\d+)\/avatar$/);
    if (playerImage && (method === 'POST' || method === 'DELETE')) {
      const playerId = Number(playerImage[1]);
      const old = check(
        await supabase
          .from('player_profiles')
          .select('avatar_path')
          .eq('club_id', clubId)
          .eq('id', playerId)
          .single()
      )?.avatar_path;

      if (method === 'DELETE') {
        check(
          await supabase
            .from('player_profiles')
            .update({ avatar_path: null })
            .eq('club_id', clubId)
            .eq('id', playerId)
        );
        await authService.deletePrivateImage(old);
        return { data: { version: null } };
      }

      const file = data.image;
      const path = `players/${clubId}/${playerId}/avatar-${crypto.randomUUID()}.${file.type.split('/')[1] || 'bin'}`;
      await authService.uploadPrivateImage(path, file);
      check(
        await supabase
          .from('player_profiles')
          .update({ avatar_path: path })
          .eq('club_id', clubId)
          .eq('id', playerId)
      );
      if (old) await authService.deletePrivateImage(old);
      return { data: { version: path } };
    }

    const team = clean.match(/\/teams\/(\d+)$/);
    if (team && method === 'PATCH') {
      const teamId = Number(team[1]);
      const patch = {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.format !== undefined ? { format: data.format } : {}),
        ...(data.captain_id !== undefined ? { captain_id: numeric(data.captain_id) } : {}),
      };
      const row = Object.keys(patch).length
        ? check(
            await supabase
              .from('teams')
              .update(patch)
              .eq('club_id', clubId)
              .eq('id', teamId)
              .select()
              .single()
          )
        : check(
            await supabase
              .from('teams')
              .select('*')
              .eq('club_id', clubId)
              .eq('id', teamId)
              .single()
          );

      if (data.membership_ids !== undefined) {
        check(
          await supabase.rpc('sync_team_managers', {
            p_club_id: clubId,
            p_team_id: teamId,
            p_membership_ids: (data.membership_ids || []).map(Number),
          })
        );
      }
      if (data.dues_amount !== undefined) {
        check(
          await supabase.from('team_dues_rates').upsert(
            {
              club_id: clubId,
              team_id: teamId,
              effective_month: `${data.dues_month}-01`,
              amount: Number(data.dues_amount),
            },
            { onConflict: 'team_id,effective_month' }
          )
        );
      }
      return { data: row };
    }

    if (team && method === 'DELETE') {
      check(
        await supabase.rpc('delete_team', {
          p_club_id: clubId,
          p_team_id: Number(team[1]),
        })
      );
      return {};
    }

    const captain = clean.match(/\/teams\/(\d+)\/captain$/);
    if (captain && method === 'PATCH') {
      return {
        data: check(
          await supabase
            .from('teams')
            .update({ captain_id: numeric(data.captain_id) })
            .eq('club_id', clubId)
            .eq('id', Number(captain[1]))
            .select()
            .single()
        ),
      };
    }

    const teamPlayers = clean.match(/\/teams\/(\d+)\/players$/);
    if (teamPlayers && method === 'PATCH') {
      return {
        data: check(
          await supabase.rpc('sync_team_players', {
            p_club_id: clubId,
            p_team_id: Number(teamPlayers[1]),
            p_player_ids: (data.player_ids || []).map(Number),
          })
        ),
      };
    }

    const teamPlayerRemove = clean.match(/\/teams\/(\d+)\/players\/(\d+)$/);
    if (teamPlayerRemove && method === 'DELETE') {
      check(
        await supabase.rpc('remove_team_player', {
          p_club_id: clubId,
          p_team_id: Number(teamPlayerRemove[1]),
          p_player_id: Number(teamPlayerRemove[2]),
        })
      );
      return {};
    }

    const teamPlayer = clean.match(
      /\/teams\/(\d+)\/players\/(\d+)\/(jersey|position)$/
    );
    if (teamPlayer && method === 'PATCH') {
      return {
        data: check(
          await supabase.rpc('set_team_player_attribute', {
            p_club_id: clubId,
            p_team_id: Number(teamPlayer[1]),
            p_player_id: Number(teamPlayer[2]),
            p_attribute:
              teamPlayer[3] === 'jersey' ? 'jersey_number' : 'position',
            p_value: String(
              teamPlayer[3] === 'jersey'
                ? data.jersey_number ?? ''
                : data.position ?? ''
            ),
          })
        ),
      };
    }

    if (clean.endsWith('/teams') && method === 'GET') {
      return teams(clubId, current.id);
    }

    if (clean.endsWith('/teams') && method === 'POST') {
      return {
        data: check(
          await supabase
            .from('teams')
            .insert({ club_id: clubId, name: data.name, format: data.format })
            .select()
            .single()
        ),
      };
    }

    if (clean.match(/\/members$/) && method === 'GET') {
      return members(clubId, params);
    }

    if (clean === `/clubs/${clubId}/members` && method === 'POST') {
      return {
        data: check(
          await supabase
            .from('player_profiles')
            .insert({
              club_id: clubId,
              full_name: data.full_name,
              email: data.email || null,
              phone: data.phone || null,
              date_of_birth: data.date_of_birth || null,
              jersey_number: numeric(data.jersey_number),
              position: data.position || null,
              preferred_foot: data.preferred_foot || null,
              status: data.status || 'active',
              notes: data.notes || null,
              team_id: numeric(data.team_id),
            })
            .select()
            .single()
        ),
      };
    }

    if (clean === `/clubs/${clubId}/members/import/preview` && method === 'POST') {
      const rows = data.players || [];
      const preview = [];
      for (const row of rows) {
        let query = supabase
          .from('player_profiles')
          .select(
            'id,full_name,email,phone,date_of_birth,position,preferred_foot,status,notes,team_players(team_id,team:teams(id,name))'
          )
          .eq('club_id', clubId);

        query = row.email
          ? query.eq('email', String(row.email).toLowerCase())
          : row.date_of_birth
            ? query
                .eq('full_name', row.full_name)
                .eq('date_of_birth', row.date_of_birth)
            : query.eq('id', -1);

        const matches = check(await query) || [];
        preview.push({
          matches: await Promise.all(
            matches.map(async (match) => ({
              ...match,
              version: await hashValue(match),
            }))
          ),
        });
      }
      return { data: preview };
    }

    if (clean === `/clubs/${clubId}/members/import/commit` && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('commit_member_import', {
            p_club_id: clubId,
            p_rows: data.players || [],
            p_decisions: data.decisions || [],
          })
        ),
      };
    }

    const member = clean.match(/\/members\/(\d+)$/);
    if (member) {
      const id = Number(member[1]);
      if (method === 'GET') {
        const row = check(
          await supabase
            .from('player_profiles')
            .select('*')
            .eq('club_id', clubId)
            .eq('id', id)
            .single()
        );
        return { data: { ...row, avatar_version: row.avatar_path || null } };
      }
      if (method === 'PATCH') {
        const profileData = {
          ...data,
          jersey_number: numeric(data.jersey_number),
        };
        delete profileData.team_id;
        const updated = check(
          await supabase
            .from('player_profiles')
            .update(profileData)
            .eq('club_id', clubId)
            .eq('id', id)
            .select()
            .single()
        );
        const result =
          data.team_id !== undefined
            ? check(
                await supabase.rpc('set_player_primary_team', {
                  p_club_id: clubId,
                  p_player_id: id,
                  p_team_id:
                    data.team_id === '' || data.team_id == null
                      ? null
                      : Number(data.team_id),
                })
              )
            : updated;
        return { data: { ...result, avatar_version: result.avatar_path || null } };
      }
      if (method === 'DELETE') {
        check(
          await supabase
            .from('player_profiles')
            .delete()
            .eq('club_id', clubId)
            .eq('id', id)
        );
        return {};
      }
    }

    if (clean.endsWith('/my-player') && method === 'GET') {
      const rows =
        check(
          await supabase
            .from('player_profiles')
            .select('*')
            .eq('club_id', clubId)
            .eq('user_id', current.id)
        ) || [];
      return { data: rows[0] || null, eligible: !rows.length };
    }

    if (clean.endsWith('/my-player/claim') && method === 'POST') {
      return {
        data: check(
          await supabase.rpc('claim_player_profile', { p_club_id: clubId })
        ),
      };
    }

    if (clean.endsWith('/my-player/claim') && method === 'DELETE') {
      check(await supabase.rpc('unlink_player_profile', { p_club_id: clubId }));
      return {};
    }

    return null;
  }

  return {
    teams,
    members,
    handleRosterRequest,
  };
}
