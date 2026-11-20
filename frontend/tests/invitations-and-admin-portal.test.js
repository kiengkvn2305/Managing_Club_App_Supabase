import test from 'node:test';
import assert from 'node:assert/strict';
import { TITLE_PRESETS } from '../src/utils.js';
import { createClubService } from '../src/services/club-service.js';
import { state } from '../src/state.js';
import { adminPage } from '../src/views/admin-page.js';
import { clubPage } from '../src/views/club-page.js';

test('TITLE_PRESETS defines expected permissions for all club roles', () => {
  assert.equal(TITLE_PRESETS['Phó chủ nhiệm CLB'].can_manage_club, true);
  assert.equal(TITLE_PRESETS['Phó chủ nhiệm CLB'].can_manage_roster, true);
  assert.equal(TITLE_PRESETS['Phó chủ nhiệm CLB'].can_view_finance, true);

  assert.equal(TITLE_PRESETS['Thủ quỹ'].can_view_finance, true);
  assert.equal(TITLE_PRESETS['Thủ quỹ'].can_manage_finance, true);
  assert.equal(TITLE_PRESETS['Thủ quỹ'].can_manage_roster, false);

  assert.equal(TITLE_PRESETS['Thành viên'].can_view_finance, false);
  assert.equal(TITLE_PRESETS['Thành viên'].can_manage_roster, false);
  assert.equal(TITLE_PRESETS['Thành viên'].can_manage_club, false);
});

test('clubService handles invitation creation, listing, and revocation RPCs', async () => {
  let createdPayload = null;
  let listedClubId = null;
  let revokedInvId = null;

  const mockSupabase = {
    rpc: async (fn, args) => {
      if (fn === 'create_club_invitation') {
        createdPayload = args;
        return {
          data: {
            id: 101,
            club_id: args.p_club_id,
            invite_code: 'INV-TEST99',
            token: 'hex-token-12345',
            title: args.p_title,
            permissions: args.p_permissions,
            status: 'pending',
          },
          error: null,
        };
      }
      if (fn === 'list_club_invitations') {
        listedClubId = args.p_club_id;
        return {
          data: [
            {
              id: 101,
              club_id: args.p_club_id,
              invite_code: 'INV-TEST99',
              title: 'Thủ quỹ',
              permissions: { can_view_finance: true, can_manage_finance: true },
              status: 'pending',
              expires_at: '2026-11-27T00:00:00Z',
            },
          ],
          error: null,
        };
      }
      if (fn === 'revoke_club_invitation') {
        revokedInvId = args.p_invitation_id;
        return { data: true, error: null };
      }
      return { data: null, error: null };
    },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        then(resolve) { resolve({ data: [], error: null }); },
      };
    },
  };

  const authService = {
    profile: async () => ({ id: 'usr-1', email: 'owner@test.com', is_system_admin: true }),
  };

  const clubService = createClubService({ supabase: mockSupabase, authService });

  // 1. Create invitation with custom title and permissions
  const createRes = await clubService.handleClubRequest(
    '/clubs/1/invitations',
    'POST',
    {
      email: null, // test public code
      role: 'general_manager',
      title: 'Thủ quỹ',
      permissions: { can_view_finance: true, can_manage_finance: true },
    },
    new URLSearchParams(),
    1
  );

  assert.equal(createRes.data.invite_code, 'INV-TEST99');
  assert.equal(createRes.data.title, 'Thủ quỹ');
  assert.equal(createdPayload.p_club_id, 1);
  assert.equal(createdPayload.p_title, 'Thủ quỹ');

  // 2. List invitations for club
  const listRes = await clubService.handleClubRequest(
    '/clubs/1/invitations',
    'GET',
    {},
    new URLSearchParams(),
    1
  );

  assert.equal(listedClubId, 1);
  assert.equal(listRes.data.length, 1);
  assert.equal(listRes.data[0].invite_code, 'INV-TEST99');

  // 3. Revoke invitation
  const revokeRes = await clubService.handleClubRequest(
    '/clubs/1/invitations/101',
    'DELETE',
    {},
    new URLSearchParams(),
    1
  );
  assert.equal(revokedInvId, 101);
  assert.equal(revokeRes.data, true);
});

