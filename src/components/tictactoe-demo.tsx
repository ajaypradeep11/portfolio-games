"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import GameInputPad from "@/components/game-input-pad";
import styles from "@/app/page.module.css";

type Player = "X" | "O";
type Winner = Player | "Draw" | null;

type AimState = {
  pitch: number;
  yaw: number;
};

type Projectile = {
  id: string;
  owner: Player;
  position: [number, number, number];
  velocity: [number, number, number];
  bornAt: number;
};

type CameraPreset = {
  position: [number, number, number];
  target: [number, number, number];
};

const CELL_SIZE = 3.6;
const GRID_LINE_THICKNESS = 0.72;
const BOARD_Z = -13;
const BOARD_Y = -2.8;
const BOARD_HALF = CELL_SIZE * 1.5;
const BOARD_SIZE = CELL_SIZE * 3;
const CELL_FACE_SIZE = CELL_SIZE - GRID_LINE_THICKNESS;
const BOARD_PANEL_SIZE = BOARD_SIZE + GRID_LINE_THICKNESS;
const PROJECTILE_SPEED = 20;
const PROJECTILE_GRAVITY = 8.5;
const MAX_PROJECTILE_AGE_MS = 4800;
const AIM_STEP = 1.1;
const DEFAULT_AIM: AimState = { pitch: 0.14, yaw: 0 };
const PITCH_MIN = -0.1;
const PITCH_MAX = 0.45;
const YAW_LIMIT = 0.52;
const SHOOTER_POSITION = new THREE.Vector3(0, -6.3, 5.4);
const YAW_PIVOT_OFFSET = new THREE.Vector3(0, 1.2, 0);
const BARREL_TIP_OFFSET = new THREE.Vector3(0, 0, -4.35);
const DEFAULT_CAMERA_PRESET: CameraPreset = {
  position: [1.2, 3.4, 11.6],
  target: [0.3, -4.2, -0.4],
};
const CAMERA_PRESET_STORAGE_KEY = "tictactoe-camera-preset";
const MARK_PIXEL_SIZE = 0.58;
const MARK_PIXEL_DEPTH = 0.42;
const MARK_PIXEL_STEP = 0.64;
const X_MARK_PIXELS = [
  [-2, 2],
  [2, 2],
  [-1, 1],
  [1, 1],
  [0, 0],
  [-1, -1],
  [1, -1],
  [-2, -2],
  [2, -2],
] as const;
const O_MARK_PIXELS = [
  [-1, 2],
  [0, 2],
  [1, 2],
  [-2, 1],
  [2, 1],
  [-2, 0],
  [2, 0],
  [-2, -1],
  [2, -1],
  [-1, -2],
  [0, -2],
  [1, -2],
] as const;
const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

const cellCenters: Array<[number, number, number]> = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3);
  const col = index % 3;

  return [
    (col - 1) * CELL_SIZE,
    BOARD_Y + (1 - row) * CELL_SIZE,
    BOARD_Z + 0.18,
  ];
});

function clampAim(aim: AimState) {
  return {
    pitch: THREE.MathUtils.clamp(aim.pitch, PITCH_MIN, PITCH_MAX),
    yaw: THREE.MathUtils.clamp(aim.yaw, -YAW_LIMIT, YAW_LIMIT),
  };
}

function getProjectileVelocity(aim: AimState) {
  const direction = new THREE.Vector3(0, 0, -1)
    .applyEuler(new THREE.Euler(aim.pitch, aim.yaw, 0, "YXZ"))
    .normalize();

  return direction.multiplyScalar(PROJECTILE_SPEED);
}

function getMuzzlePosition(aim: AimState) {
  return SHOOTER_POSITION.clone()
    .add(YAW_PIVOT_OFFSET)
    .add(BARREL_TIP_OFFSET.clone().applyEuler(new THREE.Euler(aim.pitch, aim.yaw, 0, "YXZ")));
}

