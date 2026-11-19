import { dialog, field, select, showErrors, toast } from "./components/ui.js";
import { escapeHtml as e, compareVietnameseNames } from "./utils.js";

export function openCaptain({ team, players, api, base, reload }) {
  if (!team) return;
  const candidates = players.filter((p) => (p.teams || []).some((t) => String(t.id) === String(team.id)));
  let selected = String(team.captain_id || '');

  // Pre-selected captain at top on open
  const selectedCandidates = candidates.filter((p) => String(p.id) === selected);
  const unselectedCandidates = candidates.filter((p) => String(p.id) !== selected);
  selectedCandidates.sort((a, b) => compareVietnameseNames(a.full_name, b.full_name));
  unselectedCandidates.sort((a, b) => compareVietnameseNames(a.full_name, b.full_name));
  const ordered = [...selectedCandidates, ...unselectedCandidates];

  const sortHtml = `<label>Sắp xếp <select data-captain-sort>
    <option value="asc">Tên A–Z</option>
    <option value="desc">Tên Z–A</option>
    <option value="notes">Theo ghi chú</option>
    <option value="foot">Theo chân thuận</option>
    <option value="jersey">Theo số áo</option>
    <option value="position">Theo vị trí</option>
  </select></label>`;

  const modal = dialog("Chọn đội trưởng", `Đội ${e(team.name)}`, field('captain_search', 'Tìm tên hoặc ghi chú', '', 'search') + sortHtml + select("captain_id", "Đội trưởng", [["", "Chưa chọn"]], ""), async (form) => {
    try {
      await api.patch(base(`/teams/${team.id}/captain`), { captain_id: form.elements.captain_id.value ? Number(form.elements.captain_id.value) : null });
      await reload();
      toast("Đã cập nhật đội trưởng.");
      return true;
    } catch (error) { showErrors(form, error.errors, error.message); return false; }
  });

  const search = modal.querySelector('[name="captain_search"]'), picker = modal.querySelector('[name="captain_id"]'), sort = modal.querySelector('[data-captain-sort]');
  picker.addEventListener('change', () => { selected = picker.value; });

  const getJersey = (p) => p.teams?.find((t) => String(t.id) === String(team.id))?.jersey_number ?? 9999;
  const getPos = (p) => p.teams?.find((t) => String(t.id) === String(team.id))?.position || p.position || '';

  const refresh = (shouldSort = false) => {
    const query = search.value.trim().toLocaleLowerCase('vi');
    const sortVal = sort.value;
    let filtered = ordered.filter((p) => String(p.id) === selected || [p.full_name, p.notes, p.preferred_foot, p.email].some((v) => String(v || '').toLocaleLowerCase('vi').includes(query)));
    if (shouldSort) {
      filtered.sort((a, b) => {
        if (sortVal === 'asc') return compareVietnameseNames(a.full_name, b.full_name);
        if (sortVal === 'desc') return -1 * compareVietnameseNames(a.full_name, b.full_name);
        if (sortVal === 'notes') return (b.notes ? 1 : 0) - (a.notes ? 1 : 0) || compareVietnameseNames(a.full_name, b.full_name);
        if (sortVal === 'foot') return (a.preferred_foot || '').localeCompare(b.preferred_foot || '') || compareVietnameseNames(a.full_name, b.full_name);
        if (sortVal === 'jersey') return Number(getJersey(a)) - Number(getJersey(b));
        if (sortVal === 'position') return getPos(a).localeCompare(getPos(b)) || compareVietnameseNames(a.full_name, b.full_name);
        return 0;
      });
    }
    picker.innerHTML = '<option value="">Chưa chọn</option>' + filtered.map((p) => `<option value="${e(p.id)}">${e(p.full_name)}${p.teams.find((t) => String(t.id) === String(team.id))?.jersey_number == null ? '' : ` #${e(p.teams.find((t) => String(t.id) === String(team.id)).jersey_number)}`}${p.preferred_foot ? ` (${p.preferred_foot === 'right' ? 'Chân phải' : p.preferred_foot === 'left' ? 'Chân trái' : 'Hai chân'})` : ''}</option>`).join('');
    picker.value = selected;
  };
  search.addEventListener('input', () => refresh(false));
  sort.addEventListener('change', () => refresh(true));
  refresh(false);
}

export function openLineup({ teams, players, lineup, linkedMatch, api, base, reload }) {
  if (!teams.length) { toast("Hãy tạo đội bóng trước.", true); return; }
  const saved = new Map((lineup?.players || []).map((p) => [String(p.player_id), { ...p }]));
  let selectedTeam = String(lineup?.team_id || linkedMatch?.team_id || teams[0].id);
  const linkedId = linkedMatch?.id || lineup?.club_match_id || null;
  const fields = select("team_id", "Đội bóng", teams.map((t) => [t.id, `${t.name} · sân ${t.format}`]), selectedTeam) +
    field("opponent", "Đối thủ", lineup?.opponent || linkedMatch?.opponent || "", "text", true) +
    field("match_date", "Ngày thi đấu", lineup?.match_date || linkedMatch?.match_date || "", "date", true) +
    field("formation", "Sơ đồ chiến thuật", lineup?.formation || "") +
    '<div class="lineup-editor" data-lineup-editor></div>';
  const modal = dialog(lineup ? "Chỉnh sửa đội hình" : "Tạo đội hình trận đấu", "Chọn vai trò, rồi kéo cầu thủ đá chính trên sân. Có thể dùng các nút mũi tên để điều chỉnh.", fields, async (form) => {
    const team = teams.find((t) => String(t.id) === selectedTeam);
    const entries = [...saved.values()];
    if (entries.filter((p) => p.role === "starter").length > Number(team.format)) {
      showErrors(form, {}, `Sân ${team.format} tối đa ${team.format} cầu thủ đá chính.`); return false;
    }
    const payload = { team_id: Number(selectedTeam), club_match_id: linkedId, opponent: form.elements.opponent.value.trim(), match_date: form.elements.match_date.value, formation: form.elements.formation.value.trim() || null, players: entries };
    if (!payload.opponent || !payload.match_date) { showErrors(form, {}, "Vui lòng nhập đối thủ và ngày thi đấu."); return false; }
    try {
      if (lineup) await api.patch(base(`/lineups/${lineup.id}`), payload);
      else await api.post(base("/lineups"), payload);
      await reload(); toast("Đã lưu đội hình."); return true;
    } catch (error) { showErrors(form, error.errors, error.message); return false; }
  });
  if (linkedId) { modal.querySelector('[name="team_id"]').disabled = true; modal.querySelector('[name="opponent"]').readOnly = true; modal.querySelector('[name="match_date"]').readOnly = true; }
  const editor = modal.querySelector("[data-lineup-editor]");
  const roster = () => players.filter((p) => (p.teams || []).some((t) => String(t.id) === selectedTeam));
  const numberForTeam = (p) => (p.teams || []).find((t) => String(t.id) === selectedTeam)?.jersey_number;
  const positionForTeam = (p) => (p.teams || []).find((t) => String(t.id) === selectedTeam)?.position;

  const drawPitch = () => {
    const team = teams.find((t) => String(t.id) === selectedTeam);
    const current = roster();
    const countEl = editor.querySelector("[data-starter-count]");
    if (countEl) {
      countEl.textContent = `Đá chính: ${[...saved.values()].filter((p) => p.role === "starter").length}/${e(team.format)} · Dự bị không giới hạn`;
    }
    const pitch = editor.querySelector("[data-pitch]");
    if (pitch) {
      pitch.innerHTML = current.map((p) => {
        const entry = saved.get(String(p.id));
        if (entry?.role !== "starter") return "";
        return `<div class="lineup-marker" draggable="true" data-player="${p.id}" style="left:${Number(entry.x)}%;top:${Number(entry.y)}%"><span>${e(numberForTeam(p) ?? "●")} ${e(p.full_name)}${String(team.captain_id) === String(p.id) ? " (C)" : ""}</span><div><button type="button" data-move="left" aria-label="Di chuyển ${e(p.full_name)} sang trái">←</button><button type="button" data-move="up" aria-label="Di chuyển ${e(p.full_name)} lên trên">↑</button><button type="button" data-move="down" aria-label="Di chuyển ${e(p.full_name)} xuống dưới">↓</button><button type="button" data-move="right" aria-label="Di chuyển ${e(p.full_name)} sang phải">→</button></div></div>`;
      }).join("");
    }
  };

  const draw = () => {
    const team = teams.find((t) => String(t.id) === selectedTeam);
    const current = roster();
    const missing = [...saved.keys()].filter((id) => !current.some((p) => String(p.id) === id));

    // Partition on initial open: players currently selected in lineup placed at top!
    const selectedPlayers = current.filter((p) => saved.has(String(p.id)));
    const unselectedPlayers = current.filter((p) => !saved.has(String(p.id)));
    selectedPlayers.sort((a, b) => compareVietnameseNames(a.full_name, b.full_name));
    unselectedPlayers.sort((a, b) => compareVietnameseNames(a.full_name, b.full_name));
    const ordered = [...selectedPlayers, ...unselectedPlayers];

    editor.innerHTML = `${missing.length ? `<p class="notice">Có ${missing.length} cầu thủ đã xóa hoặc chuyển đội. Hãy bỏ họ khỏi đội hình trước khi lưu. <button type="button" class="text-button" data-remove-missing>Bỏ cầu thủ không còn trong đội</button></p>` : ""}<p data-starter-count>Đá chính: ${[...saved.values()].filter((p) => p.role === "starter").length}/${e(team.format)} · Dự bị không giới hạn</p><div class="lineup-pitch" data-pitch aria-label="Sân bóng"></div><div class="lineup-roster">${ordered.length ? ordered.map((p) => `<label><span>${e(p.full_name)} ${numberForTeam(p) == null ? "" : `#${e(numberForTeam(p))}`} · ${e(positionForTeam(p) || "Chưa có vị trí")} · ${e(p.status)}${String(team.captain_id) === String(p.id) ? " · Đội trưởng" : ""}</span><select data-role-player="${p.id}" aria-label="Vai trò của ${e(p.full_name)}"><option value="">Không chọn</option><option value="starter" ${saved.get(String(p.id))?.role === "starter" ? "selected" : ""}>Đá chính</option><option value="substitute" ${saved.get(String(p.id))?.role === "substitute" ? "selected" : ""}>Dự bị</option></select></label>`).join("") : "<p>Chưa có cầu thủ trong đội. Hãy thêm thành viên và xếp vào đội trước.</p>"}</div>`;
    drawPitch();
  };

  modal.querySelector('[name="team_id"]').addEventListener("change", (event) => { selectedTeam = event.target.value; saved.clear(); draw(); });
  editor.addEventListener("change", (event) => {
    const id = event.target.dataset.rolePlayer;
    if (!id) return;
    if (!event.target.value) saved.delete(id);
    else saved.set(id, { player_id: Number(id), role: event.target.value, x: saved.get(id)?.x ?? 50, y: saved.get(id)?.y ?? 50 });
    drawPitch();
  });
  editor.addEventListener("click", (event) => {
    if (event.target.closest("[data-remove-missing]")) { for (const id of saved.keys()) if (!roster().some((p) => String(p.id) === id)) saved.delete(id); draw(); return; }
    const button = event.target.closest("[data-move]");
    if (!button) return;
    const entry = saved.get(button.closest("[data-player]").dataset.player);
    const delta = { left: [-5, 0], right: [5, 0], up: [0, -5], down: [0, 5] }[button.dataset.move];
    entry.x = Math.max(0, Math.min(100, Number(entry.x) + delta[0]));
    entry.y = Math.max(0, Math.min(100, Number(entry.y) + delta[1]));
    drawPitch();
  });
  editor.addEventListener("dragstart", (event) => { const marker = event.target.closest("[data-player]"); if (marker) event.dataTransfer.setData("text/plain", marker.dataset.player); });
  editor.addEventListener("dragover", (event) => { if (event.target.closest("[data-pitch]")) event.preventDefault(); });
  editor.addEventListener("drop", (event) => {
    const pitch = event.target.closest("[data-pitch]");
    if (!pitch) return;
    event.preventDefault();
    const entry = saved.get(event.dataTransfer.getData("text/plain"));
    if (!entry) return;
    const rect = pitch.getBoundingClientRect();
    entry.x = Math.max(0, Math.min(100, Math.round((event.clientX - rect.left) / rect.width * 100)));
    entry.y = Math.max(0, Math.min(100, Math.round((event.clientY - rect.top) / rect.height * 100)));
    drawPitch();
  });
  draw();
}