test('clubService routes system admin management endpoints', async () => {
  let toggledClubStatus = null;
  let grantedAdmin = null;
  let toggledActive = null;

  const mockSupabase = {
    rpc: async (fn, args) => {
      if (fn === 'admin_get_system_stats') {
        return {
          data: {
            total_clubs: 5,
            active_clubs: 4,
            archived_clubs: 1,
            total_users: 25,
            active_users: 24,
            admin_users: 2,
            total_players: 50,
            total_transactions: 120,
            total_income: 15000000,
            total_expense: 8000000,
          },
          error: null,
        };
      }
      if (fn === 'admin_list_all_clubs') {
        return {
          data: [
            { id: 1, name: 'CLB Sao Vàng', status: 'active', member_count: 15 },
            { id: 2, name: 'CLB Phố Núi', status: 'archived', member_count: 10 },
          ],
          error: null,
        };
      }
      if (fn === 'admin_toggle_club_status') {
        toggledClubStatus = args;
        return { data: { id: args.p_club_id, status: args.p_status }, error: null };
      }
      if (fn === 'admin_list_all_users') {
        return {
          data: [
            { id: 'u1', name: 'Admin', email: 'admin@fcms.pro', is_system_admin: true, is_active: true },
            { id: 'u2', name: 'Member', email: 'user@fcms.pro', is_system_admin: false, is_active: true },
          ],
          error: null,
        };
      }
      if (fn === 'admin_set_user_admin') {
        grantedAdmin = args;
        return { data: { id: args.p_user_id, is_system_admin: args.p_is_admin }, error: null };
      }
      if (fn === 'admin_toggle_user_active') {
        toggledActive = args;
        return { data: { id: args.p_user_id, is_active: args.p_is_active }, error: null };
      }
      return { data: null, error: null };
    },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        then(resolve) { resolve({ data: [], error: null }); },
      };
    },
  };

  const authService = {
    profile: async () => ({ id: 'u1', email: 'admin@fcms.pro', is_system_admin: true }),
  };

  const clubService = createClubService({ supabase: mockSupabase, authService });

  // Test admin stats
  const statsRes = await clubService.handleClubRequest('/admin/stats', 'GET', {}, new URLSearchParams(), null);
  assert.equal(statsRes.data.total_clubs, 5);
  assert.equal(statsRes.data.admin_users, 2);

  // Test admin list clubs
  const clubsRes = await clubService.handleClubRequest('/admin/clubs', 'GET', {}, new URLSearchParams(), null);
  assert.equal(clubsRes.data.length, 2);

  // Test admin toggle club status
  await clubService.handleClubRequest('/admin/clubs/2/status', 'PATCH', { status: 'active' }, new URLSearchParams(), null);
  assert.equal(toggledClubStatus.p_club_id, 2);
  assert.equal(toggledClubStatus.p_status, 'active');

  // Test admin list users
  const usersRes = await clubService.handleClubRequest('/admin/users', 'GET', {}, new URLSearchParams(), null);
  assert.equal(usersRes.data.length, 2);

  // Test admin grant admin
  await clubService.handleClubRequest('/admin/users/u2/admin', 'PATCH', { is_admin: true }, new URLSearchParams(), null);
  assert.equal(grantedAdmin.p_user_id, 'u2');
  assert.equal(grantedAdmin.p_is_admin, true);

  // Test admin toggle active
  await clubService.handleClubRequest('/admin/users/u2/active', 'PATCH', { is_active: false }, new URLSearchParams(), null);
  assert.equal(toggledActive.p_user_id, 'u2');
  assert.equal(toggledActive.p_is_active, false);
});

test('adminPage renders system admin dashboard when user is_system_admin is true', () => {
  state.user = { id: 'admin-1', name: 'Quản Trị Viên', email: 'admin@fcms.pro', is_system_admin: true };
  state.adminStats = {
    total_clubs: 8,
    active_clubs: 7,
    archived_clubs: 1,
    total_users: 42,
    active_users: 40,
    admin_users: 2,
    total_players: 95,
    total_transactions: 310,
    total_income: 45000000,
    total_expense: 20000000,
  };
  state.adminClubs = [
    { id: 1, name: 'CLB Sao Vàng', city: 'Hà Nội', status: 'active', member_count: 22 },
  ];
  state.adminUsers = [
    { id: 'admin-1', name: 'Quản Trị Viên', email: 'admin@fcms.pro', is_system_admin: true, is_active: true },
    { id: 'usr-2', name: 'Nguyễn Văn B', email: 'b@test.com', is_system_admin: false, is_active: true },
  ];
  state.adminTab = 'overview';

  const html = adminPage();
  assert.ok(html.includes('Tổng Quản Trị Hệ Thống FCMS PRO'));
  assert.ok(html.includes('42')); // total_users
  assert.ok(html.includes('CLB Sao Vàng'));
  assert.ok(html.includes('Nguyễn Văn B'));
});

test('adminPage blocks regular non-admin users with access denied', () => {
  state.user = { id: 'usr-reg', name: 'Thành Viên', email: 'member@test.com', is_system_admin: false };
  const html = adminPage();
  assert.ok(html.includes('Truy cập bị từ chối'));
  assert.ok(!html.includes('Tổng Quản Trị Hệ Thống FCMS PRO'));
});

test('clubPage renders invitations list table with invite code and test badge', () => {
  state.clubId = 'club-1';
  state.clubs = [
    {
      id: 'club-1',
      name: 'CLB Thể Thao',
      membership_role: 'owner',
      status: 'active',
      activity_start_date: '2025-01-01',
    },
  ];
  state.clubInvitations = [
    {
      id: 50,
      club_id: 'club-1',
      invite_code: 'INV-TEST88',
      email: null,
      title: 'Phó chủ nhiệm CLB',
      permissions: { can_manage_club: true, can_manage_roster: true },
      status: 'pending',
      expires_at: '2026-11-25T00:00:00Z',
    },
  ];

  const html = clubPage();
  assert.ok(html.includes('Mã mời & Lời mời tham gia CLB'));
  assert.ok(html.includes('INV-TEST88'));
  assert.ok(html.includes('Dùng chung (Test)'));
  assert.ok(html.includes('Phó chủ nhiệm CLB'));
  assert.ok(html.includes('Đang chờ'));
});
