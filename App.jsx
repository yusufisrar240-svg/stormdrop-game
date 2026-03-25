import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrthographicCamera, Html, RoundedBox, Sphere, Cylinder } from "@react-three/drei";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { Crosshair, Map, Swords, Smartphone, Box, Wand2, Users, Sparkles, Shield, Heart } from "lucide-react";

const MAP_SIZE = 220;
const PLAYER_SPEED = 0.62;
const BOT_SPEED = 0.28;
const STORM_START = 102;
const STORM_END = 16;
const BR_MATCH_TIME = 180;
const DUEL_TIME = 90;
const FIRE_RANGE = 32;

const LOOT_TABLE = [
  { id: "ar", name: "Ranger AR", damage: 18, cooldown: 0.16, rarity: "Common", color: "#e5e7eb", ammo: 80, bulletSpeed: 3.4 },
  { id: "smg", name: "Storm SMG", damage: 10, cooldown: 0.09, rarity: "Uncommon", color: "#86efac", ammo: 110, bulletSpeed: 3.6 },
  { id: "burst", name: "Burst Rifle", damage: 16, cooldown: 0.2, rarity: "Rare", color: "#93c5fd", ammo: 90, bulletSpeed: 3.5 },
  { id: "shotgun", name: "Thunder Shotgun", damage: 34, cooldown: 0.55, rarity: "Epic", color: "#c4b5fd", ammo: 36, bulletSpeed: 3.1 },
  { id: "sniper", name: "Falcon Sniper", damage: 52, cooldown: 1.0, rarity: "Legendary", color: "#fca5a5", ammo: 20, bulletSpeed: 4.2 },
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function angleTo(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function collidesWorld(p, obstacles, radius = 1.8) {
  return obstacles.some((o) => {
    if (o.kind === "house" || o.kind === "wall") {
      return p.x + radius > o.x - o.w / 2 && p.x - radius < o.x + o.w / 2 && p.y + radius > o.y - o.h / 2 && p.y - radius < o.y + o.h / 2;
    }
    return dist(p, o) < o.r + radius;
  });
}

function canSeeTarget(a, b, obstacles) {
  const steps = 14;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (collidesWorld(p, obstacles, 0.45)) return false;
  }
  return true;
}

function createBaseObstacles() {
  const list = [];
  for (let i = 0; i < 20; i++) list.push({ id: `tree-${i}`, kind: "tree", x: rand(-95, 95), y: rand(-95, 95), r: rand(2.2, 3.4) });
  for (let i = 0; i < 14; i++) list.push({ id: `rock-${i}`, kind: "rock", x: rand(-95, 95), y: rand(-95, 95), r: rand(1.8, 2.8) });
  for (let i = 0; i < 9; i++) list.push({ id: `house-${i}`, kind: "house", x: rand(-80, 80), y: rand(-80, 80), w: rand(8, 14), h: rand(8, 14) });
  return list;
}

function createLoot(obstacles) {
  const list = [];
  while (list.length < 52) {
    const p = { x: rand(-100, 100), y: rand(-100, 100) };
    if (collidesWorld(p, obstacles, 2.2)) continue;
    const gun = LOOT_TABLE[Math.floor(Math.random() * LOOT_TABLE.length)];
    const typeRoll = Math.random();
    const kind = typeRoll < 0.58 ? "weapon" : typeRoll < 0.76 ? "shield" : typeRoll < 0.9 ? "med" : "ammo";
    list.push({ id: `loot-${list.length}`, x: p.x, y: p.y, kind, weapon: kind === "weapon" ? gun : null });
  }
  return list;
}

function createBots(obstacles, count = 18) {
  const bots = [];
  while (bots.length < count) {
    const p = { x: rand(-100, 100), y: rand(-100, 100) };
    if (collidesWorld(p, obstacles, 2.5) || dist(p, { x: 0, y: 0 }) < 20) continue;
    const gun = LOOT_TABLE[Math.floor(Math.random() * 4)];
    bots.push({
      id: `bot-${bots.length}`,
      x: p.x,
      y: p.y,
      angle: 0,
      hp: 100,
      shield: 0,
      weapon: gun,
      ammo: gun.ammo,
      cooldown: rand(0.1, 0.8),
      wander: rand(0.5, 1.6),
      dir: rand(0, Math.PI * 2),
      hue: bots.length % 2 ? "orange" : "red",
      flash: 0,
    });
  }
  return bots;
}

function createDuelObstacles() {
  return [
    { id: "duel-wall-1", kind: "wall", x: 0, y: -18, w: 20, h: 3 },
    { id: "duel-wall-2", kind: "wall", x: 0, y: 18, w: 20, h: 3 },
    { id: "duel-wall-3", kind: "wall", x: -18, y: 0, w: 3, h: 20 },
    { id: "duel-wall-4", kind: "wall", x: 18, y: 0, w: 3, h: 20 },
    { id: "duel-rock-a", kind: "rock", x: -7, y: -5, r: 2.2 },
    { id: "duel-rock-b", kind: "rock", x: 7, y: 5, r: 2.2 },
    { id: "duel-wall-mid-a", kind: "wall", x: -2, y: 0, w: 3, h: 9 },
    { id: "duel-wall-mid-b", kind: "wall", x: 2, y: 0, w: 3, h: 9 },
  ];
}

function createDuelState() {
  const weapon = LOOT_TABLE[1];
  return {
    p1: { x: -12, y: 0, angle: 0, hp: 100, shield: 50, weapon, ammo: 999, cooldown: 0, name: "You", flash: 0 },
    p2: { x: 12, y: 0, angle: 0, hp: 100, shield: 50, weapon, ammo: 999, cooldown: 0, name: "Rival", flash: 0 },
    bullets: [],
    timeLeft: DUEL_TIME,
    result: null,
  };
}

function makeMapObject(type, x, y) {
  if (type === "tree") return { id: `${type}-${Math.random()}`, kind: "tree", x, y, r: 2.8 };
  if (type === "rock") return { id: `${type}-${Math.random()}`, kind: "rock", x, y, r: 2.2 };
  if (type === "wall") return { id: `${type}-${Math.random()}`, kind: "wall", x, y, w: 8, h: 3 };
  return { id: `${type}-${Math.random()}`, kind: "house", x, y, w: 10, h: 10 };
}

function TouchStick({ side = "left", label, onChange }) {
  const baseRef = useRef(null);
  const activeRef = useRef(false);

  const emit = (clientX, clientY) => {
    if (!baseRef.current) return;
    const rect = baseRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const max = rect.width * 0.32;
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(len, max);
    onChange({ x: (dx / len) * (clamped / max), y: (dy / len) * (clamped / max), active: true });
  };

  return (
    <div
      ref={baseRef}
      className={`absolute bottom-4 ${side === "left" ? "left-4" : "right-4"} h-28 w-28 rounded-full border border-white/20 bg-black/30 backdrop-blur-md md:hidden select-none touch-none`}
      onTouchStart={(e) => {
        activeRef.current = true;
        const t = e.touches[0];
        emit(t.clientX, t.clientY);
      }}
      onTouchMove={(e) => {
        if (!activeRef.current) return;
        const t = e.touches[0];
        emit(t.clientX, t.clientY);
      }}
      onTouchEnd={() => {
        activeRef.current = false;
        onChange({ x: 0, y: 0, active: false });
      }}
    >
      <div className="absolute inset-4 rounded-full border border-white/10" />
      <div className="absolute inset-0 grid place-items-center text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">{label}</div>
    </div>
  );
}

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[MAP_SIZE, MAP_SIZE]} />
        <meshStandardMaterial color="#164e63" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#14532d" />
      </mesh>
    </group>
  );
}

