/* U14 Live (offline, PWA, no-node) */
const U14 = (() => {
    const $ = (id) => document.getElementById(id);

    const KEY_LAST_MATCH = "u14_live_last_match_id";
    const KEY_MATCH = (matchId) => `u14_live_match_${matchId}`;

    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
    const pad2 = (n) => String(n).padStart(2, "0");
    const fmtTime = (sec) => {
        sec = Math.max(0, Math.floor(sec));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${pad2(m)}:${pad2(s)}`;
    };

    const deepClone = (o) => JSON.parse(JSON.stringify(o));

    let players = [];
    let timer = null;

    async function loadPlayers() {
        const res = await fetch("data/players.json");
        players = await res.json();
        return players;
    }

    function save(matchId, obj) {
        localStorage.setItem(KEY_MATCH(matchId), JSON.stringify(obj));
        localStorage.setItem(KEY_LAST_MATCH, String(matchId));
    }

    function load(matchId) {
        const raw = localStorage.getItem(KEY_MATCH(matchId));
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
    }

    function reset(matchId) {
        localStorage.removeItem(KEY_MATCH(matchId));
    }

    function getLastMatchId() {
        const v = localStorage.getItem(KEY_LAST_MATCH);
        const n = Number(v || 0);
        return Number.isFinite(n) ? n : 0;
    }

    // -----------------------------
    // SHEET
    // -----------------------------
    function initSheetPage() {
        registerSW();
        loadPlayers().then(() => {
            const matchIdInput = $("matchId");
            const opponentInput = $("opponent");
            const homeScore = $("homeScore");
            const awayScore = $("awayScore");

            const q = $("q");
            const list = $("list");

            const selectedCount = $("selectedCount");
            const xiCount = $("xiCount");

            let selected = new Set();
            let xi = new Set();

            // Prefill last match
            const lastId = getLastMatchId();
            if (lastId) matchIdInput.value = String(lastId);

            function currentMatchId() {
                return Number(matchIdInput.value || 0);
            }

            function hydrateFromStorage() {
                const mid = currentMatchId();
                if (!mid) return;
                const data = load(mid);
                if (!data || !data.sheet) return;

                selected = new Set(data.sheet.selected || []);
                xi = new Set(data.sheet.xi || []);
                opponentInput.value = data.sheet.opponent || "";
                homeScore.value = data.sheet.homeScore ?? "";
                awayScore.value = data.sheet.awayScore ?? "";
            }

            function persistSheet() {
                const mid = currentMatchId();
                if (!mid) return;

                const data = load(mid) || {};
                data.sheet = {
                    matchId: mid,
                    opponent: opponentInput.value || "",
                    homeScore: homeScore.value === "" ? null : Number(homeScore.value),
                    awayScore: awayScore.value === "" ? null : Number(awayScore.value),
                    selected: Array.from(selected),
                    xi: Array.from(xi),
                };

                // If no live exists yet, create placeholder
                if (!data.live) {
                    data.live = null;
                }

                save(mid, data);
            }

            function updateCounts() {
                selectedCount.textContent = String(selected.size);
                xiCount.textContent = String(xi.size);
            }

            function render() {
                const query = (q.value || "").trim().toLowerCase();
                list.innerHTML = "";

                const filtered = players
                    .slice()
                    .sort((a,b) => a.name.localeCompare(b.name))
                    .filter(p => !query || p.name.toLowerCase().includes(query));

                for (const p of filtered) {
                    const isSel = selected.has(p.id);
                    const isXi = xi.has(p.id);

                    const row = document.createElement("div");
                    row.className = "border rounded-xl p-3 flex items-center justify-between gap-2";

                    const left = document.createElement("label");
                    left.className = "flex items-center gap-2 min-w-0";

                    const cb = document.createElement("input");
                    cb.type = "checkbox";
                    cb.className = "h-5 w-5";
                    cb.checked = isSel;
                    cb.addEventListener("change", () => {
                        if (cb.checked) selected.add(p.id);
                        else {
                            selected.delete(p.id);
                            xi.delete(p.id);
                        }
                        if (xi.size > 11) {
                            // trim if needed
                            xi = new Set(Array.from(xi).slice(0, 11));
                        }
                        updateCounts();
                        render();
                        persistSheet();
                    });

                    const name = document.createElement("div");
                    name.className = "font-semibold truncate";
                    name.textContent = p.name;

                    const badge = document.createElement("span");
                    badge.className = "text-[10px] px-2 py-1 rounded bg-gray-100 text-gray-600";
                    badge.textContent = `#${p.id}`;

                    left.appendChild(cb);
                    left.appendChild(name);
                    left.appendChild(badge);

                    const right = document.createElement("div");
                    right.className = "flex items-center gap-2";

                    const btnXi = document.createElement("button");
                    btnXi.className = "text-xs px-2 py-2 rounded border hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap";
                    btnXi.textContent = isXi ? "— XI" : "+ XI";
                    btnXi.disabled = !isSel || (!isXi && xi.size >= 11);
                    btnXi.addEventListener("click", () => {
                        if (!selected.has(p.id)) return;
                        if (xi.has(p.id)) xi.delete(p.id);
                        else if (xi.size < 11) xi.add(p.id);
                        updateCounts();
                        render();
                        persistSheet();
                    });

                    right.appendChild(btnXi);

                    row.appendChild(left);
                    row.appendChild(right);
                    list.appendChild(row);
                }

                updateCounts();
            }

            function validateSheet() {
                const mid = currentMatchId();
                if (!mid) { alert("Match ID obligatoire."); return false; }
                if (selected.size < 11) { alert("Minimum 11 convoqués."); return false; }
                if (xi.size !== 11) { alert("XI doit être exactement 11."); return false; }
                return true;
            }

            // events
            matchIdInput.addEventListener("change", () => {
                selected = new Set();
                xi = new Set();
                hydrateFromStorage();
                render();
            });

            q.addEventListener("input", render);

            $("selectAll").addEventListener("click", () => {
                for (const p of players) selected.add(p.id);
                render(); persistSheet();
            });

            $("autoXi").addEventListener("click", () => {
                // take first 11 selected (alphabetical)
                const selectedPlayers = players
                    .filter(p => selected.has(p.id))
                    .slice()
                    .sort((a,b) => a.name.localeCompare(b.name))
                    .slice(0, 11);
                xi = new Set(selectedPlayers.map(p => p.id));
                render(); persistSheet();
            });

            $("save").addEventListener("click", () => {
                if (!validateSheet()) return;
                persistSheet();
                alert("Feuille sauvée.");
            });

            $("reset").addEventListener("click", () => {
                const mid = currentMatchId();
                if (!mid) return;
                if (!confirm("Reset ce match (feuille + live) ?")) return;
                reset(mid);
                selected = new Set();
                xi = new Set();
                opponentInput.value = "";
                homeScore.value = "";
                awayScore.value = "";
                render();
            });

            $("start").addEventListener("click", () => {
                if (!validateSheet()) return;
                persistSheet();
                location.href = "live.html";
            });

            // initial hydrate
            hydrateFromStorage();
            render();
        });
    }

    // -----------------------------
    // LIVE
    // -----------------------------
    function initLivePage() {
        registerSW();
        loadPlayers().then(() => {
            const lastId = getLastMatchId();
            const mid = lastId || 0;
            if (!mid) { alert("Va sur Feuille et mets un Match ID."); location.href = "index.html"; return; }

            let data = load(mid) || {};
            if (!data.sheet) { alert("Feuille manquante."); location.href = "index.html"; return; }

            const meta = $("meta");
            meta.textContent = `Match #${mid}${data.sheet.opponent ? " • vs " + data.sheet.opponent : ""}`;

            // build live state if absent
            if (!data.live) data.live = buildLiveFromSheet(data.sheet);

            let state = data.live;
            state.matchId = mid;

            let selectedOutId = null;
            let pending = null;
            let lastSnapshot = null;

            const modal = $("modal");
            const modalText = $("modalText");

            function saveState() {
                data.live = state;
                save(mid, data);
            }

            function buildLiveFromSheet(sheet) {
                const selected = sheet.selected || [];
                const xi = sheet.xi || [];
                const playersState = {};
                for (const pid of selected) {
                    const onField = xi.includes(pid);
                    playersState[pid] = {
                        onField,
                        intervals: onField ? [{ half: 1, start: 0, end: null }] : [],
                        goals: 0,   // ready for B
                        rating: 0,  // ready for C
                    };
                }
                return {
                    matchId: sheet.matchId,
                    half: 1,
                    currentTime: 0,    // sec in current half
                    isRunning: false,
                    players: playersState,
                    meta: {
                        opponent: sheet.opponent || "",
                        homeScore: sheet.homeScore ?? null,
                        awayScore: sheet.awayScore ?? null,
                    }
                };
            }

            function stopTimer() {
                if (timer) { clearInterval(timer); timer = null; }
            }

            function startTimer() {
                if (timer) return;
                state.isRunning = true;
                timer = setInterval(() => {
                    state.currentTime = clamp((state.currentTime || 0) + 1, 0, 35 * 60);
                    $("clock").textContent = fmtTime(state.currentTime);
                    $("half").textContent = String(state.half || 1);
                    updateCardTimes();
                    saveState();
                    if (state.currentTime >= 35 * 60) pauseTimer();
                }, 1000);
            }

            function pauseTimer() {
                state.isRunning = false;
                stopTimer();
                saveState();
            }

            function playerLiveSeconds(pid) {
                // total seconds played in current match, across halves, based on intervals
                const ps = state.players[pid];
                if (!ps) return 0;
                let total = 0;
                for (const it of ps.intervals || []) {
                    const end = (it.end === null || it.end === undefined)
                        ? ((it.half === state.half) ? state.currentTime : (35*60))
                        : it.end;
                    total += Math.max(0, end - it.start);
                }
                return total;
            }

            function updateCardTimes() {
                document.querySelectorAll("[data-pid]").forEach(el => {
                    const pid = Number(el.getAttribute("data-pid"));
                    el.textContent = fmtTime(playerLiveSeconds(pid));
                });
            }

            function render() {
                $("half").textContent = String(state.half || 1);
                $("clock").textContent = fmtTime(state.currentTime || 0);

                const field = [];
                const bench = [];
                for (const pidStr of Object.keys(state.players || {})) {
                    const pid = Number(pidStr);
                    const p = players.find(x => x.id === pid);
                    if (!p) continue;
                    if (state.players[pid].onField) field.push(p);
                    else bench.push(p);
                }

                field.sort((a,b) => a.name.localeCompare(b.name));
                bench.sort((a,b) => a.name.localeCompare(b.name));

                const fieldEl = $("field");
                const benchEl = $("bench");
                fieldEl.innerHTML = "";
                benchEl.innerHTML = "";

                $("hint").textContent = selectedOutId ? "Choisis l’entrant sur le banc" : "Sélectionne un sortant";

                for (const p of field) {
                    const btn = document.createElement("button");
                    const sel = selectedOutId === p.id;
                    btn.className = "border rounded-xl p-3 text-left bg-green-50 border-green-200 hover:bg-green-100 active:scale-[0.99] transition " + (sel ? "ring-2 ring-red-300" : "");
                    btn.innerHTML = `
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="font-semibold truncate">${p.name}</div>
                <div class="text-[11px] text-gray-600">#${p.id}</div>
              </div>
              <div class="tabular-nums font-bold text-sm" data-pid="${p.id}">${fmtTime(playerLiveSeconds(p.id))}</div>
            </div>
          `;
                    btn.addEventListener("click", () => {
                        selectedOutId = (selectedOutId === p.id) ? null : p.id;
                        render();
                    });
                    fieldEl.appendChild(btn);
                }

                for (const p of bench) {
                    const btn = document.createElement("button");
                    btn.className = "border rounded-xl p-3 text-left bg-gray-50 hover:bg-gray-100 active:scale-[0.99] transition";
                    btn.innerHTML = `
            <div class="min-w-0">
              <div class="font-semibold truncate">${p.name}</div>
              <div class="text-[11px] text-gray-600">#${p.id}</div>
            </div>
          `;
                    btn.addEventListener("click", () => {
                        if (!selectedOutId) return;
                        pending = { outId: selectedOutId, inId: p.id };
                        const outP = players.find(x => x.id === pending.outId);
                        const inP = players.find(x => x.id === pending.inId);
                        modalText.textContent = `${outP?.name || pending.outId} → ${inP?.name || pending.inId} (à ${fmtTime(state.currentTime)}) ?`;
                        modal.classList.remove("hidden");
                    });
                    benchEl.appendChild(btn);
                }

                updateCardTimes();
            }

            function confirmSub() {
                if (!pending) return;

                const { outId, inId } = pending;
                const t = clamp(state.currentTime || 0, 0, 35*60);

                // snapshot for undo (single-level)
                lastSnapshot = deepClone(state);

                // close outgoing interval (current half)
                const outS = state.players[outId];
                if (!outS || !outS.onField) { pending = null; selectedOutId = null; render(); return; }
                const outIntervals = outS.intervals || [];
                const lastIt = outIntervals[outIntervals.length - 1];
                if (lastIt && lastIt.half === state.half && (lastIt.end === null || lastIt.end === undefined)) {
                    lastIt.end = t;
                }

                // open incoming interval (current half)
                const inS = state.players[inId];
                if (!inS || inS.onField) { pending = null; selectedOutId = null; render(); return; }
                inS.intervals = inS.intervals || [];
                inS.intervals.push({ half: state.half, start: t, end: null });

                // swap states
                outS.onField = false;
                inS.onField = true;

                pending = null;
                selectedOutId = null;
                saveState();
                render();
            }

            function undo() {
                if (!lastSnapshot) return;
                state = deepClone(lastSnapshot);
                lastSnapshot = null;
                pending = null;
                selectedOutId = null;
                data.live = state;
                saveState();
                render();
            }

            function halftime() {
                if (!confirm("Passer à la mi-temps ? (chrono à 0)")) return;

                pauseTimer();

                // close all open intervals for current half at 35:00 (or current time)
                const endT = clamp(state.currentTime || 0, 0, 35*60);
                for (const pidStr of Object.keys(state.players || {})) {
                    const ps = state.players[Number(pidStr)];
                    if (!ps) continue;
                    for (const it of ps.intervals || []) {
                        if (it.half === state.half && (it.end === null || it.end === undefined)) {
                            it.end = endT;
                        }
                    }
                }

                // go next half
                state.half = (state.half === 1) ? 2 : 2;
                state.currentTime = 0;
                selectedOutId = null;
                pending = null;
                lastSnapshot = null;

                saveState();
                render();
            }

            function finish() {
                if (!confirm("Fin de match ? (ferme les temps en cours)")) return;
                pauseTimer();

                const endT = clamp(state.currentTime || 0, 0, 35*60);
                for (const pidStr of Object.keys(state.players || {})) {
                    const ps = state.players[Number(pidStr)];
                    if (!ps) continue;
                    for (const it of ps.intervals || []) {
                        if (it.half === state.half && (it.end === null || it.end === undefined)) {
                            it.end = endT;
                        }
                    }
                }

                saveState();
                location.href = "export.html";
            }

            // buttons
            $("start").addEventListener("click", startTimer);
            $("pause").addEventListener("click", pauseTimer);
            $("halftime").addEventListener("click", halftime);
            $("finish").addEventListener("click", finish);
            $("undo").addEventListener("click", undo);

            $("cancel").addEventListener("click", () => {
                pending = null;
                $("modal").classList.add("hidden");
            });
            $("confirm").addEventListener("click", () => {
                $("modal").classList.add("hidden");
                confirmSub();
            });

            // restore running state? keep it paused on open
            pauseTimer();
            render();
        });
    }

    // -----------------------------
    // EXPORT
    // -----------------------------
    function initExportPage() {
        registerSW();
        loadPlayers().then(() => {
            const lastId = getLastMatchId();
            const mid = lastId || 0;
            if (!mid) { alert("Match manquant."); location.href = "index.html"; return; }

            const data = load(mid);
            if (!data || !data.live) { alert("Live manquant."); location.href = "index.html"; return; }

            const meta = $("meta");
            meta.textContent = `Match #${mid}${data.sheet?.opponent ? " • vs " + data.sheet.opponent : ""}`;

            function computeMinutes(ps) {
                let totalSec = 0;
                for (const it of ps.intervals || []) {
                    const end = (it.end === null || it.end === undefined) ? (35*60) : it.end;
                    totalSec += Math.max(0, end - it.start);
                }
                return Math.round(totalSec / 60);
            }

            function buildExport() {
                const live = data.live;
                const out = {
                    matchId: live.matchId,
                    meta: {
                        halves: 2,
                        halfDurationMinutes: 35,
                        opponent: live.meta?.opponent || data.sheet?.opponent || "",
                        score: {
                            home: data.sheet?.homeScore ?? live.meta?.homeScore ?? null,
                            away: data.sheet?.awayScore ?? live.meta?.awayScore ?? null,
                        }
                    },
                    players: []
                };

                for (const pidStr of Object.keys(live.players || {})) {
                    const pid = Number(pidStr);
                    const ps = live.players[pid];
                    if (!ps) continue;

                    out.players.push({
                        matchId: live.matchId,
                        playerId: pid,
                        minutes: computeMinutes(ps),
                        goals: ps.goals || 0,
                        rating: ps.rating || 0
                    });
                }

                out.players.sort((a,b) => a.playerId - b.playerId);
                return out;
            }

            function setBox(obj) {
                $("box").value = JSON.stringify(obj, null, 2);
            }

            $("generate").addEventListener("click", () => {
                setBox(buildExport());
            });

            $("download").addEventListener("click", () => {
                const obj = $("box").value.trim() ? JSON.parse($("box").value) : buildExport();
                const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `match-${mid}.json`;
                a.click();
                URL.revokeObjectURL(a.href);
            });

            // auto-generate once
            setBox(buildExport());
        });
    }

    // -----------------------------
    // SW
    // -----------------------------
    function registerSW() {
        if (!("serviceWorker" in navigator)) return;
        navigator.serviceWorker.register("./sw.js").catch(() => {});
    }

    return {
        initSheetPage,
        initLivePage,
        initExportPage
    };
})();