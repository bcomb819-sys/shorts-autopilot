// Compiles a validated Story Blueprint JSON into script.json + src/shots.js for ANY of the 6 faceless-shorts styles.
import fs from 'node:fs';
import path from 'node:path';
import { ALL_STYLES } from '../config.js';

export function buildScriptJson(story, pacing = {}) {
  const meta = ALL_STYLES.find((s) => s.id === story.style) || ALL_STYLES[0];
  const speed = Number(pacing.speed || story.speed || meta.speed || 1.0);
  const gap = pacing.gap != null ? Number(pacing.gap) : (story.style === 'night-file' ? 0.24 : 0.16);
  const lead = pacing.lead != null ? Number(pacing.lead) : 0.12;
  const outro = pacing.outro != null ? Number(pacing.outro) : 0.45;
  return {
    title: story.title,
    voice: story.voice || meta.voice,
    speed: +speed.toFixed(3),
    lead: +lead.toFixed(3),
    outro: +outro.toFixed(3),
    gap: +gap.toFixed(3),
    music: story.music || meta.music,
    sources: story.sources || [],
    lines: story.lines.map((ln, idx) => {
      const obj = { text: ln.text };
      if (ln.caps) obj.caps = ln.caps;
      if (idx === story.lines.length - 1) obj.gap = +(pacing.endGap ?? 0.2).toFixed(3);
      return obj;
    }),
  };
}

// Shared Retention HUD injected into every style:
// 1) Sleek glowing top progress bar (0..100%) keeps viewers watching to completion
// 2) Instant 0..2.4s bold kinetic Hook Banner stops scroll-past in the first 0.5 seconds
function retentionHudSnippet(hookText, accent = '#FFD43B') {
  return `const HOOK_TEXT = ${JSON.stringify(String(hookText || '').toUpperCase().slice(0, 26))};
function drawRetentionHud(t) {
  const dur = Math.max(1, T.dur || 30);
  const pct = clamp(t / dur, 0, 1);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // 1. Sleek top retention progress bar
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, 0, 1080, 12);
  ctx.fillStyle = ${JSON.stringify(accent)};
  ctx.fillRect(0, 0, Math.round(1080 * pct), 12);
  // 2. Instant 0..2.4s scroll-stopper hook pill
  if (HOOK_TEXT && t < 2.55) {
    const enter = eob(clamp(t / 0.16, 0, 1));
    const exit = t > 2.15 ? 1 - clamp((t - 2.15) / 0.4, 0, 1) : 1;
    const sc = lerp(0.82, 1.0, enter);
    ctx.globalAlpha = exit;
    ctx.translate(540, 138);
    ctx.scale(sc, sc);
    let fs = 54;
    ctx.font = '900 ' + fs + 'px Inter, sans-serif';
    while (ctx.measureText(HOOK_TEXT).width > 820 && fs > 30) { fs -= 2; ctx.font = '900 ' + fs + 'px Inter, sans-serif'; }
    const tw = ctx.measureText(HOOK_TEXT).width;
    const pw = tw + 74, ph = fs + 42;
    ctx.fillStyle = 'rgba(10,12,20,0.88)';
    ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = ${JSON.stringify(accent)}; ctx.stroke();
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(HOOK_TEXT, 0, 3);
  }
  ctx.restore();
}`;
}