function StormRing({ radius }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[radius, MAP_SIZE, 128]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.18} side={2} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[radius - 0.5, radius + 0.5, 128]} />
        <meshBasicMaterial color="#93c5fd" transparent opacity={0.75} side={2} />
      </mesh>
    </group>
  );
}

function WorldObstacle({ item }) {
  if (item.kind === "tree") {
    return (
      <group position={[item.x, 0, item.y]}>
        <Cylinder args={[0.45, 0.55, 2.4, 10]} position={[0, 1.2, 0]}>
          <meshStandardMaterial color="#7c2d12" />
        </Cylinder>
        <Sphere args={[1.9, 16, 16]} position={[0, 3.1, 0]}>
          <meshStandardMaterial color="#22c55e" />
        </Sphere>
      </group>
    );
  }
  if (item.kind === "rock") {
    return (
      <RoundedBox args={[item.r * 1.7, item.r * 1.2, item.r * 1.5]} radius={0.35} smoothness={3} position={[item.x, item.r * 0.6, item.y]}>
        <meshStandardMaterial color="#94a3b8" />
      </RoundedBox>
    );
  }
  return (
    <group position={[item.x, 0, item.y]}>
      <RoundedBox args={[item.w, 3.8, item.h]} radius={0.35} smoothness={4} position={[0, 1.9, 0]}>
        <meshStandardMaterial color={item.kind === "wall" ? "#475569" : "#f59e0b"} />
      </RoundedBox>
      {item.kind === "house" && (
        <RoundedBox args={[item.w + 0.6, 1.1, item.h + 0.6]} radius={0.15} smoothness={4} position={[0, 4.35, 0]}>
          <meshStandardMaterial color="#b45309" />
        </RoundedBox>
      )}
    </group>
  );
}

function LootMesh({ item }) {
  const y = item.kind === "weapon" ? 0.55 : 0.4;
  const color = item.kind === "weapon" ? item.weapon.color : item.kind === "shield" ? "#38bdf8" : item.kind === "med" ? "#fb7185" : "#facc15";
  return (
    <group position={[item.x, y, item.y]}>
      <RoundedBox args={[1.4, 0.45, 1.4]} radius={0.2} smoothness={3}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </RoundedBox>
    </group>
  );
}

