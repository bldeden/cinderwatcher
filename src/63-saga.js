
// The saga layer: attack and armor types, tower combos, the Warden, relics, and what a run carries from land to land.

const ATK = { arrow: 'pierce', blast: 'siege', bolt: 'magic', sword: 'normal', fire: 'magic' };
const ATK_NAME = { pierce: 'Piercing', siege: 'Siege', magic: 'Magic', normal: 'Normal' };
const ARM_NAME = { none: 'Unarmored', light: 'Light', medium: 'Medium', heavy: 'Heavy', fort: 'Fortified' };
const TYPE_MUL = {
  pierce: { none: 1, light: 1.3, medium: 1, heavy: .5, fort: .4 },
  siege: { none: 1, light: .8, medium: 1, heavy: 1, fort: 1.5 },
  magic: { none: 1, light: 1, medium: .9, heavy: 1.4, fort: .75 },
  normal: { none: 1, light: 1, medium: 1.1, heavy: .9, fort: .7 },
};
const ATK_HINT = { pierce: 'Piercing: strong vs light armor.', siege: 'Siege: strong vs fortified.', magic: 'Magic: strong vs heavy armor.', normal: 'Normal: steady vs medium armor.' };
const ARM_HINT = { none: '', light: 'Light armor: arrows bite deep, shells less so.', medium: 'Medium armor: swords do best.', heavy: 'Heavy armor: turns arrows, weak to magic.', fort: 'Fortified: turns arrows and bolts, weak to shells.' };
const ARM_OF = {
  rat: 'light', bat: 'light', spider: 'light', scarab: 'light', wolf: 'light', wisp: 'light', slimelet: 'light',
  skel: 'medium', mummy: 'medium', brood: 'medium', brute: 'medium', toad: 'medium', drummer: 'medium', bomber: 'medium', ogre: 'medium', queen: 'medium',
  knight: 'heavy', gargoyle: 'heavy', giant: 'heavy', king: 'heavy', jotun: 'heavy',
  golem: 'fort', colossus: 'fort',
};
for (const ty in MON) MON[ty].arm = ARM_OF[ty] || 'none';
TOWER.archer.atk = 'pierce'; TOWER.bombard.atk = 'siege'; TOWER.spire.atk = 'magic'; TOWER.guard.atk = 'normal';
function typeMul(kind, m) { const a = ATK[kind]; if (!a) return 1; const k = TYPE_MUL[a][m.def.arm]; return m.def.boss ? 1 + (k - 1) * .5 : k; }

const MOD = {};
function resetMods() { Object.assign(MOD, { dmg: { archer: 1, bombard: 1, spire: 1, guard: 1 }, splash: 1, jumps: 0, shockT: 0, guardN: 0, guardHp: 1, burn: 1, burnT: 0, cost: 1, heroHp: 1, heroDmg: 1, heroRevive: 1, lives: 0, mend: 0, bounty: 1, combo: 1, range: 1, startGold: 0 }); }
resetMods();
const RUN = { relics: [], offer: null, offered: false, hold: 0, bonus: 0, combos: {}, comboAt: {}, fresh: true, salvage: 0, mended: 0, landCombos: 0, texts: [], leakAt: -99 };

function costOf(def, lvl) { return Math.max(5, Math.round(def.cost[lvl] * MOD.cost / 5) * 5); }
function rangeOf(def, lvl) { return def.range[lvl] * (def === TOWER.guard ? 1 : MOD.range); }
function guardCount(tw) { return tw.isKeep ? 1 : Math.min(4, tw.def.n[tw.lvl] + MOD.guardN); }
function masteryMul(tw) { return 1 + .12 * (tw.mastery || 0); }
function towerDmg(tw) { return tw.def.dmg[tw.lvl] * MOD.dmg[tw.kind] * masteryMul(tw); }
function guardHp(tw) { return tw.def.hp[tw.lvl] * MOD.guardHp * masteryMul(tw); }
function guardDmg(tw) { return tw.def.dmg[tw.lvl] * MOD.dmg.guard * masteryMul(tw); }
const MASTERY_MAX = 5, MASTERY_NAME = ['', 'I', 'II', 'III', 'IV', 'V'];
function masteryCost(tw) { return Math.max(5, Math.round((120 + 60 * (tw.mastery || 0)) * MOD.cost / 5) * 5); }
// A tower at its third level can still be drilled: each mastery rank adds 12% to what it does.
function masterTower(t) {
  if (t.mastery >= MASTERY_MAX) return false; const c = masteryCost(t); if (G.gold < c) return false;
  G.gold -= c; UI.goldShown = Math.min(UI.goldShown, G.gold); t.mastery++; t.spent += c; t.em.I = t.def.light[t.lvl] * (1 + .08 * t.mastery); for (const m of t.men) m.lvlUp = true;
  const top = t.y + (t.mounts ? t.mounts.top : 2.5);
  fxTimed(5, t.x, top, t.z, 3.4, 3.4, 2.6, 2.0, .7, 1, .5); fxEmbers(t.x, t.y + 1, t.z, 18, .6, 1, .8, .3); lightFlash(t.x, top, t.z, 0xffd070, 500, .35, 12);
  floatText('Mastery ' + MASTERY_NAME[t.mastery], t.x, top + .3, t.z, '#ffe08a', { dur: 1.6 }); sfx('buildDone', t.x, t.z, .9);
  return true;
}