function readStoredCameraPreset(): CameraPreset | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawPreset = window.localStorage.getItem(CAMERA_PRESET_STORAGE_KEY);
  if (!rawPreset) {
    return null;
  }

  try {
    const parsedPreset = JSON.parse(rawPreset) as Partial<CameraPreset>;
    if (
      Array.isArray(parsedPreset.position) &&
      parsedPreset.position.length === 3 &&
      Array.isArray(parsedPreset.target) &&
      parsedPreset.target.length === 3
    ) {
      return {
        position: [
          Number(parsedPreset.position[0]),
          Number(parsedPreset.position[1]),
          Number(parsedPreset.position[2]),
        ],
        target: [
          Number(parsedPreset.target[0]),
          Number(parsedPreset.target[1]),
          Number(parsedPreset.target[2]),
        ],
      };
    }
  } catch {
    window.localStorage.removeItem(CAMERA_PRESET_STORAGE_KEY);
  }

  return null;
}

function writeStoredCameraPreset(preset: CameraPreset) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CAMERA_PRESET_STORAGE_KEY, JSON.stringify(preset));
}

function getCellIndexFromImpact(x: number, y: number) {
  const localY = y - BOARD_Y;

  if (x < -BOARD_HALF || x > BOARD_HALF || localY < -BOARD_HALF || localY > BOARD_HALF) {
    return null;
  }

  const col = THREE.MathUtils.clamp(Math.floor((x + BOARD_HALF) / CELL_SIZE), 0, 2);
  const row = THREE.MathUtils.clamp(Math.floor((BOARD_HALF - localY) / CELL_SIZE), 0, 2);

  return row * 3 + col;
}

function resolveWinner(board: Array<Player | null>): Winner {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  if (board.every(Boolean)) {
    return "Draw";
  }

  return null;
}

function winnerLabel(value: Winner) {
  if (!value) {
    return "Live";
  }

  if (value === "Draw") {
    return "Draw";
  }

  return `${value} wins`;
}

function CameraRig({
  cameraPreset,
  controlsRef,
}: {
  cameraPreset: CameraPreset;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(...cameraPreset.position);
    camera.lookAt(...cameraPreset.target);

    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(...cameraPreset.target);
      controls.update();
    }
  }, [camera, cameraPreset, controlsRef]);

  return null;
}

function SceneController({
  aimRef,
  keysRef,
  projectilesRef,
  controlsRef,
  cameraPreset,
  onAimSync,
  onProjectilesSync,
  onCellHit,
}: {
  aimRef: MutableRefObject<AimState>;
  keysRef: MutableRefObject<Record<string, boolean>>;
  projectilesRef: MutableRefObject<Projectile[]>;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  cameraPreset: CameraPreset;
  onAimSync: (aim: AimState) => void;
  onProjectilesSync: (projectiles: Projectile[]) => void;
  onCellHit: (cellIndex: number, owner: Player) => void;
}) {
  const syncTimer = useRef(0);

  useFrame((_, delta) => {
    const keys = keysRef.current;
    const nextAim = { ...aimRef.current };
    let aimChanged = false;

    if (keys.ArrowUp || keys.KeyW) {
      nextAim.pitch += AIM_STEP * delta;
      aimChanged = true;
    }
    if (keys.ArrowDown || keys.KeyS) {
      nextAim.pitch -= AIM_STEP * delta;
      aimChanged = true;
    }
    if (keys.ArrowLeft || keys.KeyA) {
      nextAim.yaw += AIM_STEP * delta;
      aimChanged = true;
    }
    if (keys.ArrowRight || keys.KeyD) {
      nextAim.yaw -= AIM_STEP * delta;
      aimChanged = true;
    }

    if (aimChanged) {
      const clampedAim = clampAim(nextAim);
      aimRef.current = clampedAim;
      syncTimer.current += delta;

      if (syncTimer.current >= 0.05) {
        syncTimer.current = 0;
        onAimSync(clampedAim);
      }
    }

    if (projectilesRef.current.length === 0) {
      return;
    }

    const nextProjectiles: Projectile[] = [];
    const impacts: Array<{ cellIndex: number; owner: Player }> = [];

    for (const projectile of projectilesRef.current) {
      const [px, py, pz] = projectile.position;
      const [vx, vy, vz] = projectile.velocity;

      const nextVelocity: [number, number, number] = [vx, vy - PROJECTILE_GRAVITY * delta, vz];
      const nextPosition: [number, number, number] = [
        px + nextVelocity[0] * delta,
        py + nextVelocity[1] * delta,
        pz + nextVelocity[2] * delta,
      ];

      const crossedBoard = pz > BOARD_Z && nextPosition[2] <= BOARD_Z + 0.15;
      if (crossedBoard) {
        const cellIndex = getCellIndexFromImpact(nextPosition[0], nextPosition[1]);
        if (cellIndex !== null) {
          impacts.push({ cellIndex, owner: projectile.owner });
        }
        continue;
      }

      const expired =
        nextPosition[2] < BOARD_Z - 2 ||
        nextPosition[1] < -11 ||
        Math.abs(nextPosition[0]) > 14 ||
        Date.now() - projectile.bornAt > MAX_PROJECTILE_AGE_MS;

      if (!expired) {
        nextProjectiles.push({
          ...projectile,
          position: nextPosition,
          velocity: nextVelocity,
        });
      }
    }

    projectilesRef.current = nextProjectiles;
    onProjectilesSync(nextProjectiles);

    for (const impact of impacts) {
      onCellHit(impact.cellIndex, impact.owner);
    }
  });

  return (
    <>
      <color attach="background" args={["#020204"]} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 8, 9]} intensity={2.3} color="#f0f7ff" />
      <pointLight position={[0, 0, 8]} intensity={60} distance={32} decay={2} color="#6b5cff" />
      <pointLight position={[0, 2, -4]} intensity={18} distance={18} decay={2} color="#4fe54f" />
      <Stars radius={45} depth={25} count={900} factor={2.5} saturation={0.1} fade speed={0.15} />
      <CameraRig cameraPreset={cameraPreset} controlsRef={controlsRef} />
      <TicTacToeBoard />
      <Shooter aimRef={aimRef} />
      <OrbitControls
        makeDefault
        ref={controlsRef}
        enablePan={false}
        minDistance={5.8}
        maxDistance={14}
        minPolarAngle={0.95}
        maxPolarAngle={1.95}
        minAzimuthAngle={-0.65}
        maxAzimuthAngle={0.65}
        target={cameraPreset.target}
      />
    </>
  );
}