function Character({ unit, color = "#67e8f9", label }) {
  const bodyColor = unit.flash > 0 ? "#ffffff" : color;
  return (
    <group position={[unit.x, 0, unit.y]}>
      <Cylinder args={[1.25, 1.25, 2.3, 16]} position={[0, 1.2, 0]}>
        <meshStandardMaterial color={bodyColor} emissive={unit.flash > 0 ? bodyColor : "#000000"} emissiveIntensity={unit.flash > 0 ? 0.6 : 0} />
      </Cylinder>
      <Sphere args={[0.8, 16, 16]} position={[0, 2.8, 0]}>
        <meshStandardMaterial color="#e2e8f0" />
      </Sphere>
      <mesh position={[Math.cos(unit.angle || 0) * 1.5, 1.65, Math.sin(unit.angle || 0) * 1.5]} rotation={[0, -(unit.angle || 0), 0]}>
        <boxGeometry args={[1.8, 0.25, 0.35]} />
        <meshStandardMaterial color="#020617" emissive={unit.flash > 0 ? "#f8fafc" : "#000000"} emissiveIntensity={unit.flash > 0 ? 0.8 : 0} />
      </mesh>
      {label && (
        <Html position={[0, 4.1, 0]} center>
          <div className="rounded-full border border-white/20 bg-black/45 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">{label}</div>
        </Html>
      )}
    </group>
  );
}