function floatText(text, x, y, z, col, o = {}) {
  if (RUN.texts.length > 36) RUN.texts.shift();
  RUN.texts.push({ text, x, y, z, col, t: 0, dur: o.dur || 1.6, big: o.big || 0, rise: o.rise === undefined ? 1.2 : o.rise });
}

const COMBO = {
  wildfire: { name: 'Wildfire', pair: ['archer', 'bombard'], col: '#ff9a4a', desc: 'A shell landing on burning foes hits them half again as hard and sets the rest alight.' },
  stormfire: { name: 'Stormfire', pair: ['archer', 'spire'], col: '#ffe08a', desc: 'A flaming arrow that strikes a shocked foe arcs lightning into two more.' },
  thunderclap: { name: 'Thunderclap', pair: ['bombard', 'spire'], col: '#8fc7ff', desc: 'A shell landing on shocked foes stuns them where they stand.' },
  skewer: { name: 'Skewer', pair: ['archer', 'guard'], col: '#ff7a62', desc: 'Arrows find the gaps in a foe locked in a duel: +60%, and armor is ignored.' },
  anvil: { name: 'Hammer and Anvil', short: 'Anvil', pair: ['bombard', 'guard'], col: '#e9dfc8', desc: 'Foes pinned by swords take +45% from shells.' },
  galvanize: { name: 'Galvanize', pair: ['spire', 'guard'], col: '#7fe3ff', desc: 'A sword that cuts a shocked foe discharges it: +80% as magic, and it is slowed again.' },
};
const COMBO_IDS = Object.keys(COMBO);
function comboOf(a, b) { for (const id of COMBO_IDS) { const p = COMBO[id].pair; if ((p[0] === a && p[1] === b) || (p[0] === b && p[1] === a)) return id; } return null; }
function comboPop(id, x, y, z) {
  RUN.combos[id] = (RUN.combos[id] || 0) + 1; RUN.landCombos++;
  if (G.t - (RUN.comboAt[id] || -9) < 1.3) return; RUN.comboAt[id] = G.t;
  floatText(COMBO[id].name + '!', x, y + .5, z, COMBO[id].col, { dur: 1.5 }); sfx('combo', x, z, .5, COMBO_IDS.indexOf(id) / 5);
}
// Which combos a tower of this kind on this pad would share with the towers already standing.
function combosAt(pad, kind, skip) {
  const out = [], r0 = rangeOf(TOWER[kind], 0);
  for (const t of G.towers) {
    if (!t.alive || t === skip || t.kind === kind) continue;
    const id = comboOf(kind, t.kind); if (!id || out.includes(id)) continue;
    if (Math.hypot(t.x - pad.x, t.z - pad.z) < r0 + t.range - 1.2) out.push(id);
  }
  return out;
}

