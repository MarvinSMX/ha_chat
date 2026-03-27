'use strict';

const crypto = require('crypto');

function hashObject(value) {
  return crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex');
}

function shiftTimeString(hms, deltaMinutes) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(hms || '').trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3] || '0');
  if (![hh, mm, ss].every((x) => Number.isFinite(x))) return null;
  let total = hh * 60 + mm + deltaMinutes;
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const outH = Math.floor(total / 60);
  const outM = total % 60;
  return `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function ensureArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

function extractTimeTriggers(automation) {
  const triggers = ensureArray(automation && automation.trigger ? automation.trigger : []);
  return triggers
    .map((t, idx) => ({ t, idx }))
    .filter((x) => String(x.t && x.t.platform ? x.t.platform : '').toLowerCase() === 'time');
}

function normalizeTimeInput(v) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(v || '').trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3] || '0');
  if (![hh, mm, ss].every((x) => Number.isFinite(x))) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function proposeTriggerChange(currentTriggers, { set_time, shift_minutes }) {
  const shift = Number.isFinite(Number(shift_minutes)) ? Number(shift_minutes) : null;
  const explicitTime = normalizeTimeInput(set_time);
  const entries = currentTriggers.map((x) => ({ ...x }));
  let changed = false;
  for (const entry of entries) {
    const at = entry.t && entry.t.at ? String(entry.t.at) : '';
    let next = at;
    if (shift != null) next = shiftTimeString(at, shift) || at;
    if (explicitTime) next = explicitTime;
    if (next !== at && entry.t) {
      entry.t = { ...entry.t, at: next };
      changed = true;
    }
  }
  return {
    changed,
    triggers: entries.map((e) => e.t),
    reason: shift != null ? `time_shift_${shift}` : explicitTime ? `set_time_${explicitTime}` : 'no_change',
  };
}

function createAutomationChangeEngine({ callWs }) {
  let cache = { rows: null, at: 0 };
  const CACHE_TTL_MS = 2000;

  async function listAutomations() {
    const now = Date.now();
    if (cache.rows && now - cache.at < CACHE_TTL_MS) return cache.rows;
    const raw = await callWs('config/automation/config', {});
    if (!Array.isArray(raw)) return [];
    const rows = raw.map((a) => ({
      ...a,
      automation_id: String(a && (a.automation_id || a.id || '')).trim(),
      alias: String(a && (a.alias || a.name || a.id || '')).trim(),
    }));
    cache = { rows, at: now };
    return rows;
  }

  async function proposeChange({ automation_id, set_time, shift_minutes }) {
    const automations = await listAutomations();
    if (!automations.length) throw new Error('Keine Automationen aus HA abrufbar.');

    const aid = String(automation_id || '').trim();
    if (!aid) throw new Error('automation_id ist erforderlich.');
    const target = automations.find((a) => String(a.automation_id) === aid || String(a.id || '') === aid) || null;
    if (!target) throw new Error('Zielautomation nicht gefunden: ' + aid);

    const timeTriggers = extractTimeTriggers(target);
    const currentTriggers = timeTriggers.map((x) => x.t);
    const proposal = proposeTriggerChange(timeTriggers, { set_time, shift_minutes });
    const currentHash = hashObject(currentTriggers);
    const proposedHash = hashObject(proposal.triggers);

    return {
      found: true,
      automation: {
        automation_id: target.automation_id || target.id || '',
        alias: target.alias || target.name || target.id || '',
      },
      current_triggers: currentTriggers,
      proposed_triggers: proposal.triggers,
      changed: proposal.changed && currentHash !== proposedHash,
      reason: proposal.reason,
      current_hash: currentHash,
    };
  }

  async function applyChange({ automation_id, proposed_triggers, expected_current_hash }) {
    const automations = await listAutomations();
    const target =
      automations.find((a) => String(a.automation_id) === String(automation_id) || String(a.id || '') === String(automation_id)) ||
      null;
    if (!target) throw new Error('Automation nicht gefunden: ' + automation_id);

    const currentTriggers = extractTimeTriggers(target).map((x) => x.t);
    const currentHash = hashObject(currentTriggers);
    if (expected_current_hash && expected_current_hash !== currentHash) {
      throw new Error('Konflikt: Automation wurde seit Vorschlag geändert. Bitte neuen Vorschlag erzeugen.');
    }

    // Home Assistant erwartet id + trigger update für Storage-Automationen.
    const payload = {
      id: target.id || target.automation_id,
      trigger: proposed_triggers,
    };
    const res = await callWs('config/automation/update', payload);
    cache = { rows: null, at: 0 };
    return {
      ok: true,
      automation_id: target.automation_id || target.id || '',
      update_result: res,
    };
  }

  return {
    proposeChange,
    applyChange,
  };
}

module.exports = { createAutomationChangeEngine };