// Deterministic seed from story key/title so EVERY single video gets its own unique character look,
// color palette, 3D set/world choice, and camera direction — NO TWO VIDEOS EVER LOOK LIKE THE SAME ANIMATION!
function storySeed(story) {
  const str = String(story.key || story.title || 'seed');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

function compileTallTale(story) {
  const data = JSON.stringify(story.lines);
  const seed = storySeed(story);
  const camFlip = seed % 2 === 0 ? 1 : -1;
  const fallbackHero = [
    { body: '#E8734A', hat: 'cap', hatCol: '#2E5A44', band: '#F2C230', neck: 'scarf', neckCol: '#F2C230', extra: ['glasses'] },
    { body: '#3B78C4', hat: 'beanie', hatCol: '#D84A3A', band: '#F5F1E8', neck: 'tie', neckCol: '#F2C230', extra: ['freckles'] },
    { body: '#2E8B6E', hat: 'bun', hatCol: '#4A3123', band: '#F2C230', neck: 'scarf', neckCol: '#E85A4F', extra: ['blush'] },
    { body: '#C84B5A', hat: 'cap', hatCol: '#1F2A44', band: '#8BD186', neck: 'bowtie', neckCol: '#F2C230', extra: ['glasses'] },
    { body: '#7C4DBC', hat: 'boater', hatCol: '#E6C27A', band: '#C84B5A', neck: 'tie', neckCol: '#4FD1E8', extra: ['pencil'] },
  ][seed % 5];
  const fallbackPartner = [
    { body: '#4A5D7A', pattern: 'vest', patCol: '#2E3A4E', hat: 'bowler', hatCol: '#2A2638', band: '#B5372E', neck: 'tie', neckCol: '#B5372E', extra: ['mustache'] },
    { body: '#D48C3B', pattern: 'apron', patCol: '#F4EFE4', hat: 'flower', hatCol: '#E85A4F', band: '#F2C230', neck: 'collar', neckCol: '#FFFFFF', extra: ['blush'] },
    { body: '#3A7A68', pattern: 'check', patCol: '#234E42', hat: 'visor', hatCol: '#243B55', band: '#F2C230', neck: 'none', neckCol: '#F2C230', extra: ['glasses'] },
  ][(seed >> 3) % 3];
  const fallbackExtra = { body: '#3B384A', pattern: 'vest', patCol: '#252230', hat: 'tophat', hatCol: '#252230', band: '#C9A13B', neck: 'bowtie', neckCol: '#D8343F', dots: 1, extra: ['monocle', 'mustache'] };
  // Consistent character designs from the story blueprint across ALL scenes!
  const heroPalette = story.characters?.hero?.look || fallbackHero;
  const sidePalette = story.characters?.partner?.look || fallbackPartner;
  const bossPalette = story.characters?.extra?.look || fallbackExtra;
  const wallThemes = [
    { off: '#2B5E52', offM: '#377164', gal: '#B9463E', galM: '#C95A50' },
    { off: '#2D3E66', offM: '#3A4F80', gal: '#8E3B68', galM: '#A34A7A' },
    { off: '#5E442B', offM: '#755638', gal: '#2E6B5E', galM: '#3C8273' },
    { off: '#3B2F54', offM: '#4D3D6E', gal: '#B86A2E', galM: '#CC7B3B' },
  ][(seed >> 5) % 4];
  const signLabel = String(story.setting || story.hookText || 'MAIN STREET').toUpperCase().slice(0, 18);
  return `// Auto-generated Tall Tale 3D mini-movie shots for: ${JSON.stringify(story.title)}
import * as THREE from 'three';
import { ctx, clamp, lerp, seg, eo, eio, eob } from './core/lib.js';
import { T, L } from './core/timing.js';
import { camera } from './core/engine.js';
import * as WD from './core/world.js';
import * as PR from './core/props.js';
import { Toon, PROPS } from './core/toon.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const mix = (a, b, k) => a.clone().lerp(b, k);
const talk = (t, on = 1) => (on ? 0.22 + 0.78 * Math.abs(Math.sin(t * 14)) * (0.65 + 0.35 * Math.sin(t * 5.7)) : 0);
const blink = (t, off = 0) => (((t + off) % 3.1) < 0.12 ? 1 : 0);
const LINES = ${data};
const CF = ${camFlip};
${retentionHudSnippet(story.hookText, '#F2C230')}

const LOOK = {
  hero: ${JSON.stringify(heroPalette)},
  side: ${JSON.stringify(sidePalette)},
  boss: ${JSON.stringify(bossPalette)},
};
const person = (k) => new Toon({ ...LOOK[k], extra: [...(LOOK[k].extra || [])] });

function resolveProp(name) {
  if (!name || name === 'none') return null;
  if (name === 'dollarBill' || name === 'bill') return PROPS.bill;
  if (name === 'repairBill') return PROPS.paper('BILL');
  if (name === 'book') return PROPS.book('NOTES', 1);
  if (name === 'paper') return PROPS.paper('NOTE');
  if (name === 'sign') return PROPS.sign('LOOK', '#F2C230');
  if (typeof PROPS[name] === 'function' && PROPS[name].length >= 2) return PROPS[name];
  return null;
}

function poseForAction(action, t, isSpeaking, propFn) {
  const wave = Math.sin(t * 7.5) * 9;
  const g = isSpeaking ? 1 : 0.35;
  if (action === 'run') return { legs: 'run', phase: t * 11, lean: 9, armL: [36 * Math.sin(t * 11), 35], armR: [-36 * Math.sin(t * 11), 35], holdR: propFn };
  if (action === 'walk') return { legs: 'walk', phase: t * 6.8, lean: 4, armL: [22 * Math.sin(t * 6.8), 18], armR: propFn ? [44 + wave * 0.4, 118] : [-22 * Math.sin(t * 6.8), 18], holdR: propFn };
  if (action === 'jump') return { legs: 'jump', bob: -Math.abs(Math.sin(t * 7)) * 28, armL: [115, 30], armR: [115, 30], holdR: propFn };
  if (action === 'gasp') return { legs: 'stand', lean: -6, armL: [85, 70], armR: [85, 70], squash: 0.08 * Math.sin(t * 12), holdR: propFn };
  if (action === 'point') return { legs: 'stand', lean: 5, armL: [16, 12], armR: [78 + wave * 0.5, 22], holdR: propFn };
  if (action === 'wave') return { legs: 'stand', armL: [18, 12], armR: [120 + wave * 1.4, 24], holdR: propFn };
  if (action === 'shrug') return { legs: 'stand', armL: [62, 74], armR: [62, 74], bob: Math.sin(t * 5) * 8, holdR: propFn };
  return {
    legs: 'stand',
    bob: Math.sin(t * 3.4) * (isSpeaking ? 6 : 2),
    armL: [18 + wave * 0.4 * g, 16],
    armR: propFn ? [44 + wave * 0.7, 122] : [26 + wave * g, 24 + 24 * g],
    holdR: propFn,
  };
}

const BADGE_BG = { gold: '#F2C230', green: '#8BD186', red: '#E85A4F', cream: '#F5F1E8' };
const BADGE_FG = { gold: '#1F1C33', green: '#1F1C33', red: '#FFFFFF', cream: '#1F1C33' };

function drawBadge(pop, text, sub, color = 'gold') {
  if (pop <= 0 || !text) return;
  const bg = BADGE_BG[color] || '#F2C230', fg = BADGE_FG[color] || '#1F1C33';
  ctx.save(); ctx.translate(540, 315); ctx.rotate(lerp(-0.18, -0.05, eo(pop)));
  const sc = lerp(1.75, 0.86, eob(pop)); ctx.scale(sc, sc); ctx.globalAlpha = Math.min(1, pop * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(-255, -95, 530, 210, 26); ctx.fill();
  ctx.fillStyle = bg; ctx.strokeStyle = '#1F1C33'; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.roundRect(-270, -110, 540, 210, 26); ctx.fill(); ctx.stroke();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let fs = 84; ctx.font = '900 ' + fs + 'px Inter';
  while (ctx.measureText(text).width > 470 && fs > 34) { fs -= 4; ctx.font = '900 ' + fs + 'px Inter'; }
  ctx.fillText(text, 0, sub ? -22 : 4);
  if (sub) { ctx.font = '800 36px Inter'; ctx.fillText(sub, 0, 58); }
  ctx.restore();
}

export function buildShots(E) {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.06);
  const cam = camera(42);
  const LOOKS = {
    street: { bloom: 0.14, aperture: 0, maxblur: 0, fov: 44 },
    room: { bloom: 0.2, aperture: 0, maxblur: 0, fov: 44 },
    field: { bloom: 0.18, aperture: 0, maxblur: 0, fov: 44 },
  };
  const shoot = (scene, people, from, to, at, at2, k, look) => {
    const fov = look.fov || 44;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.position.copy(mix(from, to, k));
    const tgt = at2 ? mix(at, at2, k) : at;
    cam.lookAt(tgt); people.forEach((p) => p.face(cam));
    E.render(scene, cam, { ...look, focus: cam.position.distanceTo(tgt) });
  };

  // Cinematic shot framing around hero (hx, hz) and partner (px, pz): wide | medium | closeup | reaction
  const frameCam = (shot, speaker, hx, hz, px, pz, sgn, k, baseLook) => {
    const midX = (hx + px) / 2, midZ = (hz + pz) / 2;
    const focusHero = speaker === 'partner' ? (shot === 'reaction') : (shot !== 'reaction');
    const fx = focusHero ? hx : px, fz = focusHero ? hz : pz;
    if (shot === 'closeup' || shot === 'reaction') {
      return {
        from: V3(fx + 0.22 * sgn, 1.84, fz + 2.15),
        to: V3(fx - 0.08 * sgn, 1.82, fz + 1.65),
        at: V3(fx, 1.66, fz),
        look: { ...baseLook, fov: 36 },
      };
    }
    if (shot === 'wide') {
      return {
        from: V3(midX + 1.15 * sgn, 2.25, midZ + 5.2),
        to: V3(midX - 0.35 * sgn, 1.98, midZ + 3.85),
        at: V3(midX, 1.48, midZ),
        look: { ...baseLook, fov: 48 },
      };
    }
    // medium two-shot conversation
    return {
      from: V3(midX - 0.45 * sgn, 1.92, midZ + 3.35),
      to: V3(midX + 0.28 * sgn, 1.84, midZ + 2.65),
      at: V3(midX, 1.56, midZ),
      look: { ...baseLook, fov: 42 },
    };
  };

  // Consistent colourful 3D worlds built once for the whole mini-movie
  const ST = WD.mainStreet(E, {});
  const stHero = person('hero'), stSide = person('side');
  ST.scene.add(stHero.group, stSide.group);

  const OFF = WD.interior(E, { w: 7.4, depth: 6.4, h: 4.2, wall: ${JSON.stringify(wallThemes.off)}, motif: ${JSON.stringify(wallThemes.offM)}, floor: '#8A5432', ceiling: '#2A2638', counterOn: false, signText: null, litter: false });
  const dk = PR.desk(2.4); dk.position.set(0.2, 0, -3.2); OFF.scene.add(dk);
  const offHero = person('hero'), offSide = person('side');
  OFF.scene.add(offHero.group, offSide.group);

  const GAL = WD.interior(E, { w: 8.2, depth: 6.8, h: 4.3, wall: ${JSON.stringify(wallThemes.gal)}, motif: ${JSON.stringify(wallThemes.galM)}, floor: '#A8693E', ceiling: '#3A2820', counterOn: true, signText: ${JSON.stringify(signLabel)}, litter: false });
  const galHero = person('hero'), galSide = person('side');
  GAL.scene.add(galHero.group, galSide.group);

  const MD = WD.meadow(E, { sunset: false, fenceOn: true });
  const mdHero = person('hero'), mdSide = person('side');
  MD.scene.add(mdHero.group, mdSide.group);

  const SUN = WD.meadow(E, { sunset: true, fenceOn: true });
  const sunHero = person('hero'), sunSide = person('side');
  sunHero.tint('#FFE6D6'); sunSide.tint('#FFE6D6');
  SUN.scene.add(sunHero.group, sunSide.group);

  // Keep consistent street Z for continuous street scenes
  const streetZ = -14 - (${seed % 3}) * 6;

  LINES.forEach((ln, i) => {
    const st = cut(i);
    const propFn = resolveProp(ln.prop);
    const mood = ln.mood || 'happy';
    const pMood = ln.partnerMood || (mood === 'smug' ? 'shock' : mood === 'angry' ? 'worried' : 'neutral');
    const scType = ln.scene || 'street';
    const shot = ln.shot || (i === 0 ? 'closeup' : 'medium');
    const speaker = ln.speaker || 'narrator';
    const action = ln.action || 'stand';
    const sgn = (i % 2 === 0 ? 1 : -1) * CF;
    add({
      id: 'S' + String(i + 1).padStart(2, '0'),
      at: st,
      note: scType + ' · ' + shot + ' · ' + speaker + ' · ' + mood,
      draw(lt, d, t, blit) {
        const k = eio(clamp(lt / Math.max(0.2, d)));
        const pop = clamp((lt - Math.min(0.4, d * 0.22)) / 0.22);
        const heroSpeaking = speaker === 'hero' || (speaker === 'narrator' && i % 2 === 0);
        const partnerSpeaking = speaker === 'partner' || speaker === 'extra';
        const heroPose = poseForAction(heroSpeaking ? action : 'stand', t, heroSpeaking, heroSpeaking ? propFn : null);
        const partnerPose = poseForAction(partnerSpeaking ? action : 'stand', t + 0.7, partnerSpeaking, partnerSpeaking ? propFn : null);
        const heroState = {
          ...heroPose,
          mood,
          look: [0.45 * CF, Math.sin(t * 2.1) * 0.12],
          talk: talk(t, speaker === 'hero' ? 1 : speaker === 'narrator' ? 0.35 : 0),
          sweat: mood === 'worried' || mood === 'shock',
          tears: mood === 'sad',
          blink: blink(t),
          v: 'h' + i,
        };
        const partnerState = {
          ...partnerPose,
          mood: pMood,
          look: [-0.45 * CF, Math.sin(t * 1.9 + 1) * 0.12],
          talk: talk(t + 0.3, partnerSpeaking ? 1 : 0),
          sweat: pMood === 'worried' || pMood === 'shock',
          tears: pMood === 'sad',
          blink: blink(t, 1.3),
          v: 'p' + i,
        };

        if (scType === 'office') {
          const hx = -0.62 * CF, hz = -2.05, px = 0.58 * CF, pz = -2.35;
          offHero.at(hx, 0, hz); offSide.at(px, 0, pz);
          offHero.set(heroState); offSide.set(partnerState);
          const f = frameCam(shot, speaker, hx, hz, px, pz, sgn, k, LOOKS.room);
          shoot(OFF.scene, [offHero, offSide], f.from, f.to, f.at, null, k, f.look);
        } else if (scType === 'gallery') {
          const hx = -0.6 * CF, hz = -2.1, px = 0.65 * CF, pz = -2.15;
          galHero.at(hx, 0, hz); galSide.at(px, 0, pz);
          galHero.set(heroState); galSide.set(partnerState);
          const f = frameCam(shot, speaker, hx, hz, px, pz, sgn, k, LOOKS.room);
          shoot(GAL.scene, [galHero, galSide], f.from, f.to, f.at, null, k, f.look);
        } else if (scType === 'meadow') {
          const hx = -0.55 * CF, hz = -1.65, px = 0.65 * CF, pz = -1.85;
          mdHero.at(hx, 0, hz); mdSide.at(px, 0, pz);
          mdHero.set(heroState); mdSide.set(partnerState);
          const f = frameCam(shot, speaker, hx, hz, px, pz, sgn, k, LOOKS.field);
          shoot(MD.scene, [mdHero, mdSide], f.from, f.to, f.at, null, k, f.look);
        } else if (scType === 'sunset') {
          const hx = -0.45 * CF, hz = -1.5, px = 0.62 * CF, pz = -1.6;
          sunHero.at(hx, 0, hz); sunSide.at(px, 0, pz);
          sunHero.set(heroState); sunSide.set(partnerState);
          const f = frameCam(shot, speaker, hx, hz, px, pz, sgn, k, LOOKS.field);
          shoot(SUN.scene, [sunHero, sunSide], f.from, f.to, f.at, null, k, f.look);
        } else {
          const hx = -0.58 * CF, hz = streetZ, px = 0.66 * CF, pz = streetZ - 0.35;
          stHero.at(hx, 0, hz); stSide.at(px, 0, pz);
          stHero.set(heroState); stSide.set(partnerState);
          const f = frameCam(shot, speaker, hx, hz, px, pz, sgn, k, LOOKS.street);
          shoot(ST.scene, [...ST.people, stHero, stSide], f.from, f.to, f.at, null, k, f.look);
        }
        blit();
        drawBadge(pop, ln.badge, ln.badgeSub, ln.badgeColor);
        drawRetentionHud(t);
      },
    });
    if (i > 0) cue(st, 'whoosh', { gain: 0.55 });
    cue(st + 0.25, ln.sfx || 'pop', { gain: 0.72 });
  });
  return { shots: S, cues: CUES };
}
`;
}

function compileDeepDive(story) {
  const data = JSON.stringify(story.lines);
  const seed = storySeed(story);
  const humanLook = [
    { skin: '#E3A988', shirt: '#3E7CC9', pants: '#2B3550', hair: '#3A2618' },
    { skin: '#C6865B', shirt: '#C9443E', pants: '#1F2430', hair: '#1A1412' },
    { skin: '#F0C4A8', shirt: '#2E8B6E', pants: '#2A303E', hair: '#5C3A21' },
    { skin: '#8D5524', shirt: '#E09F3E', pants: '#1C2230', hair: '#121010' },
    { skin: '#E5B293', shirt: '#6C4AB6', pants: '#252B3B', hair: '#2B1D14' },
  ][seed % 5];
  const xrayHex = ['#4FD1E8', '#4CFF88', '#FFB020', '#B06CFF', '#38E8C6'][(seed >> 2) % 5];
  const camFlip = seed % 2 === 0 ? 1 : -1;
  return `// Auto-generated Deep Dive 3D shots for: ${JSON.stringify(story.title)}
import * as THREE from 'three';
import { ctx, clamp, lerp, seg, eo, eio, eob } from './core/lib.js';
import { T, L } from './core/timing.js';
import { camera } from './core/engine.js';
import { Human } from './core/human.js';
import * as SETS from './core/sets.js';
import { pill, warning, blackout } from './core/look2d.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lerpV = (a, b, k) => a.clone().lerp(b, k);
const LINES = ${data};
const CF = ${camFlip};
${retentionHudSnippet(story.hookText, xrayHex)}

export function buildShots(E) {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.08);
  const cam = camera(30);
  const KLOOK = { aperture: 0, maxblur: 0, bloom: 0.14, grain: 0.006, vignette: 0.18 };
  const XLOOK = { aperture: 0, maxblur: 0, bloom: 0.45, bloomThreshold: 0.45, grain: 0.006, vignette: 0.32 };
  const VLOOK = { aperture: 0, maxblur: 0, bloom: 0.48, bloomThreshold: 0.55, grain: 0.008, focus: 3.2 };

  const K = SETS.kitchen(E), hero = new Human(${JSON.stringify(humanLook)}); hero.group.position.set(0.1, 0, -0.6); K.scene.add(hero.group);
  const X = SETS.xrayStage(E), xh = new Human(${JSON.stringify(humanLook)}), xmat = SETS.xrayMaterial(); xh.setBodyMaterial(xmat);
  const I = SETS.insides(); xh.spine.add(I.group); X.scene.add(xh.group);
  const VS = SETS.vessel(E);
  const BASE_XRAY = new THREE.Color(${JSON.stringify(xrayHex)}), RED = new THREE.Color('#FF3B3B');
  const chest = (h, k) => h.parts[0].scale.set(1 + 0.03 * k, 1 + 0.012 * k, 1 + 0.08 * k);
  const lungs = (k) => I.lungs.forEach((l) => l.scale.set(1 + 0.12 * k, 1 + 0.1 * k, 1 + 0.12 * k));
  const reset = () => { hero.pose({}); chest(hero, 0); xh.pose({}); chest(xh, 0); lungs(0); I.heart.scale.setScalar(1); xmat.uniforms.uCol.value.copy(BASE_XRAY); };
  const FACE = V3(0.1, 1.68, -0.6);

  LINES.forEach((ln, i) => {
    const st = cut(i);
    const sc = ln.scene || 'kitchen';
    const sgn = (i % 2 === 0 ? 1 : -1) * CF;
    add({
      id: 'S' + String(i + 1).padStart(2, '0'),
      at: st,
      note: sc,
      draw(lt, d, t, blit) {
        reset();
        const k = eio(clamp(lt / Math.max(0.2, d)));
        if (sc === 'xray' || sc === 'xray_alarm') {
          lungs(0.6 + 0.4 * Math.sin(lt * 4)); chest(xh, 0.8);
          if (sc === 'xray_alarm') {
            const p = 0.5 + 0.5 * Math.sin(lt * 8);
            xmat.uniforms.uCol.value.copy(BASE_XRAY).lerp(RED, clamp(lt / 0.6) * (0.55 + 0.45 * p));
            xh.pose({ head: [-3, Math.sin(lt * 2) * 8, 0], lid: -0.35 });
          } else {
            xh.pose({ head: [3, (-6 + k * 12) * sgn, 0] });
          }
          cam.position.copy(lerpV(V3(0.48 * sgn, 1.52, 1.65), V3(-0.24 * sgn, 1.44, 1.12), k));
          cam.lookAt(0, 1.35, 0);
          E.render(X.scene, cam, { ...XLOOK, focus: cam.position.distanceTo(V3(0, 1.35, 0)) });
          blit();
          if (ln.pill) pill(ln.pill, 540, 320, eob(seg(lt, 0.12, 0.38)), ln.pillColor || ${JSON.stringify(xrayHex)});
        } else if (sc === 'vessel' || sc === 'vessel_dark') {
          const dark = sc === 'vessel_dark' ? 0.55 * k : 0.15 * k;
          VS.update(t, -lt * 1.5, sc === 'vessel_dark' ? 0.8 : 0.25, dark);
          cam.position.set(Math.sin(lt * 1.4) * 0.09 * sgn, Math.cos(lt) * 0.04, -lt * 1.5);
          cam.lookAt(0.12 * sgn, -0.05, -lt * 1.5 - 5);
          E.render(VS.scene, cam, VLOOK);
          blit();
          if (ln.pill) pill(ln.pill, 540, 330, eob(seg(lt, 0.12, 0.38)), ln.pillColor || '#FF8A8A');
        } else if (sc === 'heart') {
          const beat = Math.pow(Math.max(0, Math.sin(lt * 8.5)), 6);
          I.heart.scale.setScalar(1 + beat * 0.18);
          I.heart.material.emissiveIntensity = 0.25 + beat * 0.9;
          const H0 = V3(0.025, 1.41, 0.07);
          cam.position.copy(lerpV(V3(0.28 * sgn, 1.48, 0.68), V3(0.1 * sgn, 1.44, 0.44), k));
          cam.lookAt(H0);
          E.render(X.scene, cam, { ...XLOOK, bloom: 0.65, focus: cam.position.distanceTo(H0) });
          blit();
          if (ln.pill) pill(ln.pill, 540, 330, eob(seg(lt, 0.12, 0.38)), ln.pillColor || '#FF8A8A');
        } else if (sc === 'blackout') {
          hero.pose({ head: [10 * k, -4 * sgn, 5 * k], lid: lerp(-0.1, 1.0, k) });
          cam.position.copy(lerpV(V3(-0.28 * sgn, 1.7, 0.28), V3(-0.18 * sgn, 1.62, 0.08), k));
          cam.lookAt(FACE);
          E.render(K.scene, cam, { ...KLOOK, focus: cam.position.distanceTo(FACE) });
          blit();
          blackout(seg(lt, d * 0.45, d));
          if (ln.pill) pill(ln.pill, 540, 330, eob(seg(lt, 0.1, 0.35)), ln.pillColor || '#FF5A5A');
        } else {
          const inh = eo(seg(lt, 0.05, 0.9));
          hero.pose({ head: [-5 * inh, Math.sin(lt * 1.8) * 6 * sgn, 0], lid: sc === 'kitchen_end' ? 0 : -0.25 * inh });
          chest(hero, inh);
          cam.position.copy(lerpV(V3(0.45 * sgn, 1.7, 0.55), V3(0.2 * sgn, 1.66, 0.18), k));
          cam.lookAt(FACE);
          E.render(K.scene, cam, { ...KLOOK, focus: cam.position.distanceTo(FACE) });
          blit();
          if (sc === 'kitchen_end') warning(540, 340, eob(seg(lt, 0.15, 0.4)) * 0.85);
          else if (ln.pill) pill(ln.pill, 540, 320, eob(seg(lt, 0.12, 0.38)), ln.pillColor || '#FFD43B');
        }
        drawRetentionHud(t);
      },
    });
    if (i > 0) cue(st, 'whoosh');
    cue(st + 0.15, ln.sfx || 'pop', { gain: 0.7 });
  });
  return { shots: S, cues: CUES };
}
`;
}

function compileNightFile(story) {
  const data = JSON.stringify(story.lines);
  const seed = storySeed(story);
  // Pick a STORY-MATCHED + SEEDED primary 3D world (corridor, houseNight, or planeCabin) so Night File
  // NEVER looks like the same airplane cabin twice in a row!
  const titleLower = String(story.title || '').toLowerCase();
  const primarySet = /plane|flight|skyjack|cabin|air|pilot/.test(titleLower)
    ? 'cabin'
    : /house|lighthouse|town|village|island|forest|pass|hiker|woods|night/.test(titleLower)
      ? 'house'
      : ['corridor', 'house', 'cabin'][seed % 3];
  const camFlip = seed % 2 === 0 ? 1 : -1;
  return `// Auto-generated Night File 3D shots for: ${JSON.stringify(story.title)} (world: ${primarySet})
import * as THREE from 'three';
import { ctx, setCtx, clamp, lerp, seg, eo, eio, eob } from './core/lib.js';
import { T, L } from './core/timing.js';
import { camera } from './core/engine.js';
import { Human } from './core/human.js';
import * as SETS from './core/sets3d.js';
import * as K from './core/kit.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z), lerpV = (a, b, k) => a.clone().lerp(b, k);
const NIGHT = { exposure: 1.25, bloom: 0.85, bloomThreshold: 0.55, vignette: 0.6, grain: 0.04, warm: 0 };
const LINES = ${data};
const WORLD = ${JSON.stringify(primarySet)};
const CF = ${camFlip};
${retentionHudSnippet(story.hookText, '#E4322B')}

export function buildShots(E) {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.1);
  const cam = camera(34);
  // Build ALL 3 atmospheric worlds lazily: primary world + corridor/house contrast + cork caseWall
  const MAIN = WORLD === 'house' ? SETS.houseNight() : WORLD === 'corridor' ? SETS.corridor() : SETS.planeCabin();
  const ALT = WORLD === 'corridor' ? SETS.houseNight() : SETS.corridor();
  const CW = SETS.caseWall([0, 1, 2].map((k) => {
    const c = document.createElement('canvas'); c.width = 360; c.height = 420;
    const g = c.getContext('2d'), prev = ctx; setCtx(g);
    g.fillStyle = '#D8CFBA'; g.fillRect(0, 0, 360, 420);
    g.save(); g.translate(180, 210); g.scale(1.5, 1.5); K.polaroid(0, 0, 1, 0, ['glow', 'house', 'dark'][(k + ${seed % 3}) % 3]); g.restore();
    setCtx(prev); return c;
  }));
  const person = (kind) => { const h = new Human({ face: false }); h.setAllMaterial(kind === 'subject' ? SETS.subjectMat() : SETS.witnessMat()); return h; };
  const subjM = person('subject'); MAIN.scene.add(subjM.group);
  const subjA = person('witness'); ALT.scene.add(subjA.group);
  const render = (scene, focusP, extra = {}) => {
    if (cam.fov !== (extra.fov || 34)) { cam.fov = extra.fov || 34; cam.updateProjectionMatrix(); }
    E.render(scene, cam, { ...NIGHT, focus: cam.position.distanceTo(focusP), aperture: 0, maxblur: 0, ...extra });
  };

  LINES.forEach((ln, i) => {
    const st = cut(i);
    const sc = ln.scene || 'cabin';
    const sgn = (i % 2 === 0 ? 1 : -1) * CF;
    add({
      id: 'S' + String(i + 1).padStart(2, '0'),
      at: st,
      note: WORLD + '/' + sc,
      draw(lt, d, t, blit) {
        const k = eio(clamp(lt / Math.max(0.2, d)));
        subjM.group.visible = false; subjA.group.visible = false;
        MAIN.update(t, {}); ALT.update(t, {});
        if (sc === 'walk') {
          subjM.group.visible = true; subjM.group.rotation.set(0, 0, 0);
          if (WORLD === 'house') {
            subjM.group.position.set(lerp(-1.4 * CF, 0.8 * CF, k), 0, -2.5); subjM.walk(lt * 4.5, 0.7);
            cam.position.copy(lerpV(V3(1.8 * sgn, 1.7, 3.8), V3(0.4 * sgn, 1.55, 2.2), k)); cam.lookAt(0, 1.3, -3.5);
          } else {
            subjM.group.position.set(0, 0, lerp(-8.5, -3.5, k)); subjM.walk(lt * 4.8, 0.75);
            cam.position.copy(lerpV(V3(0.28 * sgn, 1.5, 0.6), V3(0.16 * sgn, 1.45, -0.3), k)); cam.lookAt(0, 1.2, -6);
          }
          render(MAIN.scene, subjM.group.position.clone().add(V3(0, 1.2, 0))); blit();
        } else if (sc === 'file') {
          cam.position.set(0.3 * sgn, 1.5, WORLD === 'house' ? 3.5 : -2); cam.lookAt(0, 1.2, -10);
          render(MAIN.scene, V3(0, 1, 0), { aperture: 0, maxblur: 0, exposure: 0.85 }); blit();
          K.caseFile(540, 820, 1.22, ln.fileTitle || 'CASE FILE', 0, -0.03 * sgn);
          K.dateStamp(ln.stamp1 || 'CLASSIFIED', ln.stamp2 || 'ARCHIVE', clamp(lt / 1.1), 240, 1000);
        } else if (sc === 'door' || sc === 'vanish') {
          if (WORLD === 'cabin') {
            const fl = Math.sin(t * 13) > 0.93 ? 1 : 0;
            MAIN.update(t, { door: lerp(0.15, 0.9, k), rain: 1, flash: fl });
            cam.position.copy(lerpV(V3(0, 1.72, -9.5), V3(0, 1.66, -10.4), k)); cam.lookAt(0, 1.0, -14.2);
            render(MAIN.scene, V3(0, 1, -14.2), { fov: 56, exposure: 1.3 + fl * 0.45 }); blit();
          } else {
            subjA.group.visible = true;
            subjA.group.position.set(0, 0, WORLD === 'corridor' ? -2.2 : lerp(-11, -6, k));
            subjA.walk(lt * 4.2, 0.65);
            cam.position.copy(lerpV(V3(0.5 * sgn, 1.55, WORLD === 'corridor' ? 4.5 : -1.5), V3(-0.2 * sgn, 1.48, WORLD === 'corridor' ? 2.0 : -3.5), k));
            cam.lookAt(0, 1.25, WORLD === 'corridor' ? -5.5 : -11);
            render(ALT.scene, V3(0, 1.2, -6)); blit();
          }
        } else if (sc === 'casewall') {
          cam.position.copy(lerpV(V3(0.4 * sgn, 0.32, 9.4), V3(-0.1 * sgn, 0.18, 6.9), k)); cam.lookAt(0, 0.2, 0);
          render(CW.scene, V3(0, 0.2, 0), { bloom: 0.4 }); blit();
          if (ln.date1) K.dateStamp(ln.date1, ln.date2 || '', clamp(lt / 1.2), 80, 300);
          if (lt > 0.6) K.redCircle(540, 980, 290, 210, seg(lt, 0.6, 1.2));
          if (ln.stampUnsolved && lt > d * 0.45) K.caseFile(540, 860, 0.95, 'UNSOLVED', 1, 0.04);
        } else {
          if (WORLD === 'house') {
            cam.position.copy(lerpV(V3(-2.2 * sgn, 1.9, 5.2), V3(0.8 * sgn, 1.65, 2.8), k)); cam.lookAt(0, 1.7, -6);
          } else {
            cam.position.copy(lerpV(V3(0.32 * sgn, 1.55, 1.8), V3(-0.15 * sgn, 1.5, 0.4), k)); cam.lookAt(0, 1.1, -10);
          }
          render(MAIN.scene, V3(0, 1, -5)); blit();
          if (ln.date1) K.dateStamp(ln.date1, ln.date2 || '', clamp(lt / 1.3), 80, 300);
        }
        drawRetentionHud(t);
      },
    });
    if (i > 0) cue(st, 'whoosh', { gain: 0.5 });
    cue(st + 0.25, ln.sfx || 'tock', { gain: 0.5 });
  });
  return { shots: S, cues: CUES };
}
`;
}

function compileInsideOut(story) {
  const data = JSON.stringify(story.lines);
  const seed = storySeed(story);
  const accent = ['#FFD43B', '#4FD1E8', '#FF6B6B', '#69F0AE', '#C77DFF'][seed % 5];
  return `// Auto-generated Inside Out 2D shots for: ${JSON.stringify(story.title)}
import { ctx, C, W, H, clamp, lerp, seg, eo, eio, eob, rnd } from './core/lib.js';
import { T, L } from './core/timing.js';
import * as K from './core/kit.js';

const LINES = ${data};
const ACCENT = ${JSON.stringify(accent)};
${retentionHudSnippet(story.hookText, accent)}

export function buildShots() {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.08);

  LINES.forEach((ln, i) => {
    const st = cut(i);
    const sc = ln.scene || 'room';
    const camX = 540 + (i % 2 === 0 ? 1 : -1) * ((i + ${seed}) % 3 === 0 ? 18 : 0);
    const shotZoom = ln.shot === 'closeup' || ln.shot === 'reaction' ? 0.24 : ln.shot === 'wide' ? 0.04 : 0.11;
    add({
      id: 'S' + String(i + 1).padStart(2, '0'),
      at: st,
      cam: [camX, ln.shot === 'closeup' || ln.shot === 'reaction' ? 760 : 860],
      zoom: sc === 'xray' ? Math.max(0.2, shotZoom) : shotZoom,
      note: sc,
      draw(lt, d, t) {
        if (sc === 'xray') {
          K.xray(t);
          const [gx, gy] = K.foodAt(eio(clamp(lt / Math.max(0.2, d))));
          K.man({ x: 540, y: 1120, s: 1.52, xray: true, mouth: 'o', eyes: 'wide', brow: 1, inside: [gx, gy, lt * 2] });
          if (ln.label || ln.pill) K.pill(ln.label || ln.pill, 540, 390, 52, ACCENT, C.ink, eob(seg(lt, 0.12, 0.36)));
        } else if (sc === 'macro' || sc === 'macro_burst') {
          K.insideStomach(t);
          const bob = Math.sin(lt * 3.1) * 18;
          K.heart(540, 820 + bob, 1.7, Math.abs(Math.sin(lt * 4.5)));
          if (sc === 'macro_burst') {
            for (let p = 0; p < 18; p++) {
              const an = rnd(p + 10 + ${seed % 20}) * Math.PI * 2, dd = 120 + eo(clamp(lt / d)) * 360;
              ctx.save(); ctx.globalAlpha = 1 - clamp(lt / d); ctx.fillStyle = p % 2 ? ACCENT : C.white;
              ctx.beginPath(); ctx.arc(540 + Math.cos(an) * dd, 820 + Math.sin(an) * dd * 0.8, 16, 0, 7); ctx.fill(); ctx.restore();
            }
          }
          if (ln.label || ln.pill) K.tag(ln.label || ln.pill, 540, 460, 540, 700 + bob, 58, eob(seg(lt, 0.15, 0.45)));
        } else if (sc === 'bounce') {
          K.xray(t);
          const pulse = Math.abs(Math.sin(lt * 3.8));
          for (let r = 0; r < 3; r++) {
            const ph = (lt * 0.9 + r / 3) % 1;
            ctx.save(); ctx.globalAlpha = 0.45 * (1 - ph); ctx.strokeStyle = r % 2 ? ACCENT : C.cyan; ctx.lineWidth = 10;
            ctx.beginPath(); ctx.arc(540, 820, 120 + ph * 340, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
          }
          K.heart(540, 820, 1.45 + 0.18 * pulse, pulse);
          for (let p = 0; p < 12; p++) {
            const an = p * (Math.PI * 2 / 12) + lt * 0.9, dd = 210 + 55 * Math.sin(lt * 4 + p);
            ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = p % 2 ? C.cyan : ACCENT;
            ctx.beginPath(); ctx.arc(540 + Math.cos(an) * dd, 820 + Math.sin(an) * dd, 14, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          }
          if (ln.label || ln.pill) K.pill(ln.label || ln.pill, 540, 410, 56, ACCENT, C.ink, eob(seg(lt, 0.1, 0.35)));
        } else if (sc === 'myth') {
          ctx.fillStyle = C.navy; ctx.fillRect(-300, -300, W + 600, H + 600);
          K.xray(t);
          const drop = eob(seg(lt, 0, 0.38));
          K.calendar(540, lerp(-380, 790, drop), 1, ln.calNum || 'MYTH', ln.calSub || 'BUSTED', lerp(-0.22, -0.04, drop));
          if (lt > d * 0.4) K.redX(540, 790, lerp(1.9, 1, eo(seg(lt, d * 0.4, d * 0.6))), 1);
        } else if (sc === 'stopwatch') {
          K.xray(t);
          K.stopwatch(540, 760, 1.18, lt * 3.8);
          if (ln.label || ln.pill) K.pill(ln.label || ln.pill, 540, 1130, 54, ACCENT, C.ink, eob(seg(lt, 0.12, 0.38)));
        } else if (sc === 'warning') {
          K.xray(t);
          K.warning(540, 680, eob(seg(lt, 0.08, 0.35)) * (1 + 0.08 * Math.sin(lt * 11)));
          if (ln.label || ln.pill) K.pill(ln.label || ln.pill, 540, 1080, 54, C.red, C.white, eob(seg(lt, 0.2, 0.45)));
        } else if (sc === 'end') {
          K.room();
          K.man({ x: 540, y: 1180, s: 1.62, arm: K.ARM.point, finger: Math.sin(lt * 11) * 0.32, mouth: 'grin', eyes: 'n', smirk: true });
          if (ln.label || ln.pill) K.pill(ln.label || ln.pill, 540, 380, 52, C.ink, ACCENT, eob(seg(lt, 0.1, 0.35)));
        } else {
          K.room();
          const shocked = lt > d * 0.38;
          K.man({ x: 540, y: 1180, s: 1.62, arm: shocked ? K.ARM.mouth : K.ARM.wave, mouth: shocked ? 'o' : 'smile', eyes: shocked ? 'wide' : 'n', brow: shocked ? 1 : 0 });
          if (shocked) K.shockLines(540, 625, 290, clamp((lt - d * 0.38) * 4));
        }
        drawRetentionHud(t);
      },
    });
    if (i > 0) cue(st, 'whoosh');
    cue(st + 0.25, ln.sfx || 'pop', { gain: 0.75 });
  });
  return { shots: S, cues: CUES };
}
`;
}

function compileStickStory(story) {
  const data = JSON.stringify(story.lines);
  const seed = storySeed(story);
  const capCol = ['#E2574C', '#3B82F6', '#F2B23E', '#10B981', '#A855F7'][seed % 5];
  const accent = ['#4CD97B', '#F2B23E', '#FF5A5A', '#4FD1E8'][(seed >> 2) % 4];
  return `// Auto-generated Stick Story 2D shots for: ${JSON.stringify(story.title)}
import { ctx, W, H, clamp, lerp, seg, eo, eio, eob } from './core/lib.js';
import { T, L } from './core/timing.js';
import * as K from './core/kit.js';
const { P, GROUND } = K;
const LINES = ${data};
const CAP = ${JSON.stringify(capCol)};
${retentionHudSnippet(story.hookText, accent)}

export function buildShots() {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.08);
  const blink = (t) => ((t % 3.1) < 0.12 ? 1 : 0);

  LINES.forEach((ln, i) => {
    const st = cut(i);
    const sc = ln.scene || 'night_living';
    const dir = ((i + ${seed}) % 2 === 0) ? 1 : -1;
    const shotZoom = ln.shot === 'closeup' || ln.shot === 'reaction' ? 0.22 : ln.shot === 'wide' ? 0.04 : 0.1;
    add({
      id: 'S' + String(i + 1).padStart(2, '0'),
      at: st,
      cam: [540, ln.shot === 'closeup' || ln.shot === 'reaction' ? 920 : 1060],
      zoom: shotZoom,
      note: sc,
      draw(lt, d, t) {
        const k = eio(clamp(lt / Math.max(0.2, d)));
        if (sc === 'counter') {
          ctx.fillStyle = P.wall; ctx.fillRect(-300, -300, W + 600, H + 600);
          const l3 = ln.lines3 || ['STAY CALM', 'ACT FAST', 'SURVIVE'];
          K.counterPill(l3[0], 540, 480, eob(seg(lt, 0.08, 0.32)) * 1.4);
          K.counterPill(l3[1], 540, 680, eob(seg(lt, 0.35, 0.6)) * 1.25);
          K.counterPill(l3[2], 540, 870, eob(seg(lt, 0.65, 0.9)) * 1.25);
          K.person({ x: 340, y: 1540, h: 630, mood: 'determined', cap: CAP, look: [1, -0.4] });
          K.person({ x: 740, y: 1540, h: 610, mood: 'happy', dir: -1, look: [-1, -0.4], cap: '#22304A' });
        } else {
          const night = sc !== 'day_living';
          if (sc === 'night_kitchen') K.kitchen({ night: true });
          else if (sc === 'night_hall') K.hallway({ night: true });
          else K.livingRoom({ night, lampOn: !night });
          if (night) { ctx.fillStyle = 'rgba(5,8,18,0.34)'; ctx.fillRect(-300, -300, W + 600, H + 600); }
          const moving = i > 0 && i < LINES.length - 1;
          K.person({
            glow: night,
            x: moving ? lerp(540 - 110 * dir, 540 + 80 * dir, k) : 520,
            y: GROUND,
            h: 840,
            dir,
            cap: CAP,
            lean: ln.mood === 'scared' ? -10 : moving ? 8 : 0,
            walk: moving ? lt * 7.5 : null,
            mood: ln.mood || (night ? 'determined' : 'happy'),
            look: [Math.sin(lt * 2.5) * 0.5, -0.15],
            blink: blink(t),
            arms: moving ? undefined : { L: [-15, 22], R: [60 + Math.sin(lt * 6) * 18, 28] },
          });
          if (ln.step) K.stepCard(ln.step[0], ln.step[1], 540, 315, eob(seg(lt, 0.06, 0.3)));
          else if (ln.pill || ln.badge) K.counterPill(ln.pill || ln.badge, 540, 315, eob(seg(lt, 0.08, 0.32)));
          if (ln.cross && lt > 0.35) K.cross(790, 820, eob(seg(lt, 0.35, 0.6)));
          if (ln.check && lt > 0.35) K.check(790, 820, eob(seg(lt, 0.35, 0.6)));
        }
        drawRetentionHud(t);
      },
    });
    if (i > 0) cue(st, 'whoosh');
    cue(st + 0.15, ln.sfx || 'pop', { gain: 0.7 });
  });
  return { shots: S, cues: CUES };
}
`;
}

function compilePaperAtlas(story) {
  const data = JSON.stringify(story.lines);
  const seed = storySeed(story);
  const mapHighlight = seed % 3;
  const mapLabels = [
    [['CAPITAL', 420, 640], ['FRONTIER', 720, 1040]],
    [['FORTRESS', 360, 560], ['SEA ROUTE', 740, 1060]],
    [['EMPIRE', 400, 620], ['BATTLEFIELD', 700, 1020]],
  ][(seed >> 2) % 3];
  const roles = ['scholar', 'merchant', 'worker'];
  return `// Auto-generated Paper Atlas 2D shots for: ${JSON.stringify(story.title)}
import { ctx, W, H, TAU, clamp, lerp, seg, eo, eio, eob, rnd, circle } from './core/lib.js';
import { T, L } from './core/timing.js';
import * as K from './core/kit.js';
const { P, cut, P_rr } = K;
const LINES = ${data};
${retentionHudSnippet(story.hookText, '#E6B84A')}

function nightPage(seed) {
  K.parchment(seed); ctx.save(); ctx.globalAlpha = 0.84; ctx.fillStyle = '#262E4A';
  ctx.fillRect(-300, -300, W + 600, H + 600); ctx.restore();
  for (let i = 0; i < 32; i++) circle(rnd(i + seed) * W, rnd(i + 40 + seed) * 900, 3 + rnd(i) * 3.5, '#F5E4B3');
}

export function buildShots() {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut_ = (i) => (i === 0 ? 0 : L(i) - 0.08);

  LINES.forEach((ln, i) => {
    const st = cut_(i);
    const sc = ln.scene || 'map';
    const roleA = ln.role || ${JSON.stringify(roles)}[(i + ${seed}) % 3];
    const roleB = ${JSON.stringify(roles)}[(i + 1 + ${seed}) % 3];
    const shotZoom = ln.shot === 'closeup' || ln.shot === 'reaction' ? 0.2 : ln.shot === 'wide' ? 0.04 : 0.1;
    add({
      id: 'S' + String(i + 1).padStart(2, '0'),
      at: st,
      cam: [540, 940],
      zoom: shotZoom,
      note: sc,
      draw(lt, d, t) {
        const p = eio(clamp(lt / Math.max(0.2, d)));
        if (sc === 'map') {
          K.map({ seed: ${seed % 19} + i, highlight: (${mapHighlight} + i) % 3, route: p, labels: ${JSON.stringify(mapLabels)} });
          if (ln.year || ln.badge) K.ribbon(ln.year || ln.badge, 540, 330, eob(seg(lt, 0.08, 0.4)));
          if (ln.slip) K.slip(ln.slip, 540, 500, eob(seg(lt, 0.25, 0.55)), -0.02);
        } else if (sc === 'harbor') {
          K.harbor(t, lerp(140, 880, p));
          if (ln.slip || ln.badge) K.slip(ln.slip || ln.badge, 540, 340, eob(seg(lt, 0.12, 0.4)), 0.02);
        } else if (sc === 'hall') {
          K.hall();
          K.figure({ x: 370, y: 1480, h: 720, role: roleA, arm: 25 + Math.sin(lt * 8) * 18 });
          K.figure({ x: 730, y: 1480, h: 680, role: roleB, dir: -1, arm: 20 + Math.cos(lt * 7) * 16 });
          if (ln.slip || ln.badge) K.slip(ln.slip || ln.badge, 540, 330, eob(seg(lt, 0.12, 0.4)), -0.02);
        } else if (sc === 'timeline') {
          K.parchment(i + 2 + ${seed % 11});
          const lbls = ln.labels || ['THE PLAN', 'THE CLASH', 'THE TWIST', 'LEGACY'];
          K.timeline(lbls, 140, 480, 800, p, Math.min(lbls.length - 1, Math.floor(p * lbls.length)));
          K.figure({ x: lerp(380, 680, p), y: 1460, h: 640, role: roleA, walk: lt * 6 });
        } else if (sc === 'seal') {
          K.parchment(i + 7 + ${seed % 11});
          K.seal(540, 760, eob(seg(lt, 0.1, 0.45)) * 1.4, ln.letter || String(${JSON.stringify(story.title || 'H')}).slice(0, 1).toUpperCase());
          if (ln.slip || ln.badge) K.slip(ln.slip || ln.badge, 540, 1180, eob(seg(lt, 0.28, 0.58)), -0.03);
        } else {
          nightPage(i + 1 + ${seed % 13});
          cut(P_rr(-300, 1420, W + 600, 800, 0), '#4A3A2E', { shadow: 0, edge: 0 });
          K.figure({ x: lerp(360, 560, p), y: 1420, h: 650, role: roleA, walk: lt * 5.5, arm: 32 + Math.sin(lt * 7) * 18 });
          if (ln.slip || ln.badge) K.slip(ln.slip || ln.badge, 540, 350, eob(seg(lt, 0.12, 0.4)), 0.02);
        }
        drawRetentionHud(t);
      },
    });
    if (i > 0) cue(st, 'whoosh');
    cue(st + 0.15, ln.sfx || 'pop', { gain: 0.7 });
  });
  return { shots: S, cues: CUES };
}
`;
}

export function writeProjectFiles(projDir, story, pacing = {}) {
  const scriptObj = buildScriptJson(story, pacing);
  fs.writeFileSync(path.join(projDir, 'script.json'), JSON.stringify(scriptObj, null, 2));

  let shotsCode;
  switch (story.style) {
    case 'tall-tale': shotsCode = compileTallTale(story); break;
    case 'deep-dive': shotsCode = compileDeepDive(story); break;
    case 'night-file': shotsCode = compileNightFile(story); break;
    case 'inside-out': shotsCode = compileInsideOut(story); break;
    case 'stick-story': shotsCode = compileStickStory(story); break;
    case 'paper-atlas': shotsCode = compilePaperAtlas(story); break;
    default: shotsCode = compileTallTale(story);
  }
  fs.writeFileSync(path.join(projDir, 'src', 'shots.js'), shotsCode, 'utf8');
}