function applyBurn(m, dmg, tower, T) {
  const dps = dmg * .22 * MOD.burn; if (dps >= m.burnDps) { m.burnDps = dps; m.burnBy = tower || null; }
  m.burnT = Math.max(m.burnT, (T || 3) + MOD.burnT);
}
function stormfire(m, dmg, tower) {
  let n = 0; const from = [m.x, m.y + m.hitH, m.z];
  for (const o of G.mons) {
    if (n >= 2) break; if (o === m || o.dead || o.hp <= 0 || !o.vis || dist2(m.x, m.z, o.x, o.z) > 6.8) continue; n++;
    const to = [o.x, o.y + o.hitH, o.z]; fxBolt(from, to, .2, [1.8, 1.05, .4], .07); fxSparks(to[0], to[1], to[2], 4, 3, 3, 1.8, .5, { size: .05, grav: 4 });
    hitMonster(o, dmg * .6 * MOD.combo, 'bolt', 0, 0, tower, { raw: true });
  }
  if (n) comboPop('stormfire', m.x, m.y + m.hitH, m.z);
}
// Burn, shock, pin and stun all run down here. Returns true if the burn finished the monster.
function tickStatus(m, dt) {
  if (m.shockT > 0) m.shockT -= dt; if (m.pinT > 0) m.pinT -= dt; if (m.stunT > 0) m.stunT -= dt;
  if (m.burnT > 0 && !(m.dying > 0)) {
    m.burnT -= dt; const d = m.burnDps * dt * (m.eth ? .5 : 1) * typeMul('fire', m); m.hp -= d; m.hitAt = G.t;
    const tw = m.burnBy; if (tw) { tw.dealt += d; tw.recent += d; }
    if (m.burnT <= 0) m.burnDps = 0;
    if (m.hp <= 0) { killMonster(m, 'fire', 0, 0, tw); return true; }
  }
  return false;
}
function drawStatus(m) {
  const h = m.y + m.hitH, r = m.rad;
  if (m.burnT > 0) {
    if (rnd() < .45) fxPart(m.x + rr(-r, r), h + rr(-.2, .3), m.z + rr(-r, r), rr(-.2, .2), rr(.7, 1.6), rr(-.2, .2), rr(.25, .5), rr(.05, .09) * (1 + r), 2.8, 1.2, .25, { drag: 1, rise: .8 });
    FX.add.push(m.x, h + .1, m.z, 1.1 + r * 2, 1.1 + r * 2, 0, 0, 1.2, .5, .12, .3 + .12 * Math.sin(G.t * 17 + m.lseed), 2, 0, 0, 0);
  }
  if (m.stunT > 0) { const top = m.y + m.def.top * m.scale / m.def.scale + .25; for (let i = 0; i < 3; i++) { const a = G.t * 6 + i * TAU / 3; FX.add.push(m.x + Math.cos(a) * (r + .15), top, m.z + Math.sin(a) * (r + .15), .16, .16, 0, 0, 1.4, 1.9, 2.6, 1, 0, 0, 0, 0); } }
  if (m.pinT > 0 && m.shockT <= 0 && rnd() < .05) fxSparks(m.x, h, m.z, 1, 1.6, 2.6, 2.2, 1.6, { size: .04, grav: 5 });
}