function TicTacToeBoard() {
  const gridMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3217ff",
        emissive: "#2612c6",
        emissiveIntensity: 0.45,
        roughness: 0.34,
        metalness: 0.28,
      }),
    [],
  );
  const cellPanelMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#000000",
        transparent: true,
        opacity: 0.28,
      }),
    [],
  );

  return (
    <group position={[0, BOARD_Y, BOARD_Z]}>
      <mesh position={[0, 0, -0.18]}>
        <planeGeometry args={[BOARD_PANEL_SIZE, BOARD_PANEL_SIZE]} />
        <primitive object={cellPanelMaterial} attach="material" />
      </mesh>

      {cellCenters.map(([x, y], index) => (
        <mesh key={`cell-${index}`} position={[x, y, -0.1]}>
          <planeGeometry args={[CELL_FACE_SIZE, CELL_FACE_SIZE]} />
          <primitive object={cellPanelMaterial} attach="material" />
        </mesh>
      ))}

      <mesh position={[-CELL_SIZE / 2, 0, 0.16]}>
        <boxGeometry args={[GRID_LINE_THICKNESS, BOARD_PANEL_SIZE, 0.6]} />
        <primitive object={gridMaterial} attach="material" />
      </mesh>
      <mesh position={[CELL_SIZE / 2, 0, 0.16]}>
        <boxGeometry args={[GRID_LINE_THICKNESS, BOARD_PANEL_SIZE, 0.6]} />
        <primitive object={gridMaterial} attach="material" />
      </mesh>
      <mesh position={[0, CELL_SIZE / 2, 0.16]}>
        <boxGeometry args={[BOARD_PANEL_SIZE, GRID_LINE_THICKNESS, 0.6]} />
        <primitive object={gridMaterial} attach="material" />
      </mesh>
      <mesh position={[0, -CELL_SIZE / 2, 0.16]}>
        <boxGeometry args={[BOARD_PANEL_SIZE, GRID_LINE_THICKNESS, 0.6]} />
        <primitive object={gridMaterial} attach="material" />
      </mesh>
    </group>
  );
}

