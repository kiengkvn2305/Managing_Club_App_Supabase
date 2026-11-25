import { formatDate } from './utils.js';
import { state as s, currentClub } from './state.js';
import { escapeHtml as e, number, compareVietnameseNames, matchesSearch } from './utils.js';
import { empty, button } from './components/ui.js';

export function duesPage() {
  if (!currentClub()?.can_view_finance) {
    return `
      <div class="page-top">
        <div>
          <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
          <h1>Đóng quỹ</h1>
          <p>Thông tin được bảo vệ theo quyền truy cập.</p>
        </div>
      </div>
      <section class="panel">
        ${empty('Quyền truy cập được bảo vệ', 'Bạn không có quyền xem thông tin quỹ.')}
      </section>
    `;
  }

  const labels = {
    paid: 'Đã đóng',
    exempt: 'Miễn đóng',
    debt: 'Chưa đóng',
    unpaid: 'Chưa đóng',
    pending: 'Chưa đến kỳ',
    none: 'Không thu',
  };

  const search = (s.duesSearch || '').trim();
  const rows = s.dues
    .flatMap((person) => person.teams.map((team) => ({ person, team })))
    .filter(({ person, team }) => {
      const matchSearch =
        !search ||
        [person.name, person.notes, person.email, person.date_of_birth, formatDate(person.date_of_birth)].some((x) =>
          matchesSearch(x, search)
        );
      const matchTeam = !s.duesTeam || String(team.team_id) === s.duesTeam;
      const matchStatus =
        !s.duesStatus ||
        (s.duesStatus === 'debt' || s.duesStatus === 'unpaid'
          ? ['debt', 'unpaid'].includes(team.status)
          : team.status === s.duesStatus);
      return matchSearch && matchTeam && matchStatus;
    })
    .sort(
      (a, b) =>
        (s.duesDirection === 'desc' ? -1 : 1) *
          compareVietnameseNames(a.person.name, b.person.name) ||
        a.team.name.localeCompare(b.team.name, 'vi')
    );

  const club = currentClub();
  const maintenanceFee = club?.maintenance_fee ?? 50000;

  return `
    <div class="page-top">
      <div>
        <div class="eyebrow">KHÔNG GIAN CÂU LẠC BỘ</div>
        <h1>Đóng quỹ</h1>
        <p>Theo dõi, ghi đóng và điều chỉnh quỹ từng đội theo tháng. Phí duy trì (thành viên tạm ngưng): ${number(maintenanceFee)} đ/tháng.</p>
      </div>
      ${
        club?.can_manage_finance
          ? `<div class="page-actions">${button('maintenance-fee-settings', 'Cài đặt phí duy trì', 'shield', 'secondary')}</div>`
          : ''
      }
    </div>
    <section class="panel">
      <form class="filters" data-form="dues-filter">
        <label>Tháng
          <input type="month" name="month" required value="${e(s.duesMonth)}">
        </label>
        <label>Tìm thành viên
          <input type="search" name="q" value="${e(s.duesSearch)}" placeholder="Tên hoặc ghi chú">
        </label>
        <label>Sắp xếp
          <select name="direction">
            <option value="asc">Tên A–Z</option>
            <option value="desc" ${s.duesDirection === 'desc' ? 'selected' : ''}>Tên Z–A</option>
          </select>
        </label>
        <label>Đội
          <select name="team_id">
            <option value="">Tất cả đội</option>
            ${s.teams.map((t) => `<option value="${t.id}" ${String(t.id) === s.duesTeam ? 'selected' : ''}>${e(t.name)}</option>`).join('')}
          </select>
        </label>
        <label>Trạng thái
          <select name="status">
            <option value="">Tất cả</option>
            ${Object.entries(labels)
              .filter(([v]) => v !== 'unpaid')
              .map(([v, label]) => `<option value="${v}" ${s.duesStatus === v ? 'selected' : ''}>${label}</option>`)
              .join('')}
          </select>
        </label>
        <button class="button secondary">Xem</button>
      </form>

      ${
        rows.length
          ? `<div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Thành viên</th>
                    <th>Ngày sinh</th>
                    <th>Email</th>
                    <th>Đội</th>
                    <th class="text-right">Quỹ đội</th>
                    <th class="text-center">Trạng thái</th>
                    <th class="text-right">Nợ lũy kế đến nay</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows
                    .map(
                      ({ person, team }) => `
                    <tr>
                      <td>
                        <strong>${e(person.name)}</strong>
                        ${
                          person.status === 'inactive' || team.is_maintenance
                            ? `<span class="badge inactive" style="margin-left:4px;font-size:10px;vertical-align:middle;">Tạm ngưng</span>`
                            : ''
                        }
                      </td>
                      <td class="tabular-nums">${e(formatDate(person.date_of_birth) || '—')}</td>
                      <td>${e(person.email || '—')}</td>
                      <td>
                        ${e(team.name)}
                        ${
                          person.status === 'inactive' || team.is_maintenance
                            ? `<div class="field-help" style="font-size:11px;color:var(--text-muted);">(Phí duy trì)</div>`
                            : ''
                        }
                      </td>
                      <td class="text-right tabular-nums font-bold">${number(team.amount)} đ</td>
                      <td class="text-center">
                        <span class="dues-status ${['debt', 'unpaid'].includes(team.status) ? 'owing' : ['paid', 'exempt'].includes(team.status) ? 'settled' : ''}">
                          ${e(labels[team.status] || team.status)}
                        </span>
                      </td>
                      <td class="text-right tabular-nums">
                        ${
                          team.debt_months
                            ? `<span class="dues-status owing">${number(team.debt_months)} tháng · ${number(team.debt_total)} đ</span>`
                            : '—'
                        }
                      </td>
                      <td>
                        ${
                          currentClub()?.can_manage_finance && team.amount > 0
                            ? `<div class="team-actions"><button class="text-button" data-action="correct-dues" data-id="${person.player_id}" data-team="${team.team_id}">Sửa trạng thái</button><button class="text-button" data-action="record-dues" data-id="${person.player_id}" data-team="${team.team_id}">Ghi đóng / miễn</button></div>`
                            : '—'
                        }
                      </td>
                    </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
          : empty('Không có khoản quỹ phù hợp', 'Thay đổi bộ lọc hoặc thiết lập mức quỹ trong phần đội bóng.')
      }
    </section>
  `;
}