// ---- The Warden: a hero who walks with the run from land to land.
const HERO = { f: null, lvl: 1, xp: 0, dead: 0, stance: 'van', nova: 0, keep: null, R: 5.5, flash: 0, name: 'The Warden' };
const HERO_SKILLS = [[1, 'Watchfire', 'Towers near the Warden work faster.'], [3, 'Cinder Nova', 'A ring of fire that burns and pins all it touches.'], [6, 'Unbroken', 'Mends even in a duel, and returns sooner.']];
function heroNeed(l) { return 90 * l * (l + 1); }
function heroHp() { return Math.round((150 + 40 * HERO.lvl) * MOD.heroHp); }
function heroDmg() { return (13 + 4 * HERO.lvl) * MOD.heroDmg; }
function heroAura() { return .08 + .012 * HERO.lvl; }
function heroRallyS() { const B = G.B; return HERO.stance === 'gate' ? B.L - 4.5 : B.L * .55; }
function towerHaste(t) { const f = HERO.f; return f && !f.dead && dist2(t.x, t.z, f.x, f.z) < HERO.R * HERO.R ? 1 + heroAura() : 1; }
function heroBegin() {
  const B = G.B, p = pathAt(B, B.L - 1.4, { x: 0, y: 0, z: 0, tx: 0, tz: 0 }), px = p.x, py = p.y, pz = p.z;
  HERO.keep = { isKeep: true, kind: 'keep', def: { n: [1], hp: [1], dmg: [1], rate: [9] }, lvl: 0, alive: true, state: 'active', men: [], pad: { s: heroRallyS() }, x: px, y: py, z: pz, yaw: Math.atan2(-p.tx, -p.tz), kills: 0, dealt: 0, recent: 0, mounts: { door: [0, 0, 0] }, w(l, out) { out.x = px; out.y = py; out.z = pz; return out; } };
  HERO.f = null; HERO.dead = 0; HERO.nova = 5; heroSpawn(false);
}
function heroSpawn(back) {
  const f = spawnFootman(HERO.keep); f.hero = true; f.torch = false; if (f.flame) { removeFlame(f.flame); f.flame = null; }
  f.s = G.B.L - 1.4; f.maxHp = f.hp = heroHp(); f.dmg = heroDmg(); f.scale = 1.2 + .015 * HERO.lvl; f.rad = .34; f.mass = 14; f.state = 'ready'; f.tint = [1.3, 1.1, .78]; f.lI = 38; f.lCol = 0xffd070; f.lx = f.x; f.ly = f.y + 1; f.lz = f.z;
  HERO.f = f;
  if (back) { fxTimed(5, f.x, f.y + 1, f.z, 4, 4, 2.4, 1.8, .7, .9, .5); fxEmbers(f.x, f.y + .3, f.z, 24, .5); lightFlash(f.x, f.y + 1.2, f.z, 0xffd070, 600, .4, 14); sfx('buildDone', f.x, f.z, .9); UI.alert('The Warden returns to the road.', '#ffe08a'); }
}
function heroFell(f) {
  HERO.f = null; HERO.dead = (7 + 1.3 * HERO.lvl) * MOD.heroRevive * (HERO.lvl >= 6 ? .6 : 1);
  UI.alert('The Warden has fallen!', '#ff7a62'); lightFlash(f.x, f.y + 1, f.z, 0xffd070, 400, .5, 12);
}
function heroXP(n) { if (HERO.lvl >= 10) return; HERO.xp += n; while (HERO.lvl < 10 && HERO.xp >= heroNeed(HERO.lvl)) { HERO.lvl++; heroLevelUp(); } }
function heroLevelUp() {
  const f = HERO.f, b = G.B.beacon; HERO.flash = 1; let x = b.x, y = b.y, z = b.z;
  if (f && !f.dead) { const r = f.hp / f.maxHp; f.maxHp = heroHp(); f.hp = f.maxHp * Math.min(1, r + .4); f.dmg = heroDmg(); f.scale = 1.2 + .015 * HERO.lvl; x = f.x; y = f.y; z = f.z; }
  fxTimed(5, x, y + 1, z, 5, 5, 2.6, 2.0, .7, 1, .7); fxTimed(4, x, y + .08, z, 6, 6, 2.4, 1.8, .5, .9, .8, { ground: true }); fxEmbers(x, y + .3, z, 36, .7, 1, .8, .3); lightFlash(x, y + 1.4, z, 0xffd070, 900, .6, 18);
  floatText('Level ' + HERO.lvl, x, y + 2.2, z, '#ffe08a', { big: 1, dur: 2.2 }); sfx('levelUp', x, z, 1);
  for (const sk of HERO_SKILLS) if (sk[0] === HERO.lvl && sk[0] > 1) UI.alert('The Warden learns ' + sk[1] + '.', '#ffe08a');
}
function castNova(f) {
  HERO.nova = 12; const r = 2.6, dmg = (22 + 9 * HERO.lvl) * MOD.heroDmg;
  if (f.atk < 0) { f.atk = 0; f.struck = true; }
  fxExplosion(f.x, f.y + .3, f.z, .75); fxTimed(4, f.x, f.y + .08, f.z, r * 2.6, r * 2.6, 2.6, 1.3, .3, 1, .6, { ground: true }); fxEmbers(f.x, f.y + .4, f.z, 30, 1.3);
  lightFlash(f.x, f.y + 1, f.z, 0xffa040, 800, .35, 16); sfx('ignite', f.x, f.z, 1, .8);
  floatText('Cinder Nova', f.x, f.y + 2.2, f.z, '#ffb060', { dur: 1.4 });
  for (const m of G.mons) {
    if (m.dead || m.hp <= 0 || m.fly || !m.vis) continue; const dx = m.x - f.x, dz = m.z - f.z, d = Math.hypot(dx, dz); if (d > r + m.rad) continue;
    m.pinT = Math.max(m.pinT, 2.6);
    if (!hitMonster(m, dmg, 'fire', dx / (d || 1), dz / (d || 1), HERO.keep, { raw: true })) applyBurn(m, dmg * 1.2, HERO.keep, 4);
  }
}
function heroToggle() { HERO.stance = HERO.stance === 'van' ? 'gate' : 'van'; if (HERO.keep) HERO.keep.pad.s = heroRallyS(); }
function heroUpdate(dt) {
  HERO.flash = Math.max(0, HERO.flash - dt * .8);
  const K = HERO.keep; if (G.phase !== 'play' || !K) return;
  let f = HERO.f; if (f && (f.gone || f.dead)) HERO.f = f = null;
  if (!f) { HERO.dead -= dt; if (HERO.dead <= 0) heroSpawn(true); return; }
  if (!UI.playerActive()) HERO.stance = (G.waveLeaks > 0 || G.leaks >= 3) ? 'gate' : 'van';
  K.pad.s = heroRallyS();
  const duel = !!f.target;
  if (!duel || HERO.lvl >= 6) f.hp = Math.min(f.maxHp, f.hp + f.maxHp * (duel ? .02 : .07) * dt);
  HERO.nova -= dt;
  if (HERO.lvl >= 3 && HERO.nova <= 0) {
    let n = 0, big = false; for (const m of G.mons) if (!m.dead && !m.fly && m.vis && m.hp > 0 && dist2(m.x, m.z, f.x, f.z) < 5.3) { n++; if (m.maxHp > 220) big = true; }
    if (n >= 3 || big) castNova(f); else HERO.nova = .4;
  }
}
function heroDraw(f) {
  FX.add.push(f.x, f.y + .07, f.z, 1.9, 1.9, 0, 0, .5, 2.4, .7, 2.4, 4, 0, .5, 1);
  for (let i = 0; i < 30; i++) { const a = i / 30 * TAU + G.t * .22, x = f.x + Math.cos(a) * HERO.R, z = f.z + Math.sin(a) * HERO.R; FX.add.push(x, G.B.heightAt(x, z) + .2, z, .3, .3, 0, 0, 2.4, 1.7, .6, .45 + .3 * Math.sin(G.t * 3 + i * 1.7), 0, 0, 0, 0); }
  FX.add.push(f.x, f.y + 1.1, f.z, 2.4, 2.4, 0, 0, 1.0, .75, .3, .22 + .3 * HERO.flash, 2, 0, 0, 0);
  f.lx = f.x; f.ly = f.y + 1.2; f.lz = f.z;
  if (rnd() < .12) fxPart(f.x + rr(-.3, .3), f.y + rr(.2, 1.6), f.z + rr(-.3, .3), 0, rr(.4, .9), 0, rr(.4, .8), .045, 2.6, 2.0, .7, { drag: .5 });
}

