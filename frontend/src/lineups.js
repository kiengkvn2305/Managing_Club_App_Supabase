import { dialog, field, select, showErrors, toast, empty } from "./components/ui.js";
import { escapeHtml as e, compareVietnameseNames, formatDate, matchesSearch, initials } from "./utils.js";

export function openCaptain({ team, players, api, base, reload }) {
  if (!team) return;
  const candidates = (players || []).filter((p) =>
    (p.teams || []).some((t) => String(t.id) === String(team.id))
  );

  if (!candidates.length) {
    const emptyModal = dialog(
      `Chọn đội trưởng · ${e(team.name)}`,
      `Sân ${e(team.format)} người`,
      `<div class="lineup-editor">${empty(
        "Đội bóng chưa có cầu thủ",
        "Hãy chọn thành viên vào đội bóng trước, sau đó mới có thể trao băng Đội trưởng."
      )}</div>`,
      async () => true,
      "Đóng"
    );
    return emptyModal;
  }

  let selected = String(team.captain_id || "");

  const getJersey = (p) =>
    p.teams?.find((t) => String(t.id) === String(team.id))?.jersey_number ?? null;
  const getPos = (p) =>
    p.teams?.find((t) => String(t.id) === String(team.id))?.position || p.position || "";
  const footText = (f) =>
    ({ right: "Chân phải", left: "Chân trái", both: "Hai chân" })[f] || "";

  // Pre-selected captain at top on open
  const selectedCandidates = candidates.filter((p) => String(p.id) === selected);
  const unselectedCandidates = candidates.filter((p) => String(p.id) !== selected);
  selectedCandidates.sort((a, b) => compareVietnameseNames(a.full_name, b.full_name));
  unselectedCandidates.sort((a, b) => compareVietnameseNames(a.full_name, b.full_name));
  const ordered = [...selectedCandidates, ...unselectedCandidates];

  const currentCaptainObj = candidates.find((p) => String(p.id) === selected);

  const renderCaptainRow = (p) => {
    const isChecked = String(p.id) === selected;
    const jersey = getJersey(p);
    const pos = getPos(p);
    const foot = footText(p.preferred_foot);
    const dob = p.date_of_birth ? formatDate(p.date_of_birth) : "";
    const metaParts = [
      pos ? `Vị trí: ${pos}` : "",
      foot,
      dob ? `NS: ${dob}` : "",
      p.notes ? `Ghi chú: ${p.notes}` : "",
      p.email || "",
    ].filter(Boolean);

    const searchBlob = [
      p.full_name,
      jersey != null ? `#${jersey} ${jersey}` : "",
      pos,
      foot,
      p.preferred_foot,
      p.date_of_birth,
      dob,
      p.notes,
      p.email,
      p.phone,
    ]
      .filter(Boolean)
      .join(" ");

    return `
      <label
        data-captain-row
        data-id="${e(p.id)}"
        data-full-name="${e(p.full_name)}"
        data-dob="${e(p.date_of_birth || "")}"
        data-notes="${e(p.notes || "")}"
        data-foot="${e(p.preferred_foot || "")}"
        data-pos="${e(pos)}"
        data-jersey="${e(jersey ?? 9999)}"
        data-search="${e(searchBlob)}"
        class="captain-row ${isChecked ? "is-captain" : ""}"
      >
        <input type="radio" name="captain_pick" value="${e(p.id)}" ${isChecked ? "checked" : ""}>
        <span class="avatar picker-avatar">${e(initials(p.full_name))}</span>
        <span class="captain-row-body">
          <span class="captain-row-head">
            <strong>${e(p.full_name)}</strong>
            ${jersey != null ? `<span class="jersey-pill">#${e(jersey)}</span>` : ""}
            ${pos ? `<span class="pos-pill">${e(pos)}</span>` : ""}
            <span class="captain-armband" data-captain-badge ${isChecked ? "" : "hidden"}>C · ĐỘI TRƯỞNG</span>
          </span>
          <small>${e(metaParts.join(" · ") || "Thành viên trong đội")}</small>
        </span>
      </label>
    `;
  };

  const fieldsHtml = `
    <div class="member-picker captain-picker">
      <input type="hidden" name="captain_id" value="${e(selected)}">
      <div class="captain-status-banner">
        <div>
          <span class="eyebrow">BĂNG ĐỘI TRƯỞNG</span>
          <strong data-captain-current-label>${
            currentCaptainObj
              ? `${e(currentCaptainObj.full_name)}${getJersey(currentCaptainObj) != null ? ` (#${e(getJersey(currentCaptainObj))})` : ""}`
              : "Chưa chọn đội trưởng"
          }</strong>
        </div>
        <button type="button" class="chip-button secondary" data-captain-clear ${selected ? "" : "hidden"}>Bỏ chọn đội trưởng</button>
      </div>

      <div class="filters picker-toolbar">
        <label style="margin:0;">
          <input type="search" name="captain_search" data-captain-search placeholder="Tìm theo họ tên, #số áo, vị trí, ngày sinh, ghi chú…" aria-label="Tìm kiếm cầu thủ làm đội trưởng">
        </label>
        <label style="margin:0;">
          <select data-captain-sort aria-label="Sắp xếp danh sách cầu thủ">
            <option value="asc">Tên A–Z</option>
            <option value="desc">Tên Z–A</option>
            <option value="jersey">Theo số áo</option>
            <option value="position">Theo vị trí</option>
            <option value="dob">Theo ngày sinh</option>
            <option value="notes">Theo ghi chú</option>
            <option value="foot">Theo chân thuận</option>
          </select>
        </label>
      </div>

      <div class="picker-meta-line">
        <span data-captain-count>Hiển thị <strong>${ordered.length}</strong> / ${ordered.length} cầu thủ trong đội</span>
        <small>Click trực tiếp vào cầu thủ để trao băng Đội trưởng</small>
      </div>

      <div class="member-picker-list captain-picker-list" data-captain-list>
        ${ordered.map(renderCaptainRow).join("")}
      </div>
      <p data-captain-empty hidden class="picker-empty">Không tìm thấy cầu thủ nào khớp với từ khóa tìm kiếm.</p>
    </div>
  `;

  const modal = dialog(
    `Chọn đội trưởng · ${e(team.name)}`,
    `Sân ${e(team.format)} người · Tìm kiếm và chọn trực tiếp một cầu thủ trong đội để trao băng Đội trưởng.`,
    fieldsHtml,
    async (form) => {
      try {
        const rawVal = form.elements.captain_id.value;
        await api.patch(base(`/teams/${team.id}/captain`), {
          captain_id: rawVal ? Number(rawVal) : null,
        });
        await reload();
        toast(rawVal ? "Đã cập nhật đội trưởng." : "Đã bỏ chọn đội trưởng.");
        return true;
      } catch (error) {
        showErrors(form, error.errors, error.message);
        return false;
      }
    },
    "Lưu đội trưởng"
  );

  modal.classList.add("member-picker-dialog");

  const hiddenInput = modal.querySelector('[name="captain_id"]');
  const searchInput = modal.querySelector("[data-captain-search]");
  const sortSelect = modal.querySelector("[data-captain-sort]");
  const listEl = modal.querySelector("[data-captain-list]");
  const emptyEl = modal.querySelector("[data-captain-empty]");
  const countEl = modal.querySelector("[data-captain-count]");
  const currentLabelEl = modal.querySelector("[data-captain-current-label]");
  const clearBtn = modal.querySelector("[data-captain-clear]");

  const syncSelectedUi = () => {
    hiddenInput.value = selected;
    const chosen = candidates.find((p) => String(p.id) === selected);
    if (currentLabelEl) {
      const j = chosen ? getJersey(chosen) : null;
      currentLabelEl.textContent = chosen
        ? `${chosen.full_name}${j != null ? ` (#${j})` : ""}`
        : "Chưa chọn đội trưởng";
    }
    if (clearBtn) clearBtn.hidden = !selected;

    listEl.querySelectorAll("[data-captain-row]").forEach((row) => {
      const active = row.dataset.id === selected;
      row.classList.toggle("is-captain", active);
      const radio = row.querySelector('input[name="captain_pick"]');
      if (radio) radio.checked = active;
      const badge = row.querySelector("[data-captain-badge]");
      if (badge) badge.hidden = !active;
    });
  };

  listEl.addEventListener("change", (event) => {
    const radio = event.target.closest('input[name="captain_pick"]');
    if (!radio) return;
    selected = radio.checked ? String(radio.value) : "";
    syncSelectedUi();
  });

  clearBtn?.addEventListener("click", () => {
    selected = "";
    syncSelectedUi();
  });

  const applyFilterAndSort = (shouldSort = false) => {
    const query = (searchInput.value || "").trim();
    const sortVal = sortSelect.value;
    const rows = [...listEl.querySelectorAll("[data-captain-row]")];

    let visibleCount = 0;
    rows.forEach((row) => {
      const match = !query || matchesSearch(row.dataset.search, query);
      row.hidden = !match;
      if (match) visibleCount++;
    });

    if (emptyEl) emptyEl.hidden = visibleCount > 0;
    if (countEl) {
      countEl.innerHTML = `Hiển thị <strong>${visibleCount}</strong> / ${ordered.length} cầu thủ trong đội`;
    }

    if (shouldSort) {
      rows.sort((a, b) => {
        if (sortVal === "asc") return compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === "desc") return -1 * compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === "jersey") return Number(a.dataset.jersey) - Number(b.dataset.jersey) || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === "position") return (a.dataset.pos || "ZZZ").localeCompare(b.dataset.pos || "ZZZ") || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === "dob") return (a.dataset.dob || "9999").localeCompare(b.dataset.dob || "9999") || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === "notes") return (b.dataset.notes ? 1 : 0) - (a.dataset.notes ? 1 : 0) || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        if (sortVal === "foot") return (a.dataset.foot || "z").localeCompare(b.dataset.foot || "z") || compareVietnameseNames(a.dataset.fullName, b.dataset.fullName);
        return 0;
      });
      rows.forEach((r) => listEl.append(r));
    }
  };

  searchInput.addEventListener("input", () => applyFilterAndSort(false));
  sortSelect.addEventListener("change", () => applyFilterAndSort(true));

  return modal;
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
  let activeTouchPlayerId = null;
  editor.addEventListener("pointerdown", (event) => {
    if (event.target.closest("[data-move]")) return;
    const marker = event.target.closest("[data-player]");
    if (!marker) return;
    activeTouchPlayerId = marker.dataset.player;
    marker.setPointerCapture?.(event.pointerId);
  });
  editor.addEventListener("pointermove", (event) => {
    if (!activeTouchPlayerId) return;
    const pitch = editor.querySelector("[data-pitch]");
    const entry = saved.get(activeTouchPlayerId);
    if (!pitch || !entry) return;
    event.preventDefault();
    const rect = pitch.getBoundingClientRect();
    entry.x = Math.max(0, Math.min(100, Math.round(((event.clientX - rect.left) / rect.width) * 100)));
    entry.y = Math.max(0, Math.min(100, Math.round(((event.clientY - rect.top) / rect.height) * 100)));
    const markerEl = pitch.querySelector(`[data-player="${CSS.escape(activeTouchPlayerId)}"]`);
    if (markerEl) {
      markerEl.style.left = `${entry.x}%`;
      markerEl.style.top = `${entry.y}%`;
    }
  });
  const finishPointerDrag = () => {
    if (!activeTouchPlayerId) return;
    activeTouchPlayerId = null;
    drawPitch();
  };
  editor.addEventListener("pointerup", finishPointerDrag);
  editor.addEventListener("pointercancel", finishPointerDrag);

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