function BulletMesh({ bullet }) {
  return (
    <group>
      <Sphere args={[0.24, 10, 10]} position={[bullet.x, 1.4, bullet.y]}>
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} />
      </Sphere>
      <mesh position={[bullet.x - Math.cos(bullet.angle) * 0.8, 1.35, bullet.y - Math.sin(bullet.angle) * 0.8]} rotation={[0, -bullet.angle, 0]}>
        <boxGeometry args={[1.2, 0.05, 0.05]} />
        <meshBasicMaterial color={bullet.owner === "player" || bullet.owner === "p1" ? "#67e8f9" : "#fca5a5"} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

function CameraRig({ target }) {
  const ref = useRef(null);
  useFrame(() => {
    if (!ref.current || !target) return;
    ref.current.position.x += (target.x - ref.current.position.x) * 0.12;
    ref.current.position.z += (target.y + 22 - ref.current.position.z) * 0.12;
  });
  return <OrthographicCamera ref={ref} makeDefault position={[0, 42, 22]} rotation={[-1.05, 0, 0]} zoom={16} near={0.1} far={300} />;
}

function ModeBadge({ children }) {
  return <Badge className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-white hover:bg-white/10">{children}</Badge>;
}

export default function StormdropArenaUltra() {
  const [mode, setMode] = useState("battle-royale");
  const [touchMove, setTouchMove] = useState({ x: 0, y: 0, active: false });
  const [touchAim, setTouchAim] = useState({ x: 0, y: 0, active: false });
  const [selectedTool, setSelectedTool] = useState("tree");
  const [customMap, setCustomMap] = useState(() => [
    { id: "cm-house", kind: "house", x: 0, y: 0, w: 12, h: 12 },
    { id: "cm-tree", kind: "tree", x: -18, y: 10, r: 2.8 },
    { id: "cm-rock", kind: "rock", x: 16, y: -12, r: 2.2 },
  ]);

  const brObstacles = useMemo(() => createBaseObstacles(), []);
  const duelObstacles = useMemo(() => createDuelObstacles(), []);

  const [battleState, setBattleState] = useState(() => ({
    player: { x: 0, y: 0, angle: 0, hp: 100, shield: 30, weapon: LOOT_TABLE[0], ammo: 60, cooldown: 0, kills: 0, flash: 0 },
    bots: createBots(brObstacles, 20),
    bullets: [],
    loot: createLoot(brObstacles),
    timeLeft: BR_MATCH_TIME,
    storm: STORM_START,
    result: null,
    status: "Landing zone is hot.",
  }));

  const [duelState, setDuelState] = useState(() => createDuelState());
  const [keys, setKeys] = useState({});
  const battleWrapRef = useRef(null);
  const duelWrapRef = useRef(null);
  const [aimPoint, setAimPoint] = useState({ x: 0, y: 0 });
  const [duelAimPoint, setDuelAimPoint] = useState({ x: 12, y: 0 });
  const [mouseDownBattle, setMouseDownBattle] = useState(false);
  const [mouseDownDuel, setMouseDownDuel] = useState(false);

  useEffect(() => {
    const down = (e) => setKeys((k) => ({ ...k, [e.key.toLowerCase()]: true }));
    const up = (e) => setKeys((k) => ({ ...k, [e.key.toLowerCase()]: false }));
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (mode === "battle-royale") {
        setBattleState((prev) => {
          if (prev.result) return prev;
          const dt = 1 / 30;
          let player = { ...prev.player, flash: Math.max(0, prev.player.flash - dt) };
          let bots = prev.bots.map((b) => ({ ...b, flash: Math.max(0, (b.flash || 0) - dt) }));
          let bullets = prev.bullets.map((b) => ({ ...b }));
          let loot = [...prev.loot];
          let status = prev.status;

          const keyMoveX = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
          const keyMoveY = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
          const moveX = keyMoveX + (touchMove.active ? touchMove.x : 0);
          const moveY = keyMoveY + (touchMove.active ? touchMove.y : 0);
          const moveLen = Math.hypot(moveX, moveY);
          if (moveLen > 0) {
            const px = player.x + (moveX / moveLen) * PLAYER_SPEED;
            const py = player.y + (moveY / moveLen) * PLAYER_SPEED;
            const nextPlayer = { ...player, x: clamp(px, -104, 104), y: clamp(py, -104, 104) };
            if (!collidesWorld(nextPlayer, brObstacles, 1.8)) player = nextPlayer;
          }

          const target = touchAim.active ? { x: player.x + touchAim.x * 12, y: player.y + touchAim.y * 12 } : aimPoint;
          player.angle = angleTo(player, target);
          player.cooldown = Math.max(0, player.cooldown - dt);

          const wantsShoot = mouseDownBattle || keys[" "] || touchAim.active;
          if (wantsShoot && player.cooldown <= 0 && player.ammo > 0) {
            bullets.push({ id: Math.random(), owner: "player", x: player.x, y: player.y, angle: player.angle, damage: player.weapon.damage, life: 1.15, speed: player.weapon.bulletSpeed, splash: player.weapon.id === "shotgun" ? 0.25 : 0 });
            if (player.weapon.id === "shotgun") {
              bullets.push({ id: Math.random(), owner: "player", x: player.x, y: player.y, angle: player.angle - 0.08, damage: player.weapon.damage - 6, life: 0.8, speed: player.weapon.bulletSpeed - 0.15 });
              bullets.push({ id: Math.random(), owner: "player", x: player.x, y: player.y, angle: player.angle + 0.08, damage: player.weapon.damage - 6, life: 0.8, speed: player.weapon.bulletSpeed - 0.15 });
            }
            player.ammo -= 1;
            player.cooldown = player.weapon.cooldown;
            player.flash = 0.08;
          }

          bullets = bullets
            .map((b) => ({ ...b, x: b.x + Math.cos(b.angle) * b.speed, y: b.y + Math.sin(b.angle) * b.speed, life: b.life - dt }))
            .filter((b) => b.life > 0 && Math.abs(b.x) < 110 && Math.abs(b.y) < 110 && !collidesWorld(b, brObstacles, 0.3));

          bots = bots
            .map((bot) => {
              bot.cooldown = Math.max(0, bot.cooldown - dt);
              bot.wander -= dt;
              const d = dist(bot, player);
              const seesPlayer = d < FIRE_RANGE && canSeeTarget(bot, player, brObstacles);
              bot.angle = angleTo(bot, player);

              if (seesPlayer && d > 12) {
                const nx = bot.x + Math.cos(bot.angle) * BOT_SPEED * 1.2;
                const ny = bot.y + Math.sin(bot.angle) * BOT_SPEED * 1.2;
                const next = { ...bot, x: clamp(nx, -104, 104), y: clamp(ny, -104, 104) };
                if (!collidesWorld(next, brObstacles, 1.7)) {
                  bot.x = next.x;
                  bot.y = next.y;
                }
              } else if (seesPlayer && d < 8) {
                const nx = bot.x - Math.cos(bot.angle) * BOT_SPEED * 0.9;
                const ny = bot.y - Math.sin(bot.angle) * BOT_SPEED * 0.9;
                const next = { ...bot, x: clamp(nx, -104, 104), y: clamp(ny, -104, 104) };
                if (!collidesWorld(next, brObstacles, 1.7)) {
                  bot.x = next.x;
                  bot.y = next.y;
                }
              } else {
                if (bot.wander <= 0) {
                  bot.dir = rand(0, Math.PI * 2);
                  bot.wander = rand(0.5, 1.6);
                }
                const nx = bot.x + Math.cos(bot.dir) * BOT_SPEED;
                const ny = bot.y + Math.sin(bot.dir) * BOT_SPEED;
                const next = { ...bot, x: clamp(nx, -104, 104), y: clamp(ny, -104, 104) };
                if (!collidesWorld(next, brObstacles, 1.7)) {
                  bot.x = next.x;
                  bot.y = next.y;
                }
              }

              if (seesPlayer && bot.cooldown <= 0 && bot.ammo > 0) {
                const spread = rand(-0.05, 0.05);
                bullets.push({ id: Math.random(), owner: bot.id, x: bot.x, y: bot.y, angle: bot.angle + spread, damage: bot.weapon.damage, life: 1.0, speed: bot.weapon.bulletSpeed - 0.15 });
                bot.cooldown = bot.weapon.cooldown + rand(0.05, 0.25);
                bot.ammo -= 1;
                bot.flash = 0.08;
              }
              return bot;
            })
            .filter((b) => b.hp > 0);

          bullets = bullets.filter((bullet) => {
            if (bullet.owner !== "player" && dist(bullet, player) < 1.8) {
              if (player.shield > 0) player.shield = Math.max(0, player.shield - bullet.damage);
              else player.hp = Math.max(0, player.hp - bullet.damage);
              player.flash = 0.12;
              status = "You got tagged.";
              return false;
            }
            if (bullet.owner === "player") {
              const hitBot = bots.find((b) => dist(bullet, b) < 1.8);
              if (hitBot) {
                if (hitBot.shield > 0) hitBot.shield = Math.max(0, hitBot.shield - bullet.damage);
                else hitBot.hp = Math.max(0, hitBot.hp - bullet.damage);
                hitBot.flash = 0.12;
                if (hitBot.hp <= 0) {
                  player.kills += 1;
                  status = `${hitBot.weapon.name} user down.`;
                }
                return false;
              }
            }
            return true;
          });

          loot = loot.filter((item) => {
            if (dist(item, player) < 2.3) {
              if (item.kind === "weapon" && item.weapon) {
                player.weapon = item.weapon;
                player.ammo = Math.max(player.ammo, item.weapon.ammo);
                status = `${item.weapon.rarity} ${item.weapon.name} equipped.`;
              } else if (item.kind === "shield") {
                player.shield = Math.min(100, player.shield + 28);
                status = "Shield up.";
              } else if (item.kind === "med") {
                player.hp = Math.min(100, player.hp + 24);
                status = "Health restored.";
              } else {
                player.ammo = Math.min(160, player.ammo + 28);
                status = "Ammo picked up.";
              }
              return false;
            }
            return true;
          });

          const storm = Math.max(STORM_END, prev.storm - 0.11);
          if (Math.hypot(player.x, player.y) > storm) {
            if (player.shield > 0) player.shield = Math.max(0, player.shield - 0.8);
            else player.hp = Math.max(0, player.hp - 0.65);
          }
          bots.forEach((bot) => {
            if (Math.hypot(bot.x, bot.y) > storm) {
              if (bot.shield > 0) bot.shield = Math.max(0, bot.shield - 0.8);
              else bot.hp = Math.max(0, bot.hp - 0.65);
            }
          });
          bots = bots.filter((b) => b.hp > 0);

          const timeLeft = Math.max(0, prev.timeLeft - dt);
          let result = null;
          if (player.hp <= 0) result = "defeat";
          else if (bots.length === 0 || timeLeft <= 0) result = "victory";

          return { ...prev, player, bots, bullets, loot, storm, timeLeft, status, result };
        });
      }

      if (mode === "duel") {
        setDuelState((prev) => {
          if (prev.result) return prev;
          const dt = 1 / 30;
          const p1 = { ...prev.p1, flash: Math.max(0, prev.p1.flash - dt) };
          const p2 = { ...prev.p2, flash: Math.max(0, prev.p2.flash - dt) };
          let bullets = prev.bullets.map((b) => ({ ...b }));
          const movement = {
            x: (keys.d ? 1 : 0) - (keys.a ? 1 : 0) + (touchMove.active ? touchMove.x : 0),
            y: (keys.s ? 1 : 0) - (keys.w ? 1 : 0) + (touchMove.active ? touchMove.y : 0),
          };
          const ml = Math.hypot(movement.x, movement.y);
          if (ml > 0) {
            const np1 = { ...p1, x: clamp(p1.x + (movement.x / ml) * 0.42, -20, 20), y: clamp(p1.y + (movement.y / ml) * 0.42, -20, 20) };
            if (!collidesWorld(np1, duelObstacles, 1.6)) {
              p1.x = np1.x;
              p1.y = np1.y;
            }
          }

          p1.angle = angleTo(p1, touchAim.active ? { x: p1.x + touchAim.x * 10, y: p1.y + touchAim.y * 10 } : duelAimPoint);
          p1.cooldown = Math.max(0, p1.cooldown - dt);
          if ((mouseDownDuel || keys[" "] || touchAim.active) && p1.cooldown <= 0) {
            bullets.push({ id: Math.random(), owner: "p1", x: p1.x, y: p1.y, angle: p1.angle, damage: 9, speed: 2.8, life: 1.2 });
            p1.cooldown = 0.12;
            p1.flash = 0.08;
          }

          p2.cooldown = Math.max(0, p2.cooldown - dt);
          p2.angle = angleTo(p2, p1);
          const d = dist(p2, p1);
          const seesPlayer = d < 24 && canSeeTarget(p2, p1, duelObstacles);
          if (seesPlayer) {
            const push = d > 11 ? 1 : -0.7;
            const np2 = { ...p2, x: clamp(p2.x + Math.cos(p2.angle) * 0.28 * push, -20, 20), y: clamp(p2.y + Math.sin(p2.angle) * 0.28 * push, -20, 20) };
            if (!collidesWorld(np2, duelObstacles, 1.6)) {
              p2.x = np2.x;
              p2.y = np2.y;
            }
          }
          if (seesPlayer && p2.cooldown <= 0) {
            bullets.push({ id: Math.random(), owner: "p2", x: p2.x, y: p2.y, angle: p2.angle + rand(-0.04, 0.04), damage: 9, speed: 2.6, life: 1.2 });
            p2.cooldown = 0.18;
            p2.flash = 0.08;
          }

          bullets = bullets
            .map((b) => ({ ...b, x: b.x + Math.cos(b.angle) * b.speed, y: b.y + Math.sin(b.angle) * b.speed, life: b.life - dt }))
            .filter((b) => b.life > 0 && Math.abs(b.x) < 24 && Math.abs(b.y) < 24 && !collidesWorld(b, duelObstacles, 0.25));

          bullets = bullets.filter((bullet) => {
            if (bullet.owner !== "p1" && dist(bullet, p1) < 1.6) {
              if (p1.shield > 0) p1.shield = Math.max(0, p1.shield - bullet.damage);
              else p1.hp = Math.max(0, p1.hp - bullet.damage);
              p1.flash = 0.12;
              return false;
            }
            if (bullet.owner !== "p2" && dist(bullet, p2) < 1.6) {
              if (p2.shield > 0) p2.shield = Math.max(0, p2.shield - bullet.damage);
              else p2.hp = Math.max(0, p2.hp - bullet.damage);
              p2.flash = 0.12;
              return false;
            }
            return true;
          });

          const timeLeft = Math.max(0, prev.timeLeft - dt);
          let result = null;
          if (p1.hp <= 0) result = "Rival wins";
          else if (p2.hp <= 0) result = "You win";
          else if (timeLeft <= 0) result = p1.hp + p1.shield >= p2.hp + p2.shield ? "You win" : "Rival wins";
          return { p1, p2, bullets, timeLeft, result };
        });
      }
    }, 1000 / 30);

    return () => clearInterval(interval);
  }, [mode, keys, aimPoint, duelAimPoint, brObstacles, duelObstacles, touchMove, touchAim, mouseDownBattle, mouseDownDuel]);

  const resetBattle = () => {
    setBattleState({
      player: { x: 0, y: 0, angle: 0, hp: 100, shield: 30, weapon: LOOT_TABLE[0], ammo: 60, cooldown: 0, kills: 0, flash: 0 },
      bots: createBots(brObstacles, 20),
      bullets: [],
      loot: createLoot(brObstacles),
      timeLeft: BR_MATCH_TIME,
      storm: STORM_START,
      result: null,
      status: "Fresh drop. Big map. Better loot.",
    });
  };

  const resetDuel = () => setDuelState(createDuelState());
  const mapSummary = `${customMap.length} placed objects`;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0f172a,_#020617_58%)] text-white p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <Card className="rounded-[30px] border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl">
            <CardContent className="p-6 space-y-5">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <ModeBadge><Sparkles className="mr-2 h-4 w-4" /> Better visuals</ModeBadge>
                  <ModeBadge><Smartphone className="mr-2 h-4 w-4" /> Mobile controls</ModeBadge>
                  <ModeBadge><Users className="mr-2 h-4 w-4" /> 1v1 mode</ModeBadge>
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-black tracking-tight">Stormdrop Arena Ultra</h1>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    I reworked the combat so it feels much more like a modern battle royale: click-and-hold shooting on desktop, aim-and-fire on mobile, smarter enemies, clearer hit feedback, and stronger weapon feel. It is still an original game, not a Fortnite copy.
                  </p>
                </div>
              </div>

              <Tabs value={mode} onValueChange={setMode}>
                <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-black/25">
                  <TabsTrigger value="battle-royale" className="rounded-2xl">Battle Royale</TabsTrigger>
                  <TabsTrigger value="duel" className="rounded-2xl">1v1</TabsTrigger>
                  <TabsTrigger value="map-lab" className="rounded-2xl">Map Lab</TabsTrigger>
                </TabsList>
              </Tabs>

              {mode === "battle-royale" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-black/20 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Players left</div>
                      <div className="mt-1 text-2xl font-black">{battleState.bots.length + 1}</div>
                    </div>
                    <div className="rounded-2xl bg-black/20 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Kills</div>
                      <div className="mt-1 text-2xl font-black">{battleState.player.kills}</div>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex justify-between text-sm"><span className="flex items-center gap-2"><Heart className="h-4 w-4" /> Health</span><span>{Math.round(battleState.player.hp)}</span></div>
                    <Progress value={battleState.player.hp} />
                  </div>
                  <div>
                    <div className="mb-2 flex justify-between text-sm"><span className="flex items-center gap-2"><Shield className="h-4 w-4" /> Shield</span><span>{Math.round(battleState.player.shield)}</span></div>
                    <Progress value={battleState.player.shield} />
                  </div>
                  <div className="rounded-2xl bg-black/20 p-4 space-y-2 text-sm text-slate-200">
                    <div className="font-semibold">Loadout</div>
                    <div>{battleState.player.weapon.rarity} {battleState.player.weapon.name}</div>
                    <div>Damage: {battleState.player.weapon.damage}</div>
                    <div>Ammo: {battleState.player.ammo}</div>
                    <div>Storm radius: {battleState.storm.toFixed(0)}</div>
                  </div>
                  <div className="rounded-2xl bg-black/20 p-4 text-sm text-slate-200">
                    <div className="font-semibold mb-2">Controls</div>
                    <div>Desktop: WASD + mouse aim + hold click to fire</div>
                    <div>Mobile: left stick move + right stick aim and shoot</div>
                  </div>
                  <Button className="w-full rounded-2xl h-12 text-base font-semibold" onClick={resetBattle}>Fresh match</Button>
                </div>
              )}

              {mode === "duel" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-black/20 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Your HP</div>
                      <div className="mt-1 text-2xl font-black">{Math.round(duelState.p1.hp + duelState.p1.shield)}</div>
                    </div>
                    <div className="rounded-2xl bg-black/20 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Rival HP</div>
                      <div className="mt-1 text-2xl font-black">{Math.round(duelState.p2.hp + duelState.p2.shield)}</div>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-black/20 p-4 text-sm text-slate-200">
                    <div className="font-semibold mb-2">1v1 Mode</div>
                    <div>Fast arena with real shooting, cover, and hit reactions.</div>
                    <div className="mt-2">Timer: {Math.ceil(duelState.timeLeft)}s</div>
                    {duelState.result && <div className="mt-2 text-lg font-bold text-emerald-300">{duelState.result}</div>}
                  </div>
                  <Button className="w-full rounded-2xl h-12 text-base font-semibold" onClick={resetDuel}>Reset duel</Button>
                </div>
              )}

              {mode === "map-lab" && (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-black/20 p-4 text-sm text-slate-200">
                    <div className="font-semibold mb-2">Custom Map Maker</div>
                    <div>Tap or click the floor to place objects.</div>
                    <div className="mt-2">Current map: {mapSummary}</div>
                  </div>
                  <Select value={selectedTool} onValueChange={setSelectedTool}>
                    <SelectTrigger className="rounded-2xl border-white/10 bg-black/25">
                      <SelectValue placeholder="Choose build tool" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tree">Tree</SelectItem>
                      <SelectItem value="rock">Rock</SelectItem>
                      <SelectItem value="wall">Wall</SelectItem>
                      <SelectItem value="house">House</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="secondary" className="rounded-2xl h-11" onClick={() => setCustomMap([])}>Clear map</Button>
                    <Button className="rounded-2xl h-11" onClick={() => setCustomMap((m) => [...m, makeMapObject(selectedTool, rand(-30, 30), rand(-30, 30))])}>Add random</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[30px] border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl overflow-hidden">
            <CardContent className="p-3 md:p-4">
              {mode === "battle-royale" && (
                <div
                  className="relative"
                  ref={battleWrapRef}
                  onMouseMove={(e) => {
                    if (!battleWrapRef.current) return;
                    const rect = battleWrapRef.current.getBoundingClientRect();
                    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
                    setAimPoint({ x: battleState.player.x + nx * 14, y: battleState.player.y + ny * 10 });
                  }}
                  onMouseDown={() => setMouseDownBattle(true)}
                  onMouseUp={() => setMouseDownBattle(false)}
                  onMouseLeave={() => setMouseDownBattle(false)}
                >
                  <div className="flex items-center justify-between px-2 pb-3 text-sm text-slate-300">
                    <div>{battleState.status}</div>
                    <div className="font-semibold">{battleState.result ? battleState.result.toUpperCase() : `${Math.ceil(battleState.timeLeft)}s left`}</div>
                  </div>
                  <div className="relative h-[560px] overflow-hidden rounded-[26px] border border-white/10 bg-slate-950">
                    <Canvas shadows gl={{ antialias: true }}>
                      <CameraRig target={battleState.player} />
                      <ambientLight intensity={1.2} />
                      <directionalLight position={[14, 30, 12]} intensity={1.5} castShadow />
                      <Ground />
                      <StormRing radius={battleState.storm} />
                      {brObstacles.map((item) => <WorldObstacle key={item.id} item={item} />)}
                      {battleState.loot.map((item) => <LootMesh key={item.id} item={item} />)}
                      {battleState.bots.map((bot) => <Character key={bot.id} unit={bot} color={bot.hue === "orange" ? "#fb923c" : "#f87171"} />)}
                      {battleState.bullets.map((bullet) => <BulletMesh key={bullet.id} bullet={bullet} />)}
                      <Character unit={battleState.player} color="#67e8f9" label="You" />
                    </Canvas>
                    <div className="absolute left-4 top-4 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm backdrop-blur-md">
                      <div className="font-semibold">Loot pool</div>
                      <div className="text-white/80">Ranger AR, Storm SMG, Burst Rifle, Thunder Shotgun, Falcon Sniper</div>
                    </div>
                    <div className="absolute right-4 top-4 rounded-full border border-white/15 bg-black/40 p-3 backdrop-blur-md">
                      <Crosshair className="h-5 w-5 text-white/90" />
                    </div>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                      <div className="h-8 w-8 rounded-full border border-white/25" />
                    </div>
                    <TouchStick side="left" label="move" onChange={setTouchMove} />
                    <TouchStick side="right" label="aim" onChange={setTouchAim} />
                    {battleState.result && (
                      <div className="absolute inset-0 grid place-items-center bg-slate-950/70 backdrop-blur-sm">
                        <div className="rounded-[28px] border border-white/10 bg-black/45 p-8 text-center shadow-2xl">
                          <div className="text-4xl font-black">{battleState.result === "victory" ? "Victory" : "Defeat"}</div>
                          <div className="mt-2 text-slate-300">{battleState.result === "victory" ? "You survived the new arena." : "The storm got you this time."}</div>
                          <Button className="mt-5 rounded-2xl" onClick={resetBattle}>Drop again</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {mode === "duel" && (
                <div
                  className="relative"
                  ref={duelWrapRef}
                  onMouseMove={(e) => {
                    if (!duelWrapRef.current) return;
                    const rect = duelWrapRef.current.getBoundingClientRect();
                    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
                    setDuelAimPoint({ x: duelState.p1.x + nx * 10, y: duelState.p1.y + ny * 10 });
                  }}
                  onMouseDown={() => setMouseDownDuel(true)}
                  onMouseUp={() => setMouseDownDuel(false)}
                  onMouseLeave={() => setMouseDownDuel(false)}
                >
                  <div className="flex items-center justify-between px-2 pb-3 text-sm text-slate-300">
                    <div>Fast duel arena</div>
                    <div className="font-semibold">{Math.ceil(duelState.timeLeft)}s</div>
                  </div>
                  <div className="relative h-[560px] overflow-hidden rounded-[26px] border border-white/10 bg-slate-950">
                    <Canvas shadows gl={{ antialias: true }}>
                      <OrthographicCamera makeDefault position={[0, 40, 16]} rotation={[-1.05, 0, 0]} zoom={24} near={0.1} far={200} />
                      <ambientLight intensity={1.15} />
                      <directionalLight position={[10, 20, 12]} intensity={1.2} />
                      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                        <planeGeometry args={[46, 46]} />
                        <meshStandardMaterial color="#1e293b" />
                      </mesh>
                      {duelObstacles.map((item) => <WorldObstacle key={item.id} item={item} />)}
                      {duelState.bullets.map((bullet) => <BulletMesh key={bullet.id} bullet={bullet} />)}
                      <Character unit={duelState.p1} color="#22d3ee" label="You" />
                      <Character unit={duelState.p2} color="#fb7185" label="Rival" />
                    </Canvas>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                      <div className="h-8 w-8 rounded-full border border-white/25" />
                    </div>
                    <TouchStick side="left" label="move" onChange={setTouchMove} />
                    <TouchStick side="right" label="aim" onChange={setTouchAim} />
                    {duelState.result && (
                      <div className="absolute inset-0 grid place-items-center bg-slate-950/70 backdrop-blur-sm">
                        <div className="rounded-[28px] border border-white/10 bg-black/45 p-8 text-center shadow-2xl">
                          <div className="text-4xl font-black">{duelState.result}</div>
                          <Button className="mt-5 rounded-2xl" onClick={resetDuel}>Run it back</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {mode === "map-lab" && (
                <div>
                  <div className="flex items-center justify-between px-2 pb-3 text-sm text-slate-300">
                    <div>Build your own combat space</div>
                    <div className="font-semibold">Tool: {selectedTool}</div>
                  </div>
                  <div className="relative h-[560px] overflow-hidden rounded-[26px] border border-white/10 bg-slate-950">
                    <Canvas shadows gl={{ antialias: true }} onPointerMissed={(e) => {
                      if (e.point) setCustomMap((m) => [...m, makeMapObject(selectedTool, clamp(e.point.x, -32, 32), clamp(e.point.z, -32, 32))]);
                    }}>
                      <OrthographicCamera makeDefault position={[0, 42, 18]} rotation={[-1.05, 0, 0]} zoom={19} near={0.1} far={200} />
                      <ambientLight intensity={1.15} />
                      <directionalLight position={[12, 20, 14]} intensity={1.2} />
                      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                        <planeGeometry args={[72, 72]} />
                        <meshStandardMaterial color="#064e3b" />
                      </mesh>
                      {customMap.map((item) => <WorldObstacle key={item.id} item={item} />)}
                      <Html position={[0, 6, 0]} center>
                        <div className="rounded-full border border-white/20 bg-black/45 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">Click floor to place {selectedTool}</div>
                      </Html>
                    </Canvas>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="rounded-[24px] border-white/10 bg-white/5 backdrop-blur-xl"><CardContent className="p-5"><div className="flex items-center gap-2 text-slate-300"><Map className="h-4 w-4" /> Big map</div><div className="mt-2 text-sm text-slate-200">Expanded terrain with storm pressure and more cover.</div></CardContent></Card>
          <Card className="rounded-[24px] border-white/10 bg-white/5 backdrop-blur-xl"><CardContent className="p-5"><div className="flex items-center gap-2 text-slate-300"><Box className="h-4 w-4" /> Loot pool</div><div className="mt-2 text-sm text-slate-200">Weapon rarities, ammo, shield, and health pickups.</div></CardContent></Card>
          <Card className="rounded-[24px] border-white/10 bg-white/5 backdrop-blur-xl"><CardContent className="p-5"><div className="flex items-center gap-2 text-slate-300"><Swords className="h-4 w-4" /> Real fighting</div><div className="mt-2 text-sm text-slate-200">Desktop click fire, mobile aim-fire, tracers, and hit flashes.</div></CardContent></Card>
          <Card className="rounded-[24px] border-white/10 bg-white/5 backdrop-blur-xl"><CardContent className="p-5"><div className="flex items-center gap-2 text-slate-300"><Wand2 className="h-4 w-4" /> Map lab</div><div className="mt-2 text-sm text-slate-200">Place houses, walls, rocks, and trees to prototype layouts.</div></CardContent></Card>
        </div>
      </div>
    </div>
  );
}