// ---- Relics: one of three after every boss, kept until the beacon goes out.
const RELICS = [
  { id: 'quiver', name: 'Whetstone Quiver', icon: 'archer', desc: ['Archer damage +25%.'], fn: M => { M.dmg.archer += .25; } },
  { id: 'fuse', name: 'Long Fuse', icon: 'bombard', desc: ['Bombard damage +15%', 'and blast size +20%.'], fn: M => { M.dmg.bombard += .15; M.splash += .2; } },
  { id: 'prism', name: 'Storm Prism', icon: 'spire', desc: ['Bolts jump twice more.', 'Shock lasts longer.'], fn: M => { M.jumps += 2; M.shockT += 1.5; } },
  { id: 'horn', name: "Drillmaster's Horn", icon: 'guard', desc: ['Every guard post fields', 'one more footman.'], fn: M => { M.guardN += 1; M.guardHp += .1; } },
  { id: 'oil', name: 'Ember Oil', icon: 'oil', desc: ['Burning deals +60%', 'and lasts 2s longer.'], fn: M => { M.burn += .6; M.burnT += 2; } },
  { id: 'ledger', name: "Tinker's Ledger", icon: 'ledger', desc: ['Towers and upgrades', 'cost 12% less.'], fn: M => { M.cost -= .12; } },
  { id: 'signet', name: "Warden's Signet", icon: 'hero', desc: ['Warden health and damage', '+35%. Returns sooner.'], fn: M => { M.heroHp += .35; M.heroDmg += .35; M.heroRevive -= .4; } },
  { id: 'glass', name: 'Beacon Glass', icon: 'flame', desc: ['Beacon +5 health. Mends', '1 after every wave.'], fn: M => { M.lives += 5; M.mend += 1; } },
  { id: 'writ', name: 'Bounty Writ', icon: 'coin', desc: ['Kills pay 15% more gold.'], fn: M => { M.bounty += .15; } },
  { id: 'coil', name: 'Resonance Coil', icon: 'coil', desc: ['Combos hit 40% harder.'], fn: M => { M.combo += .4; } },
  { id: 'lens', name: "Farseer's Lens", icon: 'lens', desc: ['Towers reach 8% farther.'], fn: M => { M.range += .08; } },
  { id: 'seal', name: "Quartermaster's Seal", icon: 'chest', desc: ['Start every land with', '150 more gold.'], fn: M => { M.startGold += 150; } },
];
const RELIC = {}; for (const r of RELICS) RELIC[r.id] = r;
const RELIC_AI = ['coil', 'quiver', 'signet', 'oil', 'prism', 'fuse', 'horn', 'lens', 'writ', 'ledger', 'glass', 'seal'];
function applyMods() { resetMods(); for (const id of RUN.relics) RELIC[id].fn(MOD); G.maxLives = 20 + MOD.lives; }
function offerRelics() {
  const pool = RELICS.filter(r => !RUN.relics.includes(r.id)), picks = []; RUN.bonus = 0;
  if (RUN.relics.length >= 6 || !pool.length) { RUN.bonus = 150; G.gold += 150; RUN.hold = G.phaseT + 2.2; UI.banner('Spoils: +150 gold', 2, false); return; }
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  RUN.offer = { picks, t: 0 };
}
function pickRelic(i) {
  const o = RUN.offer; if (!o || !o.picks[i] || G.phase !== 'clear') return false; const r = o.picks[i], b = G.B.beacon;
  RUN.relics.push(r.id); const was = G.maxLives; applyMods(); G.lives = Math.min(G.maxLives, G.lives + (G.maxLives - was));
  RUN.offer = null; RUN.hold = G.phaseT + 1.5;
  sfx('relic', b.x, b.z, 1); fxTimed(5, b.x, b.y + .6, b.z, 6, 6, 2.6, 2.0, .7, 1, .8); fxEmbers(b.x, b.y, b.z, 40, .8, 1, .8, .3);
  UI.banner(r.name, 2.2, false); return true;
}
function aiRelic() { const o = RUN.offer; let best = 0, bp = 99; o.picks.forEach((r, i) => { const p = RELIC_AI.indexOf(r.id); if (p < bp) { bp = p; best = i; } }); return best; }
function sagaClear() {
  let spent = 0; for (const t of G.towers) if (t.alive) spent += t.spent;
  RUN.salvage = Math.round(spent * .12); RUN.mended = Math.min(6, G.maxLives - G.lives); RUN.offered = false; RUN.offer = null; RUN.hold = 0;
}
function sagaClearTick(dt, t) {
  if (!RUN.offered && t > 1.5) { RUN.offered = true; offerRelics(); if (!RUN.offer && !RUN.hold) RUN.hold = t + 1.2; }
  const o = RUN.offer;
  if (o) { o.t += dt; if (!UI.playerActive() ? o.t > 5.5 : o.t > 40) pickRelic(UI.playerActive() ? 0 : aiRelic()); return false; }
  return RUN.offered && t > RUN.hold;
}
// What a new land starts with. A fresh run starts clean; otherwise the beacon, the purse and the Warden carry over.
function sagaBegin() {
  if (RUN.fresh) { RUN.fresh = false; RUN.relics = []; RUN.combos = {}; applyMods(); HERO.lvl = 1; HERO.xp = 0; HERO.stance = 'van'; G.lives = G.maxLives; G.gold = 300 + 80 * G.level; RUN.salvage = 0; }
  else { G.lives = Math.min(G.maxLives, G.lives + 6); G.gold = Math.round(Math.min(G.gold, 200) + 300 + 80 * G.level + MOD.startGold + RUN.salvage); }
  RUN.landCombos = 0; RUN.texts.length = 0; heroBegin();
}
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
function chapterName() { return 'Chapter ' + (ROMAN[G.level] || (G.level + 1)); }
// Monsters toughen with every land, to keep pace with what the run carries forward.
function threat() { return 1.25 * Math.pow(1.35, G.level); }
