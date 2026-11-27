// Compiles a validated Story Blueprint JSON into script.json + src/shots.js for ANY of the 6 faceless-shorts styles.
import fs from 'node:fs';
import path from 'node:path';
import { ALL_STYLES } from '../config.js';

export function buildScriptJson(story) {
  const meta = ALL_STYLES.find((s) => s.id === story.style) || ALL_STYLES[0];
  return {
    title: story.title,
    voice: story.voice || meta.voice,
    speed: story.speed || meta.speed,
    lead: 0.25,
    outro: 0.9,
    gap: story.style === 'night-file' ? 0.34 : 0.18,
    music: story.music || meta.music,
    sources: story.sources || [],
    lines: story.lines.map((ln, idx) => {
      const obj = { text: ln.text };
      if (ln.caps) obj.caps = ln.caps;
      if (idx === story.lines.length - 1) obj.gap = 0.35;
      return obj;
    }),
  };
}

function compileTallTale(story) {
  const data = JSON.stringify(story.lines);
  return `// Auto-generated Tall Tale 3D shots for: ${JSON.stringify(story.title)}
import * as THREE from 'three';
import { ctx, clamp, lerp, seg, eo, eio, eob } from './core/lib.js';
import { L } from './core/timing.js';
import { camera } from './core/engine.js';
import * as WD from './core/world.js';
import * as PR from './core/props.js';
import { Toon, PROPS } from './core/toon.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const mix = (a, b, k) => a.clone().lerp(b, k);
const talk = (t, on = 1) => (on ? 0.25 + 0.75 * Math.abs(Math.sin(t * 13)) * (0.6 + 0.4 * Math.sin(t * 5.3)) : 0);
const blink = (t, off = 0) => (((t + off) % 3.2) < 0.12 ? 1 : 0);
const LINES = ${data};

const LOOK = {
  hero: { body: '#E8734A', hat: 'cap', hatCol: '#2E5A44', band: '#F2C230', neck: 'scarf', neckCol: '#F2C230', extra: ['glasses'] },
  side: { body: '#4A5D7A', pattern: 'vest', patCol: '#2E3A4E', hat: 'bowler', hatCol: '#2A2638', band: '#B5372E', neck: 'tie', neckCol: '#B5372E', extra: ['mustache'] },
  boss: { body: '#3B384A', pattern: 'vest', patCol: '#252230', hat: 'tophat', hatCol: '#252230', band: '#C9A13B', neck: 'bowtie', neckCol: '#D8343F', dots: 1, extra: ['monocle', 'mustache'] },
};
const person = (k) => new Toon({ ...LOOK[k], extra: [...(LOOK[k].extra || [])] });

function resolveProp(name) {
  if (!name) return null;
  if (name === 'dollarBill' || name === 'bill') return PROPS.bill;
  if (name === 'repairBill') return PROPS.paper('BILL');
  if (name === 'book') return PROPS.book('RULES', 1);
  if (name === 'paper') return PROPS.paper('NEWS');
  if (name === 'sign') return PROPS.sign('VOTE', '#F2C230');
  if (typeof PROPS[name] === 'function' && PROPS[name].length >= 2) return PROPS[name];
  return PROPS.bill;
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
    if (cam.fov !== (look.fov || 44)) { cam.fov = look.fov || 44; cam.updateProjectionMatrix(); }
    cam.position.copy(mix(from, to, k));
    const tgt = at2 ? mix(at, at2, k) : at;
    cam.lookAt(tgt); people.forEach((p) => p.face(cam));
    E.render(scene, cam, { ...look, focus: cam.position.distanceTo(tgt) });
  };

  // Sets built once
  const ST = WD.mainStreet(E, {});
  const stHero = person('hero'), stSide = person('side');
  ST.scene.add(stHero.group, stSide.group);

  const OFF = WD.interior(E, { w: 7.4, depth: 6.4, h: 4.2, wall: '#2B5E52', motif: '#377164', floor: '#8A5432', ceiling: '#2A2638', counterOn: false, signText: null, litter: true });
  const dk = PR.desk(2.4); dk.position.set(0.2, 0, -3.2); OFF.scene.add(dk);
  const offHero = person('hero'), offBoss = person('boss');
  OFF.scene.add(offHero.group, offBoss.group);

  const GAL = WD.interior(E, { w: 8.2, depth: 6.8, h: 4.3, wall: '#B9463E', motif: '#C95A50', floor: '#A8693E', ceiling: '#3A2820', counterOn: true, signText: 'DEAL OF THE CENTURY', litter: false });
  const galHero = person('hero'), galSide = person('side');
  GAL.scene.add(galHero.group, galSide.group);

  const MD = WD.meadow(E, { sunset: false, fenceOn: true });
  const mdHero = person('hero'), mdSide = person('side');
  MD.scene.add(mdHero.group, mdSide.group);

  const SUN = WD.meadow(E, { sunset: true, fenceOn: true });
  const sunHero = person('hero'); sunHero.tint('#FFE6D6'); SUN.scene.add(sunHero.group);

  LINES.forEach((ln, i) => {
    const st = cut(i);
    const propFn = resolveProp(ln.prop);
    const mood = ln.mood || 'happy';
    const scType = ln.scene || 'street';
    add({
      id: 'S' + String(i + 1).padStart(2, '0'),
      at: st,
      note: scType + ' · ' + mood,
      draw(lt, d, t, blit) {
        const k = eio(clamp(lt / Math.max(0.2, d)));
        const wave = Math.sin(t * 8) * 6;
        const pop = clamp((lt - Math.min(0.45, d * 0.25)) / 0.22);
        if (scType === 'office') {
          offHero.at(-0.55, 0, -2.05); offBoss.at(0.45, 0, -3.95);
          offHero.set({ mood, armR: [44 + wave, 122], holdR: propFn, armL: [24, 10], talk: talk(t, 0.7), blink: blink(t), v: 'o' + i });
          offBoss.set({ mood: mood === 'angry' ? 'angry' : mood === 'smug' ? 'shock' : 'neutral', armL: [35, -20], armR: [35, -20], blink: blink(t, 1.2) });
          shoot(OFF.scene, [offHero, offBoss], V3(-0.45, 1.95, 2.3), V3(0.15, 1.82, 1.2), V3(0, 1.5, -2.9), null, k, LOOKS.room);
        } else if (scType === 'gallery') {
          galHero.at(-0.55, 0, -2.1); galSide.at(0.62, 0, -2.15);
          galHero.set({ mood, armR: [44 + wave, 122], holdR: propFn, armL: [30, 10], blink: blink(t), v: 'g' + i });
          galSide.set({ mood: 'laugh', armL: [44, 118], holdL: PROPS.stack, blink: blink(t, 0.9), v: 'gs' + i });
          shoot(GAL.scene, [galHero, galSide], V3(-0.6, 1.95, 2.7), V3(0.2, 1.8, 1.55), V3(0, 1.48, -2.15), null, k, LOOKS.room);
        } else if (scType === 'meadow') {
          mdHero.at(-0.45, 0, -1.6); mdSide.at(0.65, 0, -1.9);
          mdHero.set({ mood, legs: k < 0.7 ? 'walk' : 'stand', phase: t * 7, armR: [44 + wave, 122], holdR: propFn, blink: blink(t), v: 'm' + i });
          mdSide.set({ mood: 'happy', armL: [40, 10], blink: blink(t, 1.4) });
          shoot(MD.scene, [mdHero, mdSide], V3(-0.9, 1.9, 3.6), V3(0.2, 1.75, 2.2), V3(0.05, 1.4, -1.7), null, k, LOOKS.field);
        } else if (scType === 'sunset') {
          sunHero.at(0, 0, lerp(-2.2, -1.0, k));
          sunHero.set({ mood, legs: k < 0.65 ? 'walk' : 'stand', phase: t * 7, armR: [44 + wave, 124], holdR: propFn, armL: [26, 10], blink: blink(t), v: 'su' + i });
          shoot(SUN.scene, [sunHero], V3(-0.9, 1.95, 3.8), V3(0.0, 1.75, 2.15), V3(0, 1.5, -1.4), null, k, LOOKS.field);
        } else {
          const z = -12 - (i % 3) * 8;
          stHero.at(-0.5, 0, z); stSide.at(0.65, 0, z - 0.5);
          stHero.set({ mood, legs: i === 0 ? 'stand' : 'walk', phase: t * 7, armR: [44 + wave, 124], holdR: propFn, armL: [24, 10], blink: blink(t), v: 'st' + i });
          stSide.set({ mood: mood === 'smug' ? 'shock' : 'happy', armL: [35, 10], blink: blink(t, 1.1) });
          shoot(ST.scene, [...ST.people, stHero, stSide], V3(0.8, 2.1, z + 5.2), V3(-0.15, 1.8, z + 3.2), V3(0, 1.45, z), null, k, LOOKS.street);
        }
        blit();
        drawBadge(pop, ln.badge, ln.badgeSub, ln.badgeColor);
      },
    });
    if (i > 0) cue(st, 'whoosh', { gain: 0.7 });
    cue(st + 0.35, ln.sfx || 'pop', { gain: 0.8 });
  });
  return { shots: S, cues: CUES };
}
`;
}