function Shooter({ aimRef }: { aimRef: MutableRefObject<AimState> }) {
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
    <group position={SHOOTER_POSITION.toArray() as [number, number, number]}>
      <mesh castShadow>
        <cylinderGeometry args={[1.8, 2.4, 1.8, 30]} />
        <meshStandardMaterial color="#1f2b61" roughness={0.62} metalness={0.25} />
      </mesh>

      <group ref={yawGroup} position={[0, 1.2, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.72, 24, 24]} />
          <meshStandardMaterial color="#465a95" roughness={0.45} metalness={0.22} />
        </mesh>
        <group ref={pitchGroup}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -1.9]} castShadow>
            <cylinderGeometry args={[0.42, 0.65, 4.2, 24]} />
            <meshStandardMaterial color="#738ac3" roughness={0.32} metalness={0.48} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function ProjectileMesh({ projectile }: { projectile: Projectile }) {
  return (
    <mesh position={projectile.position} castShadow>
      <sphereGeometry args={[0.28, 20, 20]} />
      <meshStandardMaterial
        color={projectile.owner === "X" ? "#ff5a36" : "#79ed50"}
        emissive={projectile.owner === "X" ? "#f64f2c" : "#5ed13c"}
        emissiveIntensity={0.55}
        roughness={0.3}
        metalness={0.08}
      />
    </mesh>
  );
}

