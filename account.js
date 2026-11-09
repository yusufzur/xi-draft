(() => {
  const config = window.XI_SUPABASE_CONFIG || {};
  const dialog = document.querySelector("#account-dialog");
  const content = document.querySelector("#account-content");
  const trigger = document.querySelector("#account-button");
  const storageKey = "xi-draft-superlig-2026-27-v3";
  const localTestMode = config.localTestMode === true
    && ["localhost", "127.0.0.1"].includes(window.location.hostname);
  let client = null;
  let user = null;
  let accountMode = "signin";
  let message = "";
  let errorMessage = "";
  let cloudSaveStatus = "signed-out";
  let pendingCloudState = null;
  let syncTimer = 0;
  let loading = false;
  let draftRows = [];
  let cupRows = [];
  let gameRecord = { played: 0, wins: 0, draws: 0, losses: 0 };
  let syncQueue = Promise.resolve();

  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);

  function configured() {
    const legalReady = config.legalDocumentsReady === true
      && config.termsVersion?.trim() && config.privacyVersion?.trim();
    return Boolean(client && config.url && config.anonKey && (legalReady || localTestMode));
  }

  function enqueueSnapshot(snapshot) {
    const safeSnapshot = JSON.parse(JSON.stringify(snapshot));
    syncQueue = syncQueue.catch(() => {}).then(() => uploadSnapshot(safeSnapshot));
    return syncQueue;
  }

  async function syncCurrentGame() {
    if (!user || !client || pendingCloudState) return;
    window.clearTimeout(syncTimer);
    cloudSaveStatus = "syncing";
    errorMessage = "";
    render();
    try {
      await enqueueSnapshot(window.XIDraft.getState());
      await loadAccountData();
    } catch (error) {
      cloudSaveStatus = "error";
      errorMessage = error.message || "Unable to save account progress.";
      console.error("Unable to sync account progress:", error);
    }
    render();
  }

  function showDialog() {
    if (!dialog.open) dialog.showModal();
    render();
    if (user && client) void syncCurrentGame();
  }

  function closeButton() {
    return '<button class="account-close text-button" type="button" data-close-account aria-label="Close account panel">CLOSE ×</button>';
  }

  function setupPanel() {
    return `<div class="account-panel">
      <div class="account-panel-head"><div><div class="eyebrow">OPTIONAL PLAYER ACCOUNT</div><h2 id="account-dialog-title">PLAY AS A GUEST.</h2></div>${closeButton()}</div>
      <p>Your game is ready to play without signing up. Drafts and cup progress are saved in this browser on this device.</p>
      <div class="guest-save-note"><span class="live-dot"></span><span><strong>Saved on this device</strong><small>Accounts and cloud sync are not available yet.</small></span></div>
      <button class="primary-button full-button" type="button" data-close-account>CONTINUE PLAYING <span aria-hidden="true">→</span></button>
      ${errorMessage ? `<p class="account-message account-error" role="alert">${esc(errorMessage)}</p>` : ""}
    </div>`;
  }

  function authPanel() {
    const signingUp = accountMode === "signup";
    const resetting = accountMode === "reset";
    const updatingPassword = accountMode === "update-password";
    return `<div class="account-panel">
      <div class="account-panel-head"><div><div class="eyebrow">${localTestMode ? "PRIVATE LOCAL TEST · NOT PUBLIC" : "YOUR SAVED XI · PRIVATE TO YOUR ACCOUNT"}</div><h2 id="account-dialog-title">${signingUp ? "CREATE ACCOUNT." : resetting ? "RESET PASSWORD." : updatingPassword ? "CHOOSE A PASSWORD." : "WELCOME BACK."}</h2></div>${closeButton()}</div>
      <p class="account-muted">Your password is sent to Supabase Auth for verification and is not saved in game data. Supabase manages password storage and verification.</p>
      ${localTestMode ? '<p class="account-message">TEST MODE: available only on localhost. Use only your own test account; the privacy and terms pages are drafts, and this local test site is not public.</p>' : ""}
      ${!updatingPassword ? '<p class="account-muted">After creating your account, confirm the email from Supabase, then sign in here. Signing in syncs this browser’s current game to your account.</p>' : ""}
      <form id="account-form" class="account-form">
        ${updatingPassword ? "" : `<label>Email address<input name="email" type="email" autocomplete="email" maxlength="254" required /></label>`}
        ${resetting ? "" : `<label>Password<input name="password" type="password" autocomplete="${signingUp || updatingPassword ? "new-password" : "current-password"}" minlength="10" maxlength="128" required /></label>`}
        ${signingUp ? `<label class="account-consent"><input name="legalConsent" type="checkbox" required /><span>${localTestMode ? "I understand this is a private test and the " : "I confirm I meet the minimum age where I live, and agree to the "}<a href="terms.html" target="_blank" rel="noreferrer">Terms</a> and <a href="privacy.html" target="_blank" rel="noreferrer">Privacy Notice</a>${localTestMode ? " are draft templates, not finalized legal terms." : "."}</span></label>` : ""}
        <p class="account-message ${errorMessage ? "account-error" : ""}" role="status">${esc(errorMessage || message)}</p>
        <button class="primary-button full-button" type="submit" ${loading ? "disabled" : ""}>${loading ? "PLEASE WAIT…" : signingUp ? "CREATE ACCOUNT" : resetting ? "SEND RESET LINK" : updatingPassword ? "UPDATE PASSWORD" : "SIGN IN"} <span aria-hidden="true">→</span></button>
      </form>
      ${accountMode === "signin" ? '<button class="text-button account-switch" type="button" data-mode="reset">Forgot your password?</button>' : ""}
      ${accountMode === "reset" || updatingPassword ? '<button class="text-button account-switch" type="button" data-mode="signin">Back to sign in</button>' : ""}
      ${accountMode === "signin" || signingUp ? `<button class="text-button account-switch" type="button" data-mode="${signingUp ? "signin" : "signup"}">${signingUp ? "Already have an account? Sign in" : "Don't have an account? Create one"}</button>` : ""}
      <p class="account-muted account-privacy-note">${localTestMode ? "Test accounts use Supabase and store the email address you enter. Use an email you control and a unique password." : "Cloud sync is optional. Guest saves remain in this browser."} <a href="privacy.html" target="_blank" rel="noreferrer">Privacy Notice</a> · <a href="terms.html" target="_blank" rel="noreferrer">Terms</a></p>
    </div>`;
  }

  function conflictPanel() {
    return `<div class="account-panel">
      <div class="account-panel-head"><div><div class="eyebrow">CLOUD SAVE FOUND</div><h2 id="account-dialog-title">CHOOSE YOUR PROGRESS.</h2></div>${closeButton()}</div>
      <p>A different save exists in this browser and your account. Choose which one to keep; this only replaces the active game save, not your account history.</p>
      <div class="account-actions"><button class="primary-button full-button" type="button" data-use-cloud>Use account save</button><button class="text-button" type="button" data-keep-local>Keep this device's save</button></div>
      <p class="account-message" role="status">${esc(message)}</p>
    </div>`;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  async function fetchAll(table, columns, orderColumn) {
    const rows = [];
    for (let start = 0; ; start += 1000) {
      const { data, error } = await client.from(table).select(columns).eq("user_id", user.id)
        .order(orderColumn, { ascending: false }).range(start, start + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) return rows;
    }
  }

  function dashboardPanel() {
    const wins = cupRows.filter((cup) => cup.outcome === "champion").length;
    const games = cupRows.reduce((sum, cup) => sum + cup.rounds_won + (cup.outcome === "eliminated" ? 1 : 0), 0);
    const picks = new Map();
    for (const draft of draftRows) {
      if (!Array.isArray(draft.selected_players)) continue;
      for (const playerId of draft.selected_players) {
        const player = window.XIDraft?.getPlayer(playerId);
        if (player) picks.set(playerId, { player, count: (picks.get(playerId)?.count || 0) + 1 });
      }
    }
    const favorite = [...picks.values()].sort((a, b) => b.count - a.count)[0];
    const recentCups = cupRows.slice(0, 6).map((cup) => `
      <div class="career-history-row"><span class="career-trophy ${cup.outcome === "champion" ? "earned" : ""}">${cup.outcome === "champion" ? "✦" : "○"}</span>
        <span><strong>${cup.outcome === "champion" ? "Cup winner" : "Cup run"} · ${cup.rounds_won} ${cup.rounds_won === 1 ? "round" : "rounds"} won</strong><small>${formatDate(cup.completed_at)}</small></span>
        <b>${cup.outcome === "champion" ? "CHAMPION" : "ELIMINATED"}</b></div>`).join("");

    return `<div class="account-panel account-dashboard">
      <div class="account-panel-head"><div><div class="eyebrow">YOUR CAREER · PRIVATE ACCOUNT</div><h2 id="account-dialog-title">THE TROPHY ROOM.</h2><p class="account-email">${esc(user.email || "Signed-in player")}</p></div>${closeButton()}</div>
      ${pendingCloudState ? conflictPanel() : ""}
      ${message ? `<p class="account-message" role="status">${esc(message)}</p>` : ""}
      ${errorMessage ? `<p class="account-message account-error" role="alert">${esc(errorMessage)}</p>` : ""}
      ${loading ? '<p class="account-muted">Loading your account history…</p>' : `
        <div class="career-stats">
          <div><strong>${wins}</strong><span>CUPS WON</span></div>
          <div><strong>${cupRows.length}</strong><span>CUP RUNS</span></div>
          <div><strong>${games}</strong><span>KNOCKOUT MATCHES</span></div>
          <div><strong>${draftRows.length}</strong><span>XI DRAFTS</span></div>
        </div>
        <div class="career-friendly-record"><span>FRIENDLY RECORD</span><strong>${gameRecord.wins}W · ${gameRecord.draws}D · ${gameRecord.losses}L</strong><small>${gameRecord.played} matches played</small></div>
        <p class="account-message" role="status">${cloudSaveStatus === "syncing" ? "Syncing your game to your account…" : cloudSaveStatus === "saved" ? "Your latest game progress is saved to your account." : cloudSaveStatus === "error" ? "Cloud sync failed. Check the error above and try again." : "Sign in to sync game progress."}</p>
        <section class="career-favorite"><div class="eyebrow">MOST DRAFTED PLAYER</div>
          ${favorite ? `<strong>${esc(favorite.player.name)}</strong><span>${esc(favorite.player.club)} · picked ${favorite.count} ${favorite.count === 1 ? "time" : "times"}</span>` : "<strong>No saved drafts yet.</strong><span>Complete an XI while signed in to build your player stats.</span>"}
        </section>
        <section class="career-history"><div class="eyebrow">RECENT CUP RESULTS</div>${recentCups || '<p class="account-muted">No completed cup runs yet. Win a cup to add your first trophy here.</p>'}</section>
        <div class="account-actions"><button class="text-button" type="button" data-export-data>Download my data</button><button class="text-button" type="button" data-delete-data>Delete cloud game data</button><button class="text-button" type="button" data-signout>Sign out</button></div>
        <p class="account-muted account-privacy-note">These are personal game stats synced from your browser save, not verified competition results. <a href="privacy.html" target="_blank" rel="noreferrer">Privacy Notice</a></p>`}
    </div>`;
  }

  function bind() {
    content.querySelector("[data-close-account]")?.addEventListener("click", () => dialog.close());
    content.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", (event) => {
      accountMode = event.currentTarget.dataset.mode;
      message = "";
      errorMessage = "";
      render();
    }));
    content.querySelector("#account-form")?.addEventListener("submit", submitAuth);
    content.querySelector("[data-mode='reset']")?.addEventListener("click", () => {
      accountMode = "reset";
      message = "";
      errorMessage = "";
      render();
    });
    content.querySelector("[data-signout]")?.addEventListener("click", signOut);
    content.querySelector("[data-use-cloud]")?.addEventListener("click", useCloudSave);
    content.querySelector("[data-keep-local]")?.addEventListener("click", keepLocalSave);
    content.querySelector("[data-delete-data]")?.addEventListener("click", deleteCloudData);
    content.querySelector("[data-export-data]")?.addEventListener("click", exportAccountData);
  }

  function render() {
    if (!configured()) {
      trigger.textContent = "GUEST";
      content.innerHTML = setupPanel();
    } else if (user && accountMode === "update-password") {
      trigger.textContent = "MY CAREER";
      content.innerHTML = authPanel();
    } else if (!user) {
      trigger.textContent = "SIGN IN";
      content.innerHTML = authPanel();
    } else if (pendingCloudState) {
      content.innerHTML = conflictPanel();
    } else {
      content.innerHTML = dashboardPanel();
    }
    bind();
  }

  async function submitAuth(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.elements.email?.value.trim();
    const password = form.elements.password?.value;
    const submittedMode = accountMode;
    loading = true;
    cloudSaveStatus = "syncing";
    message = "";
    errorMessage = "";
    render();
    try {
      if (submittedMode === "signup") {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
            data: localTestMode ? {
              local_test_mode: true,
              local_test_acknowledged_at: new Date().toISOString(),
            } : {
              terms_version: config.termsVersion,
              privacy_version: config.privacyVersion,
              legal_consent_at: new Date().toISOString(),
            },
          },
        });
        if (error) throw error;
        if (!data.session) message = "Check your email for a confirmation link, then return here to sign in.";
        else message = "Account created. Your current game will sync to your account.";
      } else if (submittedMode === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}${window.location.pathname}`,
        });
        if (error) throw error;
        message = "If an account exists for that email, a password reset link is on its way.";
      } else if (submittedMode === "update-password") {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        accountMode = "signin";
        message = "Password updated. You can continue using your account.";
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        message = "Signed in. Loading your saved game…";
      }
    } catch (error) {
      errorMessage = error.message || "Unable to complete sign-in.";
    } finally {
      loading = false;
      render();
    }
  }

  async function loadAccountData() {
    const [draftData, cupData, saveResult] = await Promise.all([
      fetchAll("drafts", "draft_id, formation, selected_players, created_at", "created_at"),
      fetchAll("cup_runs", "tournament_id, outcome, rounds_won, completed_at", "completed_at"),
      client.from("game_saves").select("game_state").eq("user_id", user.id).maybeSingle(),
    ]);
    if (saveResult.error) throw saveResult.error;
    draftRows = draftData;
    cupRows = cupData;
    const record = saveResult.data?.game_state?.record;
    gameRecord = record && ["played", "wins", "draws", "losses"].every((key) => Number.isInteger(record[key]))
      ? record
      : { played: 0, wins: 0, draws: 0, losses: 0 };
  }

  async function onSession(session) {
    const nextUser = session?.user || null;
    if (!nextUser) {
      user = null;
      cloudSaveStatus = "signed-out";
      pendingCloudState = null;
      draftRows = [];
      cupRows = [];
      render();
      return;
    }
    const changedUser = user?.id !== nextUser.id;
    user = nextUser;
    trigger.textContent = "MY CAREER";
    if (accountMode === "reset" && window.location.hash.includes("type=recovery")) {
      accountMode = "update-password";
      if (dialog.open) render();
    }
    if (!changedUser) {
      render();
      return;
    }
    loading = true;
    errorMessage = "";
    render();
    try {
      const { data, error } = await client.from("game_saves").select("game_state").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (data?.game_state) {
        const local = window.XIDraft.getState();
        const localHasProgress = local.phase !== "setup" && local.round > 0;
        const cloudHasProgress = data.game_state.phase !== "setup" && data.game_state.round > 0;
        if (!localHasProgress) {
          window.XIDraft.restoreState(data.game_state);
          message = "Your account save was restored on this device.";
        } else if (localHasProgress && !cloudHasProgress) {
          await uploadSnapshot(local);
          message = "This device's progress is now saved to your account.";
        } else if (JSON.stringify(local) !== JSON.stringify(data.game_state)) {
          pendingCloudState = data.game_state;
          message = "Choose which active save to use.";
        }
      } else {
        await uploadSnapshot(window.XIDraft.getState());
        message = "Your current game is now saved to your account.";
      }
      await loadAccountData();
      cloudSaveStatus = "saved";
    } catch (error) {
      cloudSaveStatus = "error";
      errorMessage = error.message || "Unable to load account data. Check that the Supabase schema is installed.";
    } finally {
      loading = false;
      render();
    }
  }

  async function uploadSnapshot(snapshot) {
    const currentUser = user;
    if (!currentUser) return;
    const draftId = snapshot.draftId || crypto.randomUUID();
    if (snapshot.round === 11 && snapshot.squad.length === 11) {
      const { error } = await client.from("drafts").upsert({
        user_id: currentUser.id,
        draft_id: draftId,
        formation: snapshot.formation,
        selected_players: snapshot.squad.map((pick) => pick.playerId),
      }, { onConflict: "user_id,draft_id" });
      if (error) throw error;
    }
    const { error: saveError } = await client.from("game_saves").upsert({
      user_id: currentUser.id,
      game_state: { ...snapshot, draftId },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (saveError) throw saveError;
    cloudSaveStatus = "saved";
    const tournament = snapshot.tournament;
    if (tournament && ["champion", "eliminated"].includes(tournament.status)) {
      const roundsWon = tournament.rounds.reduce((sum, round) => sum + round.filter((fixture) => fixture.winner === "your-xi").length, 0);
      const { error: cupError } = await client.from("cup_runs").upsert({
        user_id: currentUser.id,
        tournament_id: tournament.id || crypto.randomUUID(),
        draft_id: tournament.draftId || draftId,
        outcome: tournament.status,
        rounds_won: roundsWon,
        completed_at: new Date().toISOString(),
      }, { onConflict: "user_id,tournament_id" });
      if (cupError) throw cupError;
      if (dialog.open) {
        await loadAccountData();
        render();
      }
    }
  }

  async function useCloudSave() {
    loading = true;
    render();
    try {
      window.XIDraft.restoreState(pendingCloudState);
      pendingCloudState = null;
      message = "Account save restored on this device.";
      await loadAccountData();
    } catch (error) {
      errorMessage = error.message || "Could not restore the account save.";
    } finally {
      loading = false;
      render();
    }
  }

  async function keepLocalSave() {
    loading = true;
    render();
    try {
      await uploadSnapshot(window.XIDraft.getState());
      pendingCloudState = null;
      message = "This device's save is now the active account save.";
      await loadAccountData();
    } catch (error) {
      errorMessage = error.message || "Could not sync this device's save.";
    } finally {
      loading = false;
      render();
    }
  }

  async function signOut() {
    window.clearTimeout(syncTimer);
    try {
      if (user) {
        await enqueueSnapshot(window.XIDraft.getState());
      }
    } catch (error) {
      errorMessage = error.message || "Your latest cloud save failed. You are still signed in.";
      render();
      return;
    }
    const { error } = await client.auth.signOut();
    if (error) {
      errorMessage = error.message;
      render();
      return;
    }
    message = "Signed out. The local game save stays on this device.";
    render();
  }

  function exportAccountData() {
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        email: user?.email || null,
        currentGame: window.XIDraft.getState(),
        drafts: draftRows,
        cupRuns: cupRows,
      };
      const link = document.createElement("a");
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      link.href = url;
      link.download = `xi-draft-account-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      message = "Your account data download has started.";
    } catch (error) {
      errorMessage = error.message || "Unable to export account data.";
    }
    render();
  }

  async function deleteCloudData() {
    if (!window.confirm("Delete your cloud drafts, cup history, and account game save? This cannot be undone.")) return;
    window.clearTimeout(syncTimer);
    loading = true;
    render();
    try {
      await syncQueue.catch(() => {});
      const { error } = await client.rpc("delete_my_game_data");
      if (error) throw error;
      window.XIDraft.clearLocalSave();
      draftRows = [];
      cupRows = [];
      pendingCloudState = null;
      message = "Your cloud game data and this device's active save were deleted.";
    } catch (error) {
      errorMessage = error.message || "Unable to delete account game data.";
    } finally {
      loading = false;
      render();
    }
  }

  function initialize() {
    trigger.addEventListener("click", showDialog);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    const legalReady = config.legalDocumentsReady === true
      && config.termsVersion?.trim() && config.privacyVersion?.trim();
    if (!config.url || !config.anonKey || (!legalReady && !localTestMode)) {
      render();
      return;
    }
    if (!window.supabase?.createClient) {
      errorMessage = "Supabase Auth could not load. Check your internet connection and CDN access.";
      render();
      return;
    }
    try {
      const projectUrl = new URL(config.url);
      if (projectUrl.protocol !== "https:" && projectUrl.hostname !== "localhost") {
        throw new Error("Use an HTTPS Supabase project URL for a published site.");
      }
      client = window.supabase.createClient(config.url, config.anonKey);
    } catch (error) {
      errorMessage = error.message || "Supabase configuration is invalid.";
      render();
      return;
    }
    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        accountMode = "update-password";
        message = "";
        errorMessage = "";
      }
      window.setTimeout(() => { void onSession(session); }, 0);
    });
    client.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      return onSession(data.session);
    }).catch((error) => {
      errorMessage = error.message || "Unable to check your sign-in session.";
      render();
    });
    render();
  }

  window.XIDraftCloud = {
    queueSave(snapshot) {
      if (!user || !client) return;
      cloudSaveStatus = "syncing";
      window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => {
        enqueueSnapshot(snapshot).then(() => {
          cloudSaveStatus = "saved";
          if (dialog.open) render();
        }).catch((error) => {
          cloudSaveStatus = "error";
          errorMessage = error.message || "Cloud save failed.";
          console.error("Unable to save account progress:", error);
          if (dialog.open) render();
        });
      }, 500);
    },
  };

  initialize();
})();
