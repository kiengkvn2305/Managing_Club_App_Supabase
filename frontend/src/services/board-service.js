import { check } from './service-helpers.js';

export function createBoardService({ supabase }) {
  async function handleBoardRequest(clean, method, data, params, clubId) {
    if (!clubId) return null;

    if (clean === `/clubs/${clubId}/board-members` && method === 'GET') {
      // Dọn dẹp triệt để bất kỳ bản ghi lưu trữ mềm cũ (archived_at is not null)
      await supabase
        .from('club_board_members')
        .delete()
        .eq('club_id', clubId)
        .not('archived_at', 'is', null);

      const rows =
        check(
          await supabase
            .from('club_board_members')
            .select(
              'id,player_id,title,archived_at,player:player_profiles(full_name,email,date_of_birth)'
            )
            .eq('club_id', clubId)
            .order('id')
        ) || [];

      // Dọn dẹp bản ghi BCN mồ côi (không còn hồ sơ cầu thủ tương ứng)
      const orphans = rows.filter((r) => !r.player);
      if (orphans.length) {
        await supabase
          .from('club_board_members')
          .delete()
          .eq('club_id', clubId)
          .in(
            'id',
            orphans.map((o) => o.id)
          );
      }

      const validRows = rows.filter((r) => Boolean(r.player) && !r.archived_at);

      const rates =
        check(
          await supabase
            .from('board_dues_rates')
            .select(
              'id,player_id,team_id,amount,effective_month,ends_before,team:teams(name)'
            )
            .eq('club_id', clubId)
            .order('effective_month')
        ) || [];

      const shared =
        check(
          await supabase
            .from('shared_board_dues_rates')
            .select('id,team_id,amount,effective_month,team:teams(name)')
            .eq('club_id', clubId)
            .order('effective_month', { ascending: false })
        ) || [];

      return {
        data: validRows.map((row) => ({
          id: row.id,
          player_id: row.player_id,
          title: row.title,
          full_name: row.player?.full_name,
          email: row.player?.email,
          date_of_birth: row.player?.date_of_birth,
          dues_rates: rates
            .filter((rate) => rate.player_id === row.player_id)
            .map((r) => ({ ...r, team_name: r.team?.name || '' })),
        })),
        shared_rates: shared.map((s) => ({
          id: s.id,
          team_id: s.team_id,
          team_name: s.team?.name || 'Đội',
          amount: Number(s.amount),
          effective_month: s.effective_month,
        })),
      };
    }

    if (clean === `/clubs/${clubId}/board-members` && method === 'POST') {
      if (typeof supabase?.rpc === 'function') {
        try {
          const { data: boardRow, error: boardErr } = await supabase.rpc('save_board_member', {
            p_club_id: clubId,
            p_player_id: Number(data.player_id),
            p_title: String(data.title).trim(),
          });
          if (!boardErr && boardRow) {
            return { data: boardRow };
          }
        } catch {}
      }

      const row = check(
        await supabase
          .from('club_board_members')
          .insert({
            club_id: clubId,
            player_id: Number(data.player_id),
            title: String(data.title).trim(),
          })
          .select()
          .single()
      );
      check(
        await supabase.from('board_membership_periods').insert({
          club_id: clubId,
          player_id: Number(data.player_id),
          starts_month: `${new Date().toISOString().slice(0, 7)}-01`,
        })
      );
      return { data: row };
    }

    const boardMember = clean.match(/\/board-members\/(\d+)$/);
    if (boardMember && method === 'PATCH') {
      return {
        data: check(
          await supabase
            .from('club_board_members')
            .update({ title: String(data.title).trim() })
            .eq('club_id', clubId)
            .eq('id', Number(boardMember[1]))
            .select()
            .single()
        ),
      };
    }

    if (boardMember && method === 'DELETE') {
      const boardMemberId = Number(boardMember[1]);
      const rpcRes = await supabase.rpc('remove_board_member', {
        p_club_id: clubId,
        p_board_member_id: boardMemberId,
      });
      if (rpcRes.error) {
        // Fallback trực tiếp nếu chưa chạy migration RPC
        const row = check(
          await supabase
            .from('club_board_members')
            .select('player_id')
            .eq('club_id', clubId)
            .eq('id', boardMemberId)
            .single()
        );
        if (row) {
          await supabase
            .from('board_tasks')
            .delete()
            .eq('club_id', clubId)
            .eq('board_member_id', boardMemberId);
          await supabase
            .from('board_membership_periods')
            .delete()
            .eq('club_id', clubId)
            .eq('player_id', row.player_id);
          check(
            await supabase
              .from('club_board_members')
              .delete()
              .eq('club_id', clubId)
              .eq('id', boardMemberId)
          );
        }
      } else {
        check(rpcRes);
      }
      return {};
    }

    if (clean === `/clubs/${clubId}/board-tasks` && method === 'GET') {
      const tasks =
        check(
          await supabase
            .from('board_tasks')
            .select(
              'id,board_member_id,title,description,due_date,progress,created_at,board_member:club_board_members(id,title,player:player_profiles(full_name))'
            )
            .eq('club_id', clubId)
            .order('due_date', { ascending: true })
        ) || [];
      return {
        data: tasks.map((t) => ({
          id: t.id,
          board_member_id: t.board_member_id,
          title: t.title,
          description: t.description,
          due_date: t.due_date,
          progress: Number(t.progress || 0),
          assignee_name: t.board_member?.player?.full_name || 'Thành viên BCN',
          assignee_title: t.board_member?.title || '',
        })),
      };
    }

    if (clean === `/clubs/${clubId}/board-tasks` && method === 'POST') {
      return {
        data: check(
          await supabase
            .from('board_tasks')
            .insert({
              club_id: clubId,
              board_member_id: Number(data.board_member_id),
              title: data.title,
              description: data.description || null,
              due_date: data.due_date || null,
              progress: Number(data.progress || 0),
            })
            .select()
            .single()
        ),
      };
    }

    const boardTask = clean.match(/\/board-tasks\/(\d+)$/);
    if (boardTask && method === 'PATCH') {
      return {
        data: check(
          await supabase
            .from('board_tasks')
            .update({ ...data, progress: Number(data.progress || 0) })
            .eq('club_id', clubId)
            .eq('id', Number(boardTask[1]))
            .select()
            .single()
        ),
      };
    }

    if (boardTask && method === 'DELETE') {
      check(
        await supabase
          .from('board_tasks')
          .delete()
          .eq('club_id', clubId)
          .eq('id', Number(boardTask[1]))
      );
      return {};
    }

    return null;
  }

  return {
    handleBoardRequest,
  };
}