function compileDeepDive(story) {
  const data = JSON.stringify(story.lines);
  return `// Auto-generated Deep Dive 3D shots for: ${JSON.stringify(story.title)}
import * as THREE from 'three';
import { clamp, lerp, seg, eo, eio, eob } from './core/lib.js';
import { L } from './core/timing.js';
import { camera } from './core/engine.js';
import { Human } from './core/human.js';
import * as SETS from './core/sets.js';
import { pill, warning, blackout } from './core/look2d.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lerpV = (a, b, k) => a.clone().lerp(b, k);
const LINES = ${data};

export function buildShots(E) {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.08);
  const cam = camera(30);
  const KLOOK = { aperture: 0, maxblur: 0, bloom: 0.14, grain: 0.006, vignette: 0.18 };
  const XLOOK = { aperture: 0, maxblur: 0, bloom: 0.45, bloomThreshold: 0.45, grain: 0.006, vignette: 0.32 };
  const VLOOK = { aperture: 0, maxblur: 0, bloom: 0.48, bloomThreshold: 0.55, grain: 0.008, focus: 3.2 };

  const K = SETS.kitchen(E), hero = new Human({}); hero.group.position.set(0.1, 0, -0.6); K.scene.add(hero.group);
  const X = SETS.xrayStage(E), xh = new Human({}), xmat = SETS.xrayMaterial(); xh.setBodyMaterial(xmat);
  const I = SETS.insides(); xh.spine.add(I.group); X.scene.add(xh.group);
  const VS = SETS.vessel(E);
  const CYAN = new THREE.Color('#4FD1E8'), RED = new THREE.Color('#FF3B3B');
  const chest = (h, k) => h.parts[0].scale.set(1 + 0.03 * k, 1 + 0.012 * k, 1 + 0.08 * k);
  const lungs = (k) => I.lungs.forEach((l) => l.scale.set(1 + 0.12 * k, 1 + 0.1 * k, 1 + 0.12 * k));
  const reset = () => { hero.pose({}); chest(hero, 0); xh.pose({}); chest(xh, 0); lungs(0); I.heart.scale.setScalar(1); xmat.uniforms.uCol.value.copy(CYAN); };
  const FACE = V3(0.1, 1.68, -0.6);

  LINES.forEach((ln, i) => {
    const st = cut(i);
    const sc = ln.scene || 'kitchen';
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
            xmat.uniforms.uCol.value.copy(CYAN).lerp(RED, clamp(lt / 0.6) * (0.55 + 0.45 * p));
            xh.pose({ head: [-3, Math.sin(lt * 2) * 8, 0], lid: -0.35 });
          } else {
            xh.pose({ head: [3, -6 + k * 8, 0] });
          }
          cam.position.copy(lerpV(V3(0.45, 1.5, 1.65), V3(-0.2, 1.45, 1.15), k));
          cam.lookAt(0, 1.35, 0);
          E.render(X.scene, cam, { ...XLOOK, focus: cam.position.distanceTo(V3(0, 1.35, 0)) });
          blit();
          if (ln.pill) pill(ln.pill, 540, 320, eob(seg(lt, 0.12, 0.38)), ln.pillColor || '#4FD1E8');
        } else if (sc === 'vessel' || sc === 'vessel_dark') {
          const dark = sc === 'vessel_dark' ? 0.55 * k : 0.15 * k;
          VS.update(t, -lt * 1.4, sc === 'vessel_dark' ? 0.8 : 0.25, dark);
          cam.position.set(Math.sin(lt) * 0.08, 0, -lt * 1.4);
          cam.lookAt(0.12, -0.05, -lt * 1.4 - 5);
          E.render(VS.scene, cam, VLOOK);
          blit();
          if (ln.pill) pill(ln.pill, 540, 330, eob(seg(lt, 0.12, 0.38)), ln.pillColor || '#FF8A8A');
        } else if (sc === 'heart') {
          const beat = Math.pow(Math.max(0, Math.sin(lt * 8)), 6);
          I.heart.scale.setScalar(1 + beat * 0.16);
          I.heart.material.emissiveIntensity = 0.2 + beat * 0.85;
          const H0 = V3(0.025, 1.41, 0.07);
          cam.position.copy(lerpV(V3(0.28, 1.48, 0.68), V3(0.12, 1.44, 0.45), k));
          cam.lookAt(H0);
          E.render(X.scene, cam, { ...XLOOK, bloom: 0.65, focus: cam.position.distanceTo(H0), aperture: 0.004 });
          blit();
          if (ln.pill) pill(ln.pill, 540, 330, eob(seg(lt, 0.12, 0.38)), ln.pillColor || '#FF8A8A');
        } else if (sc === 'blackout') {
          hero.pose({ head: [10 * k, -4, 5 * k], lid: lerp(-0.1, 1.0, k) });
          cam.position.copy(lerpV(V3(-0.25, 1.7, 0.28), V3(-0.18, 1.62, 0.08), k));
          cam.lookAt(FACE);
          E.render(K.scene, cam, { ...KLOOK, focus: cam.position.distanceTo(FACE) });
          blit();
          blackout(seg(lt, d * 0.45, d));
          if (ln.pill) pill(ln.pill, 540, 330, eob(seg(lt, 0.1, 0.35)), ln.pillColor || '#FF5A5A');
        } else {
          const inh = eo(seg(lt, 0.05, 0.9));
          hero.pose({ head: [-5 * inh, Math.sin(lt * 1.6) * 5, 0], lid: sc === 'kitchen_end' ? 0 : -0.25 * inh });
          chest(hero, inh);
          cam.position.copy(lerpV(V3(0.45, 1.7, 0.55), V3(0.22, 1.66, 0.18), k));
          cam.lookAt(FACE);
          E.render(K.scene, cam, { ...KLOOK, focus: cam.position.distanceTo(FACE) });
          blit();
          if (sc === 'kitchen_end') warning(540, 340, eob(seg(lt, 0.15, 0.4)) * 0.85);
          else if (ln.pill) pill(ln.pill, 540, 320, eob(seg(lt, 0.12, 0.38)), ln.pillColor || '#FFD43B');
        }
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
  return `// Auto-generated Night File 3D shots for: ${JSON.stringify(story.title)}
import * as THREE from 'three';
import { ctx, setCtx, clamp, lerp, seg, eo, eio } from './core/lib.js';
import { L } from './core/timing.js';
import { camera } from './core/engine.js';
import { Human } from './core/human.js';
import * as SETS from './core/sets3d.js';
import * as K from './core/kit.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z), lerpV = (a, b, k) => a.clone().lerp(b, k);
const NIGHT = { exposure: 1.25, bloom: 0.85, bloomThreshold: 0.55, vignette: 0.6, grain: 0.05, warm: 0 };
const LINES = ${data};

export function buildShots(E) {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.1);
  const cam = camera(34);
  const C = SETS.planeCabin();
  const CW = SETS.caseWall([0, 1, 2].map((k) => {
    const c = document.createElement('canvas'); c.width = 360; c.height = 420;
    const g = c.getContext('2d'), prev = ctx; setCtx(g);
    g.fillStyle = '#D8CFBA'; g.fillRect(0, 0, 360, 420);
    g.save(); g.translate(180, 210); g.scale(1.5, 1.5); K.polaroid(0, 0, 1, 0, ['glow', 'house', 'dark'][k]); g.restore();
    setCtx(prev); return c;
  }));
  const person = (kind) => { const h = new Human({ face: false }); h.setAllMaterial(kind === 'subject' ? SETS.subjectMat() : SETS.witnessMat()); return h; };
  const subj = person('subject'); C.scene.add(subj.group);
  const render = (scene, focusP, extra = {}) => {
    if (cam.fov !== (extra.fov || 34)) { cam.fov = extra.fov || 34; cam.updateProjectionMatrix(); }
    E.render(scene, cam, { ...NIGHT, focus: cam.position.distanceTo(focusP), aperture: 0, maxblur: 0, ...extra });
  };

  LINES.forEach((ln, i) => {
    const st = cut(i);
    const sc = ln.scene || 'cabin';
    add({
      id: 'S' + String(i + 1).padStart(2, '0'),
      at: st,
      note: sc,
      draw(lt, d, t, blit) {
        const k = eio(clamp(lt / Math.max(0.2, d)));
        subj.group.visible = false; C.update(t, {});
        if (sc === 'walk') {
          subj.group.visible = true; subj.group.rotation.set(0, 0, 0);
          subj.group.position.set(0, 0, lerp(-7.2, -3.2, k)); subj.walk(lt * 4.8, 0.75);
          cam.position.copy(lerpV(V3(0.25, 1.5, 0.5), V3(0.18, 1.45, -0.2), k)); cam.lookAt(0, 1.2, -6);
          render(C.scene, subj.group.position.clone().add(V3(0, 1.2, 0))); blit();
        } else if (sc === 'file') {
          cam.position.set(0, 1.5, -2); cam.lookAt(0, 1.1, -12);
          render(C.scene, V3(0, 1, 0), { aperture: 0, maxblur: 0, exposure: 0.9 }); blit();
          K.caseFile(540, 820, 1.22, ln.fileTitle || 'CASE FILE', 0, -0.03);
          K.dateStamp(ln.stamp1 || 'CLASSIFIED', ln.stamp2 || 'ARCHIVE', clamp(lt / 1.1), 240, 1000);
        } else if (sc === 'door') {
          const fl = Math.sin(t * 13) > 0.93 ? 1 : 0;
          C.update(t, { door: lerp(0.15, 0.9, k), rain: 1, flash: fl });
          cam.position.copy(lerpV(V3(0, 1.72, -9.5), V3(0, 1.66, -10.4), k)); cam.lookAt(0, 1.0, -14.2);
          render(C.scene, V3(0, 1, -14.2), { fov: 58, exposure: 1.3 + fl * 0.45 }); blit();
        } else if (sc === 'casewall') {
          cam.position.copy(lerpV(V3(0.35, 0.3, 9.4), V3(0.1, 0.2, 7.0), k)); cam.lookAt(0, 0.2, 0);
          render(CW.scene, V3(0, 0.2, 0), { bloom: 0.4 }); blit();
          if (ln.date1) K.dateStamp(ln.date1, ln.date2 || '', clamp(lt / 1.2), 80, 300);
          if (lt > 0.6) K.redCircle(540, 980, 290, 210, seg(lt, 0.6, 1.2));
          if (ln.stampUnsolved && lt > d * 0.45) K.caseFile(540, 860, 0.95, 'CLOSED · OPEN', 1, 0.04);
        } else {
          cam.position.copy(lerpV(V3(0.3, 1.55, 1.8), V3(0.12, 1.5, 0.5), k)); cam.lookAt(0, 1.1, -10);
          render(C.scene, V3(0, 1, -5)); blit();
          if (ln.date1) K.dateStamp(ln.date1, ln.date2 || '', clamp(lt / 1.3), 80, 300);
        }
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
  return `// Auto-generated Inside Out 2D shots for: ${JSON.stringify(story.title)}
import { ctx, C, W, H, clamp, lerp, seg, eo, eio, eob, rnd } from './core/lib.js';
import { L } from './core/timing.js';
import * as K from './core/kit.js';

const LINES = ${data};

export function buildShots() {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.08);

  LINES.forEach((ln, i) => {
    const st = cut(i);
    const sc = ln.scene || 'room';
    add({
      id: 'S' + String(i + 1).padStart(2, '0'),
      at: st,
      cam: [540, 860],
      zoom: sc === 'xray' ? 0.2 : 0.08,
      note: sc,
      draw(lt, d, t) {
        if (sc === 'xray') {
          K.xray(t);
          const [gx, gy] = K.foodAt(eio(clamp(lt / Math.max(0.2, d))));
          K.man({ x: 540, y: 1120, s: 1.5, xray: true, mouth: 'o', eyes: 'wide', brow: 1, inside: [gx, gy, lt * 2] });
        } else if (sc === 'macro' || sc === 'macro_burst') {
          K.insideStomach(t);
          const bob = Math.sin(lt * 2.8) * 16;
          K.gum(540, 820 + bob, 3.3, Math.sin(lt * 1.8) * 0.14);
          if (sc === 'macro_burst') {
            for (let p = 0; p < 18; p++) {
              const an = rnd(p + 10) * Math.PI * 2, dd = 120 + eo(clamp(lt / d)) * 340;
              ctx.save(); ctx.globalAlpha = 1 - clamp(lt / d); ctx.fillStyle = p % 2 ? C.yellow : C.white;
              ctx.beginPath(); ctx.arc(540 + Math.cos(an) * dd, 820 + Math.sin(an) * dd * 0.8, 16, 0, 7); ctx.fill(); ctx.restore();
            }
          }
          if (ln.label) K.tag(ln.label, 540, 470, 540, 700 + bob, 60, eob(seg(lt, 0.15, 0.45)));
        } else if (sc === 'bounce') {
          K.xray(t);
          const pulse = Math.abs(Math.sin(lt * 3.8));
          // Glowing radial pulse rings + pressure/reaction burst instead of plain beige background
          for (let r = 0; r < 3; r++) {
            const ph = (lt * 0.9 + r / 3) % 1;
            ctx.save(); ctx.globalAlpha = 0.45 * (1 - ph); ctx.strokeStyle = r % 2 ? C.yellow : C.cyan; ctx.lineWidth = 10;
            ctx.beginPath(); ctx.arc(540, 820, 120 + ph * 340, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
          }
          K.heart(540, 820, 1.45 + 0.18 * pulse, pulse);
          for (let p = 0; p < 12; p++) {
            const an = p * (Math.PI * 2 / 12) + lt * 0.9, dd = 210 + 55 * Math.sin(lt * 4 + p);
            ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = p % 2 ? C.cyan : C.yellow;
            ctx.beginPath(); ctx.arc(540 + Math.cos(an) * dd, 820 + Math.sin(an) * dd, 14, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          }
          if (ln.label) K.pill(ln.label, 540, 410, 56, C.yellow, C.ink, eob(seg(lt, 0.1, 0.35)));
        } else if (sc === 'myth') {
          ctx.fillStyle = C.bg; ctx.fillRect(-300, -300, W + 600, H + 600);
          const drop = eob(seg(lt, 0, 0.4));
          K.calendar(540, lerp(-380, 780, drop), 1, ln.calNum || 'MYTH', ln.calSub || 'FALSE?', lerp(-0.22, -0.04, drop));
          if (lt > d * 0.45) K.redX(540, 780, lerp(1.9, 1, eo(seg(lt, d * 0.45, d * 0.65))), 1);
        } else if (sc === 'stopwatch') {
          ctx.fillStyle = C.bg; ctx.fillRect(-300, -300, W + 600, H + 600);
          K.stopwatch(540, 760, 1.15, lt * 3.2);
          if (ln.label) K.pill(ln.label, 540, 1130, 54, C.ink, C.yellow, eob(seg(lt, 0.12, 0.38)));
        } else if (sc === 'warning') {
          K.xray(t);
          K.warning(540, 680, eob(seg(lt, 0.08, 0.35)) * (1 + 0.06 * Math.sin(lt * 10)));
          if (ln.label) K.pill(ln.label, 540, 1080, 54, C.red, C.white, eob(seg(lt, 0.2, 0.45)));
        } else if (sc === 'end') {
          K.room();
          K.man({ x: 540, y: 1180, s: 1.6, arm: K.ARM.point, finger: Math.sin(lt * 11) * 0.32, mouth: 'smirk', eyes: 'n' });
        } else {
          K.room();
          const shocked = lt > d * 0.45;
          K.man({ x: 540, y: 1180, s: 1.6, arm: K.ARM.wave, mouth: shocked ? 'o' : 'smile', eyes: shocked ? 'wide' : 'n', brow: shocked ? 1 : 0 });
          if (shocked) K.shockLines(540, 625, 290, clamp((lt - d * 0.45) * 4));
        }
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
  return `// Auto-generated Stick Story 2D shots for: ${JSON.stringify(story.title)}
import { ctx, W, H, clamp, lerp, seg, eo, eio, eob } from './core/lib.js';
import { L } from './core/timing.js';
import * as K from './core/kit.js';
const { P, GROUND } = K;
const LINES = ${data};

export function buildShots() {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut = (i) => (i === 0 ? 0 : L(i) - 0.08);
  const blink = (t) => ((t % 3.1) < 0.12 ? 1 : 0);

  LINES.forEach((ln, i) => {
    const st = cut(i);
    const sc = ln.scene || 'night_living';
    add({
      id: 'S' + String(i + 1).padStart(2, '0'),
      at: st,
      cam: [540, 1080],
      zoom: 0.08,
      note: sc,
      draw(lt, d, t) {
        if (sc === 'counter') {
          ctx.fillStyle = P.wall; ctx.fillRect(-300, -300, W + 600, H + 600);
          const l3 = ln.lines3 || ['STAY CALM', 'ACT FAST', 'STAY SAFE'];
          K.counterPill(l3[0], 540, 520, eob(seg(lt, 0.08, 0.32)) * 1.4);
          K.counterPill(l3[1], 540, 720, eob(seg(lt, 0.35, 0.6)) * 1.2);
          K.counterPill(l3[2], 540, 900, eob(seg(lt, 0.65, 0.9)) * 1.2);
          K.person({ x: 340, y: 1540, h: 620, mood: 'determined', look: [1, -0.4] });
          K.person({ x: 740, y: 1540, h: 600, mood: 'happy', dir: -1, look: [-1, -0.4], cap: '#E2574C' });
        } else {
          const night = sc !== 'day_living';
          if (sc === 'night_kitchen') K.kitchen({ night: true });
          else if (sc === 'night_hall') K.hallway({ night: true });
          else K.livingRoom({ night, lampOn: !night });
          if (night) { ctx.fillStyle = 'rgba(5,8,18,0.38)'; ctx.fillRect(-300, -300, W + 600, H + 600); }
          K.person({
            glow: night, x: 520, y: GROUND, h: 840,
            mood: ln.mood || (night ? 'determined' : 'happy'),
            look: [Math.sin(lt * 2.5) * 0.5, -0.15], blink: blink(t),
            arms: { L: [-10, 18], R: [55 + Math.sin(lt * 5) * 14, 25] },
          });
          if (ln.step) K.stepCard(ln.step[0], ln.step[1], 540, 300, eob(seg(lt, 0.06, 0.3)));
          else if (ln.pill) K.counterPill(ln.pill, 540, 300, eob(seg(lt, 0.08, 0.32)));
          if (ln.cross && lt > 0.35) K.cross(790, 820, eob(seg(lt, 0.35, 0.6)));
          if (ln.check && lt > 0.35) K.check(790, 820, eob(seg(lt, 0.35, 0.6)));
        }
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
  return `// Auto-generated Paper Atlas 2D shots for: ${JSON.stringify(story.title)}
import { ctx, W, H, TAU, clamp, lerp, seg, eo, eio, eob, rnd, circle } from './core/lib.js';
import { L } from './core/timing.js';
import * as K from './core/kit.js';
const { P, cut, P_rr } = K;
const LINES = ${data};

function nightPage(seed) {
  K.parchment(seed); ctx.save(); ctx.globalAlpha = 0.84; ctx.fillStyle = '#2F3550';
  ctx.fillRect(-300, -300, W + 600, H + 600); ctx.restore();
  for (let i = 0; i < 26; i++) circle(rnd(i + seed) * W, rnd(i + 40 + seed) * 900, 3 + rnd(i) * 3, '#E9DCBC');
}

export function buildShots() {
  const S = [], CUES = [], add = (o) => (S.push(o), o), cue = (t, type, o = {}) => CUES.push({ t: +t.toFixed(3), type, ...o });
  const cut_ = (i) => (i === 0 ? 0 : L(i) - 0.08);

  LINES.forEach((ln, i) => {
    const st = cut_(i);
    const sc = ln.scene || 'map';
    add({
      id: 'S' + String(i + 1).padStart(2, '0'),
      at: st,
      cam: [540, 940],
      zoom: 0.08,
      note: sc,
      draw(lt, d, t) {
        const p = eio(clamp(lt / Math.max(0.2, d)));
        if (sc === 'map') {
          K.map({ route: [[220, 1180], [460, 960], [740, 820], [840, 620]], p });
          if (ln.year) K.ribbon(ln.year, 540, 350, eob(seg(lt, 0.08, 0.4)));
          if (ln.slip) K.slip(ln.slip, 540, 520, eob(seg(lt, 0.25, 0.55)), -0.02);
        } else if (sc === 'harbor') {
          K.harbor(t, lerp(160, 860, p));
          if (ln.slip) K.slip(ln.slip, 540, 340, eob(seg(lt, 0.12, 0.4)), 0.02);
        } else if (sc === 'hall') {
          K.hall();
          K.figure({ x: 540, y: 1480, h: 740, role: ln.role || 'scholar', arm: 25 + Math.sin(lt * 8) * 18 });
          if (ln.slip) K.slip(ln.slip, 540, 340, eob(seg(lt, 0.12, 0.4)), -0.02);
        } else if (sc === 'timeline') {
          K.parchment(i + 2);
          const lbls = ln.labels || ['STEP 1', 'STEP 2', 'STEP 3', 'RESULT'];
          K.timeline(lbls, 140, 480, 800, p, Math.min(lbls.length - 1, Math.floor(p * lbls.length)));
          K.figure({ x: 540, y: 1460, h: 640, role: ln.role || 'merchant', walk: lt * 5 });
        } else if (sc === 'seal') {
          K.parchment(i + 7);
          K.seal(540, 760, eob(seg(lt, 0.1, 0.45)) * 1.4, ln.letter || 'H');
          if (ln.slip) K.slip(ln.slip, 540, 1180, eob(seg(lt, 0.28, 0.58)), -0.03);
        } else {
          nightPage(i + 1);
          cut(P_rr(-300, 1420, W + 600, 800, 0), '#4A3A2E', { shadow: 0, edge: 0 });
          K.figure({ x: 540, y: 1420, h: 640, role: ln.role || 'worker', arm: 30 + Math.sin(lt * 7) * 16 });
          if (ln.slip) K.slip(ln.slip, 540, 360, eob(seg(lt, 0.12, 0.4)), 0.02);
        }
      },
    });
    if (i > 0) cue(st, 'whoosh');
    cue(st + 0.15, ln.sfx || 'pop', { gain: 0.7 });
  });
  return { shots: S, cues: CUES };
}
`;
}

export function writeProjectFiles(projDir, story) {
  const scriptObj = buildScriptJson(story);
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
