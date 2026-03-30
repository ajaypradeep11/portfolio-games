"use client";

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sky, Stars } from "@react-three/drei";
import { CuboidCollider, Physics, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import styles from "@/app/page.module.css";

type AimState = {
  pitch: number;
  yaw: number;
};

type ProjectileSeed = {
  id: string;
  position: [number, number, number];
  velocity: [number, number, number];
};

type ProjectileBallProps = ProjectileSeed & {
  onExpire: (id: string) => void;
};

const DEFAULT_AIM: AimState = {
  pitch: -0.36,
  yaw: 0,
};

const TURN_SPEED = 1.15;
const PITCH_MIN = -0.9;
const PITCH_MAX = 0.22;
const YAW_LIMIT = 1.15;
const MAX_PROJECTILES = 24;
const CANNON_BASE_HEIGHT = 1.4;
const MUZZLE_DISTANCE = 4.2;
const SHOT_SPEED = 26;
const SHOT_LIFETIME_MS = 16000;

const obstaclePositions: Array<[number, number, number]> = [
  [-10, 2, -12],
  [9, 1.5, -8],
  [-4, 2.5, 8],
  [11, 1.5, 10],
];

function clampAim(aim: AimState) {
  return {
    pitch: THREE.MathUtils.clamp(aim.pitch, PITCH_MIN, PITCH_MAX),
    yaw: THREE.MathUtils.clamp(aim.yaw, -YAW_LIMIT, YAW_LIMIT),
  };
}

function projectileSeedFromAim(aim: AimState): ProjectileSeed {
  const direction = new THREE.Vector3(0, 0, -1)
    .applyEuler(new THREE.Euler(aim.pitch, aim.yaw, 0, "YXZ"))
    .normalize();
  const spawn = direction.clone().multiplyScalar(MUZZLE_DISTANCE).add(new THREE.Vector3(0, CANNON_BASE_HEIGHT, 0));
  const velocity = direction.multiplyScalar(SHOT_SPEED).add(new THREE.Vector3(0, 4, 0));

  return {
    id: crypto.randomUUID(),
    position: [spawn.x, spawn.y, spawn.z],
    velocity: [velocity.x, velocity.y, velocity.z],
  };
}

function degreesLabel(radians: number) {
  return Math.round(THREE.MathUtils.radToDeg(radians));
}

function SceneController({
  aimRef,
  keysRef,
  onAimSync,
  projectiles,
  onExpireProjectile,
}: {
  aimRef: MutableRefObject<AimState>;
  keysRef: MutableRefObject<Record<string, boolean>>;
  onAimSync: (aim: AimState) => void;
  projectiles: ProjectileSeed[];
  onExpireProjectile: (id: string) => void;
}) {
  const syncTimer = useRef(0);

  useFrame((_, delta) => {
    const nextAim = { ...aimRef.current };
    const step = TURN_SPEED * delta;
    const keys = keysRef.current;
    let changed = false;

    if (keys.ArrowUp || keys.KeyW) {
      nextAim.pitch -= step;
      changed = true;
    }
    if (keys.ArrowDown || keys.KeyS) {
      nextAim.pitch += step;
      changed = true;
    }
    if (keys.ArrowLeft || keys.KeyA) {
      nextAim.yaw += step;
      changed = true;
    }
    if (keys.ArrowRight || keys.KeyD) {
      nextAim.yaw -= step;
      changed = true;
    }

    if (!changed) {
      return;
    }

    const clampedAim = clampAim(nextAim);
    aimRef.current = clampedAim;
    syncTimer.current += delta;

    if (syncTimer.current >= 0.05) {
      syncTimer.current = 0;
      onAimSync(clampedAim);
    }
  });

  return (
    <>
      <color attach="background" args={["#061019"]} />
      <fog attach="fog" args={["#061019", 25, 86]} />
      <ambientLight intensity={1.05} />
      <hemisphereLight args={["#9fe3ff", "#13202b", 1.25]} />
      <directionalLight
        castShadow
        intensity={2.8}
        position={[16, 28, 12]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
      />
      <pointLight position={[0, 8, 0]} intensity={22} distance={38} decay={1.5} color="#8ad7ff" />
      <Sky distance={450000} sunPosition={[6, 1.5, 8]} inclination={0.58} azimuth={0.2} turbidity={8} rayleigh={2} />
      <Stars radius={75} depth={30} count={1800} factor={4} saturation={0.2} fade speed={0.5} />
      <Physics gravity={[0, -9.81, 0]}>
        <Arena />
        <Cannon aimRef={aimRef} />
        {projectiles.map((projectile) => (
          <ProjectileBall key={projectile.id} {...projectile} onExpire={onExpireProjectile} />
        ))}
      </Physics>
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={14}
        maxDistance={32}
        minPolarAngle={0.45}
        maxPolarAngle={Math.PI / 2.08}
        target={[0, 2.2, 0]}
      />
    </>
  );
}

function Arena() {
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <mesh receiveShadow position={[0, -0.5, 0]}>
          <boxGeometry args={[44, 1, 44]} />
          <meshStandardMaterial color="#39644f" roughness={0.92} metalness={0.06} />
        </mesh>
        <CuboidCollider args={[22, 0.5, 22]} position={[0, -0.5, 0]} restitution={0.55} friction={1.1} />
      </RigidBody>

      <RigidBody type="fixed" colliders={false}>
        <mesh castShadow receiveShadow position={[0, 3, -22]}>
          <boxGeometry args={[44, 6, 1.4]} />
          <meshStandardMaterial color="#1f3f58" roughness={0.88} />
        </mesh>
        <CuboidCollider args={[22, 3, 0.7]} position={[0, 3, -22]} restitution={0.72} />
      </RigidBody>

      <RigidBody type="fixed" colliders={false}>
        <mesh castShadow receiveShadow position={[0, 3, 22]}>
          <boxGeometry args={[44, 6, 1.4]} />
          <meshStandardMaterial color="#1f3f58" roughness={0.88} />
        </mesh>
        <CuboidCollider args={[22, 3, 0.7]} position={[0, 3, 22]} restitution={0.72} />
      </RigidBody>

      <RigidBody type="fixed" colliders={false}>
        <mesh castShadow receiveShadow position={[-22, 3, 0]}>
          <boxGeometry args={[1.4, 6, 44]} />
          <meshStandardMaterial color="#20455c" roughness={0.88} />
        </mesh>
        <CuboidCollider args={[0.7, 3, 22]} position={[-22, 3, 0]} restitution={0.72} />
      </RigidBody>

      <RigidBody type="fixed" colliders={false}>
        <mesh castShadow receiveShadow position={[22, 3, 0]}>
          <boxGeometry args={[1.4, 6, 44]} />
          <meshStandardMaterial color="#20455c" roughness={0.88} />
        </mesh>
        <CuboidCollider args={[0.7, 3, 22]} position={[22, 3, 0]} restitution={0.72} />
      </RigidBody>

      {obstaclePositions.map((position, index) => (
        <RigidBody key={`${position.join("-")}-${index}`} type="fixed" colliders={false}>
          <mesh castShadow receiveShadow position={position}>
            <boxGeometry args={[2.8, position[1] * 2, 2.8]} />
            <meshStandardMaterial color="#7f6748" roughness={0.95} metalness={0.05} />
          </mesh>
          <CuboidCollider args={[1.4, position[1], 1.4]} position={position} restitution={0.5} />
        </RigidBody>
      ))}

        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <circleGeometry args={[20, 72]} />
          <meshStandardMaterial color="#4d7b69" roughness={0.76} metalness={0.08} />
        </mesh>
    </group>
  );
}

function Cannon({ aimRef }: { aimRef: MutableRefObject<AimState> }) {
  const yawGroup = useRef<THREE.Group>(null);
  const pitchGroup = useRef<THREE.Group>(null);

  useFrame(() => {
    if (yawGroup.current) {
      yawGroup.current.rotation.y = aimRef.current.yaw;
    }
    if (pitchGroup.current) {
      pitchGroup.current.rotation.x = aimRef.current.pitch;
    }
  });

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.65, 0]}>
        <cylinderGeometry args={[1.8, 2.2, 1.1, 32]} />
        <meshStandardMaterial color="#374c65" roughness={0.8} metalness={0.35} />
      </mesh>

      <group ref={yawGroup} position={[0, CANNON_BASE_HEIGHT, 0]}>
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.8, 28, 28]} />
          <meshStandardMaterial color="#5c708a" roughness={0.55} metalness={0.35} />
        </mesh>
        <group ref={pitchGroup}>
          <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0.2, -2]}>
            <cylinderGeometry args={[0.45, 0.68, 4.6, 28]} />
            <meshStandardMaterial color="#7f8ea3" roughness={0.42} metalness={0.58} />
          </mesh>
          <mesh castShadow position={[0, 0.2, -4.3]}>
            <sphereGeometry args={[0.18, 16, 16]} />
            <meshStandardMaterial color="#90a4bc" roughness={0.35} metalness={0.72} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function ProjectileBall({ id, position, velocity, onExpire }: ProjectileBallProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const createdAt = useRef(0);
  const expired = useRef(false);

  useEffect(() => {
    createdAt.current = performance.now();
    bodyRef.current?.setLinvel(
      {
        x: velocity[0],
        y: velocity[1],
        z: velocity[2],
      },
      true,
    );
  }, [velocity]);

  useFrame(() => {
    const body = bodyRef.current;
    if (!body || expired.current) {
      return;
    }

    const translation = body.translation();
    const isExpired =
      translation.y < -8 ||
      Math.abs(translation.x) > 32 ||
      Math.abs(translation.z) > 32 ||
      performance.now() - createdAt.current > SHOT_LIFETIME_MS;

    if (isExpired) {
      expired.current = true;
      onExpire(id);
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      colliders="ball"
      position={position}
      restitution={0.78}
      friction={0.5}
      linearDamping={0.08}
      angularDamping={0.28}
      canSleep={false}
    >
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[0.65, 24, 24]} />
        <meshStandardMaterial color="#ff8c42" emissive="#d4551e" emissiveIntensity={0.35} roughness={0.35} metalness={0.08} />
      </mesh>
    </RigidBody>
  );
}

export default function PhysicsDemo() {
  const aimRef = useRef<AimState>(DEFAULT_AIM);
  const keysRef = useRef<Record<string, boolean>>({});
  const [aimDisplay, setAimDisplay] = useState(DEFAULT_AIM);
  const [projectiles, setProjectiles] = useState<ProjectileSeed[]>([]);
  const [shotsFired, setShotsFired] = useState(0);
  const activeProjectiles = useDeferredValue(projectiles.length);

  const resetSession = useCallback(() => {
    aimRef.current = DEFAULT_AIM;
    setAimDisplay(DEFAULT_AIM);
    startTransition(() => {
      setProjectiles([]);
      setShotsFired(0);
    });
  }, []);

  const removeProjectile = useCallback((id: string) => {
    startTransition(() => {
      setProjectiles((current) => current.filter((projectile) => projectile.id !== id));
    });
  }, []);

  const fireProjectile = useCallback(() => {
    const projectile = projectileSeedFromAim(aimRef.current);

    startTransition(() => {
      setProjectiles((current) => {
        if (current.length >= MAX_PROJECTILES) {
          return [...current.slice(1), projectile];
        }

        return [...current, projectile];
      });
      setShotsFired((value) => value + 1);
    });
  }, []);

  useEffect(() => {
    const trackedCodes = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"]);

    const onKeyDown = (event: KeyboardEvent) => {
      if (trackedCodes.has(event.code)) {
        event.preventDefault();
        keysRef.current[event.code] = true;
      }

      if ((event.code === "Space" || event.code === "Enter") && !event.repeat) {
        event.preventDefault();
        fireProjectile();
      }

      if (event.code === "KeyR") {
        event.preventDefault();
        resetSession();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current[event.code] = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [fireProjectile, resetSession]);

  const stats = useMemo(
    () => [
      { label: "Pitch", value: `${degreesLabel(aimDisplay.pitch)}deg` },
      { label: "Yaw", value: `${degreesLabel(aimDisplay.yaw)}deg` },
      { label: "Shots", value: shotsFired.toString().padStart(2, "0") },
      { label: "Active", value: activeProjectiles.toString().padStart(2, "0") },
    ],
    [activeProjectiles, aimDisplay.pitch, aimDisplay.yaw, shotsFired],
  );

  return (
    <div className={styles.page}>
      <div className={styles.canvasWrap}>
        <Canvas
          camera={{ position: [12, 9, 14], fov: 52 }}
          dpr={[1, 1.8]}
          shadows={{ type: THREE.PCFShadowMap }}
          onCreated={({ camera }) => {
            camera.lookAt(0, 2.2, 0);
          }}
        >
          <SceneController
            aimRef={aimRef}
            keysRef={keysRef}
            onAimSync={setAimDisplay}
            projectiles={projectiles}
            onExpireProjectile={removeProjectile}
          />
        </Canvas>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.panelLabel}>Live controls</p>
            <h2>Cannon telemetry</h2>
          </div>
          <button className={styles.resetButton} type="button" onClick={resetSession}>
            Reset
          </button>
        </div>

        <div className={styles.statsGrid}>
          {stats.map((stat) => (
            <div key={stat.label} className={styles.statCard}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>

        <div className={styles.keyGroup}>
          <div className={styles.keyRow}>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd>
            <span>or arrow keys to aim</span>
          </div>
          <div className={styles.keyRow}>
            <kbd>Space</kbd>
            <kbd>Enter</kbd>
            <span>fire a shot</span>
          </div>
          <div className={styles.keyRow}>
            <kbd>R</kbd>
            <span>clear the arena</span>
          </div>
          <div className={styles.keyRow}>
            <kbd>Drag</kbd>
            <span>orbit the camera</span>
          </div>
        </div>
      </section>
    </div>
  );
}