function MarkMesh({ player, position }: { player: Player; position: [number, number, number] }) {
  const pixels = player === "X" ? X_MARK_PIXELS : O_MARK_PIXELS;
  const color = player === "X" ? "#ff3d20" : "#56ff17";

  return (
    <group position={position}>
      {pixels.map(([gridX, gridY], index) => (
        <mesh
          key={`${player.toLowerCase()}-${index}`}
          position={[gridX * MARK_PIXEL_STEP, gridY * MARK_PIXEL_STEP, 0]}
          castShadow
        >
          <boxGeometry args={[MARK_PIXEL_SIZE, MARK_PIXEL_SIZE, MARK_PIXEL_DEPTH]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}

export default function TicTacToeDemo() {
  const aimRef = useRef<AimState>(DEFAULT_AIM);
  const keysRef = useRef<Record<string, boolean>>({});
  const projectilesRef = useRef<Projectile[]>([]);
  const boardRef = useRef<Array<Player | null>>(Array(9).fill(null));
  const winnerRef = useRef<Winner>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const [aimDisplay, setAimDisplay] = useState(DEFAULT_AIM);
  const [board, setBoard] = useState<Array<Player | null>>(Array(9).fill(null));
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>(() => readStoredCameraPreset() ?? DEFAULT_CAMERA_PRESET);
  const [currentPlayer, setCurrentPlayer] = useState<Player>("X");
  const [winner, setWinner] = useState<Winner>(null);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    projectilesRef.current = projectiles;
  }, [projectiles]);

  useEffect(() => {
    winnerRef.current = winner;
  }, [winner]);

  const resetGame = useCallback(() => {
    const emptyBoard = Array(9).fill(null) as Array<Player | null>;
    aimRef.current = DEFAULT_AIM;
    boardRef.current = emptyBoard;
    projectilesRef.current = [];
    winnerRef.current = null;
    setAimDisplay(DEFAULT_AIM);
    setCurrentPlayer("X");
    setWinner(null);
    startTransition(() => {
      setBoard(emptyBoard);
      setProjectiles([]);
    });
  }, []);

  const handleCellHit = useCallback((cellIndex: number, owner: Player) => {
    if (winnerRef.current) {
      return;
    }

    const currentBoard = boardRef.current;
    if (currentBoard[cellIndex]) {
      return;
    }

    const nextBoard = [...currentBoard];
    nextBoard[cellIndex] = owner;
    boardRef.current = nextBoard;
    setBoard(nextBoard);

    const nextWinner = resolveWinner(nextBoard);
    winnerRef.current = nextWinner;
    setWinner(nextWinner);

    if (!nextWinner) {
      setCurrentPlayer(owner === "X" ? "O" : "X");
    }
  }, []);

  const handleProjectilesSync = useCallback((nextProjectiles: Projectile[]) => {
    setProjectiles(nextProjectiles);
  }, []);

  const saveCurrentView = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    const nextPreset: CameraPreset = {
      position: [
        controls.object.position.x,
        controls.object.position.y,
        controls.object.position.z,
      ],
      target: [controls.target.x, controls.target.y, controls.target.z],
    };

    writeStoredCameraPreset(nextPreset);
    setCameraPreset(nextPreset);
  }, []);

  const fireShot = useCallback(() => {
    if (winnerRef.current) {
      return;
    }

    const velocity = getProjectileVelocity(aimRef.current);
    const muzzlePosition = getMuzzlePosition(aimRef.current);
    const nextProjectile: Projectile = {
      id: crypto.randomUUID(),
      owner: currentPlayer,
      position: [muzzlePosition.x, muzzlePosition.y, muzzlePosition.z],
      velocity: [velocity.x, velocity.y, velocity.z],
      bornAt: Date.now(),
    };

    startTransition(() => {
      setProjectiles((current) => [...current, nextProjectile]);
    });
  }, [currentPlayer]);

  useEffect(() => {
    const trackedCodes = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"]);

    const onKeyDown = (event: KeyboardEvent) => {
      if (trackedCodes.has(event.code)) {
        event.preventDefault();
        keysRef.current[event.code] = true;
      }

      if ((event.code === "Space" || event.code === "Enter") && !event.repeat) {
        event.preventDefault();
        fireShot();
      }

      if (event.code === "KeyR") {
        event.preventDefault();
        resetGame();
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
  }, [fireShot, resetGame]);

  const stats = useMemo(
    () => [
      { label: "Turn", value: currentPlayer },
      { label: "State", value: winnerLabel(winner) },
    ],
    [currentPlayer, winner],
  );

  const aimSummary = `${Math.round(THREE.MathUtils.radToDeg(aimDisplay.pitch))}deg pitch / ${Math.round(THREE.MathUtils.radToDeg(aimDisplay.yaw))}deg yaw`;

  return (
    <div className={styles.page}>
      <div className={styles.canvasWrap}>
        <Canvas
          camera={{ position: cameraPreset.position, fov: 42 }}
          dpr={[1, 1.8]}
        >
          <SceneController
            aimRef={aimRef}
            keysRef={keysRef}
            projectilesRef={projectilesRef}
            controlsRef={controlsRef}
            cameraPreset={cameraPreset}
            onAimSync={setAimDisplay}
            onProjectilesSync={handleProjectilesSync}
            onCellHit={handleCellHit}
          />

          {projectiles.map((projectile) => (
            <ProjectileMesh key={projectile.id} projectile={projectile} />
          ))}

          {board.map((cell, index) => {
            if (!cell) {
              return null;
            }

            return <MarkMesh key={`mark-${index}`} player={cell} position={cellCenters[index]} />;
          })}
        </Canvas>
      </div>

      <section className={`${styles.panel} ${styles.tictactoePanel}`}>
        <div className={`${styles.panelHeader} ${styles.tictactoePanelHeader}`}>
          <div className={styles.tictactoeTitleBlock}>
            <h2 className={styles.tictactoeTitle}>Tic-Tac-Toe</h2>
          </div>
          <div className={`${styles.panelActions} ${styles.tictactoePanelActions}`}>
            <button
              aria-label="Save current camera view"
              className={`${styles.resetButton} ${styles.tictactoeAction}`}
              type="button"
              onClick={saveCurrentView}
            >
              Save
            </button>
            <button className={`${styles.resetButton} ${styles.tictactoeAction}`} type="button" onClick={resetGame}>
              Reset
            </button>
          </div>
        </div>

        <div className={`${styles.statsGrid} ${styles.tictactoeStatsGrid}`}>
          {stats.map((stat) => (
            <div key={stat.label} className={`${styles.statCard} ${styles.tictactoeStatCard}`}>
              <span>{stat.label}</span>
              <strong
                className={
                  stat.value === "X"
                    ? styles.statusAccentX
                    : stat.value === "O"
                      ? styles.statusAccentO
                      : stat.value === "Draw"
                        ? styles.statusAccentDraw
                        : stat.value === "X wins"
                          ? styles.statusAccentX
                          : stat.value === "O wins"
                            ? styles.statusAccentO
                            : undefined
                }
              >
                {stat.value}
              </strong>
            </div>
          ))}
        </div>

        <p className={`${styles.panelNote} ${styles.tictactoeHint}`}>
          Aim {aimSummary} · WASD aim · Space fire · R reset
        </p>
      </section>

      <GameInputPad keysRef={keysRef} onShoot={fireShot} />
    </div>
  );
}
