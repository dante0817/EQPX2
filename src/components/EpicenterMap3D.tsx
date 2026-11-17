import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Compass,
  Layers,
  RotateCcw,
} from 'lucide-react';
import {
  ACTIVE_VOLCANOES,
  CRUSTAL_MODEL_1D,
  DEFAULT_PH_CENTER,
  EQPEvent,
  FAULT_TRACES,
  isEventUnlocated,
  PHILSTA_DATABASE,
  StationMeta,
  StationPick,
  TECTONIC_PLATES,
} from '../data/eqpData';
import {
  BLOCK_HALF_UNITS,
  computeBlockMaxDepthKm,
  computeDepthDiagnostics,
  createDepthScaleTexture,
  depthKmToSceneY,
  elevKmToSceneY,
  evaluateTopographyKm,
  kmPerDegLon,
  KM_PER_DEG_LAT,
  lonLatToSceneXZ,
  SCENE_KM_PER_UNIT,
  sceneXZToLonLat,
} from '../utils/seismology3d';
import { PeisBandCode, ShakeMapResult } from '../utils/shakemap';
import {
  stationPickMatchesRegion,
  type StationRegionFilter,
} from '../utils/stationRegions';
import { MapScaleBar } from './MapScaleBar';
import {
  FloatingStationPopup,
  StationHoverCard,
} from './StationMapPopup';
import type { MapSnapshotProvider } from '../utils/mapSnapshotExport';

interface EpicenterMap3DProps {
  event: EQPEvent;
  stations?: StationMeta[];
  selectedStation: string | null;
  onSelectStation: (sta: string | null) => void;
  showFaults: boolean;
  showPlates?: boolean;
  showVolcanoes: boolean;
  showStations: boolean;
  showGrid: boolean;
  shakeMap?: ShakeMapResult | null;
  showShakeMap?: boolean;
  shakeMapOpacity?: number;
  visibleShakeBands?: Record<PeisBandCode, boolean>;
  highlightedShakeBand?: PeisBandCode | null;
  compact?: boolean;
  regionFilter?: StationRegionFilter;
  onSnapshotProviderReady?: (provider: MapSnapshotProvider | null) => void;
}

type CameraPresetId = 'iso' | 'ew' | 'ns' | 'top' | 'focus';
type StrataDisplayMode = 'cutaway' | 'planes' | 'wire';

interface HoveredStationTooltip {
  pick: StationPick;
  meta: StationMeta | undefined;
  screenX: number;
  screenY: number;
  containerWidth: number;
  containerHeight: number;
}

const _projVec = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl =
      probeCanvas.getContext('webgl2') ||
      (probeCanvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function getStationResidualColorHex(pick: StationPick): number {
  if (pick.pExcluded) return 0x94a3b8;
  const maxRes = Math.max(Math.abs(pick.resP), Math.abs(pick.resS));
  if (maxRes >= 1.0) return 0xe11d48;
  if (maxRes > 0.5) return 0xf59e0b;
  return 0x38bdf8;
}

function topoElevationToRgb(elevKm: number, targetColor: THREE.Color): void {
  if (elevKm < -4.5) {
    targetColor.setHex(0x082f49); // Deep trench
  } else if (elevKm < -1.2) {
    const t = (elevKm + 4.5) / 3.3;
    targetColor.setHex(0x0c4a6e).lerp(new THREE.Color(0x0369a1), t);
  } else if (elevKm < 0) {
    const t = (elevKm + 1.2) / 1.2;
    targetColor.setHex(0x0369a1).lerp(new THREE.Color(0x38bdf8), t * 0.65);
  } else if (elevKm < 0.35) {
    const t = elevKm / 0.35;
    targetColor.setHex(0x3b6e52).lerp(new THREE.Color(0x5b8c5a), t);
  } else if (elevKm < 1.15) {
    const t = (elevKm - 0.35) / 0.8;
    targetColor.setHex(0x5b8c5a).lerp(new THREE.Color(0x9a8f6a), t);
  } else {
    const t = Math.min(1, (elevKm - 1.15) / 1.4);
    targetColor.setHex(0x9a8f6a).lerp(new THREE.Color(0xd6cfc2), t);
  }
}

function disposeObject3DTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const anyObj = obj as unknown as {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (anyObj.geometry) {
      anyObj.geometry.dispose();
    }
    if (anyObj.material) {
      const mats = Array.isArray(anyObj.material) ? anyObj.material : [anyObj.material];
      for (const m of mats) {
        const stdMat = m as THREE.MeshStandardMaterial;
        if (stdMat.map) stdMat.map.dispose();
        m.dispose();
      }
    }
  });
}

function createContourLabelSprite(roman: string, strokeHex: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 56;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Crisp rectangular cartographic badge
    const padX = 12;
    const padY = 8;
    const w = canvas.width - padX * 2;
    const h = canvas.height - padY * 2;
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(padX + r, padY);
    ctx.lineTo(padX + w - r, padY);
    ctx.quadraticCurveTo(padX + w, padY, padX + w, padY + r);
    ctx.lineTo(padX + w, padY + h - r);
    ctx.quadraticCurveTo(padX + w, padY + h, padX + w - r, padY + h);
    ctx.lineTo(padX + r, padY + h);
    ctx.quadraticCurveTo(padX, padY + h, padX, padY + h - r);
    ctx.lineTo(padX, padY + r);
    ctx.quadraticCurveTo(padX, padY, padX + r, padY);
    ctx.closePath();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = strokeHex;
    ctx.stroke();

    ctx.font = '700 26px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = strokeHex;
    ctx.fillText(roman, canvas.width / 2, canvas.height / 2 + 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.62, 0.36, 1);
  sprite.renderOrder = 6;
  return sprite;
}

export const EpicenterMap3D: React.FC<EpicenterMap3DProps> = ({
  event,
  stations = PHILSTA_DATABASE,
  selectedStation,
  onSelectStation,
  showFaults,
  showPlates = true,
  showVolcanoes,
  showStations,
  showGrid,
  shakeMap = null,
  showShakeMap = false,
  shakeMapOpacity = 0.4,
  visibleShakeBands,
  highlightedShakeBand = null,
  compact = false,
  regionFilter = 'ALL',
  onSnapshotProviderReady,
}) => {
  const shakeLatestStateRef = useRef({
    showShakeMap,
    shakeMapOpacity,
    visibleShakeBands,
    highlightedShakeBand,
  });
  shakeLatestStateRef.current = {
    showShakeMap,
    shakeMapOpacity,
    visibleShakeBands,
    highlightedShakeBand,
  };
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [verticalExag, setVerticalExag] = useState<number>(2);
  const [strataMode, setStrataMode] = useState<StrataDisplayMode>('cutaway');
  const [showSlab, setShowSlab] = useState<boolean>(true);
  const [showRays, setShowRays] = useState<boolean>(true);
  const [activePreset, setActivePreset] = useState<CameraPresetId>('iso');
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState<boolean>(false);
  const [hoveredStation, setHoveredStation] = useState<HoveredStationTooltip | null>(null);
  const [clickedStationCode, setClickedStationCode] = useState<string | null>(null);
  const [metersPerPixel, setMetersPerPixel] = useState<number>(850);

  const stationMetaMap = useMemo(() => {
    const map: Record<string, StationMeta> = {};
    for (const s of stations) {
      map[s.code] = s;
    }
    return map;
  }, [stations]);

  const clickedStationPick = useMemo(() => {
    if (!showStations || !clickedStationCode) return null;
    return (
      event.picks.find(
        (p) =>
          p.sta === clickedStationCode &&
          stationPickMatchesRegion(p, regionFilter, stationMetaMap)
      ) ?? null
    );
  }, [showStations, clickedStationCode, event.picks, regionFilter, stationMetaMap]);

  const diagnostics = useMemo(
    () => computeDepthDiagnostics(event, stations),
    [event, stations]
  );
  const maxDepthKm = useMemo(() => computeBlockMaxDepthKm(event), [event]);

  // Mutable refs so React updates never tear down the WebGL renderer
  const onSelectStationRef = useRef(onSelectStation);
  onSelectStationRef.current = onSelectStation;

  const selectedStationRef = useRef(selectedStation);
  selectedStationRef.current = selectedStation;

  const eventRef = useRef(event);
  eventRef.current = event;

  const stationMetaMapRef = useRef(stationMetaMap);
  stationMetaMapRef.current = stationMetaMap;

  const sceneRefs = useRef<{
    renderer: THREE.WebGLRenderer | null;
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    controls: OrbitControls | null;
    worldGroup: THREE.Group | null;
    layerGroups: {
      faults: THREE.Group | null;
      boundaries: THREE.Group | null;
      slab: THREE.Group | null;
      volcanoes: THREE.Group | null;
      stations: THREE.Group | null;
      rays: THREE.Group | null;
      grid: THREE.Group | null;
      strataWalls: THREE.Group | null;
      strataPlanes: THREE.Group | null;
      shakeMap: THREE.Group | null;
    };
    stationTargets: THREE.Object3D[];
    stationRingMap: Map<string, THREE.Mesh>;
    rayMeshMap: Map<string, THREE.Line>;
    requestRender: () => void;
    applyCameraPreset: (preset: CameraPresetId, exag: number, depthKm: number) => void;
  }>({
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    worldGroup: null,
    layerGroups: {
      faults: null,
      boundaries: null,
      slab: null,
      volcanoes: null,
      stations: null,
      rays: null,
      grid: null,
      strataWalls: null,
      strataPlanes: null,
      shakeMap: null,
    },
    stationTargets: [],
    stationRingMap: new Map(),
    rayMeshMap: new Map(),
    requestRender: () => {},
    applyCameraPreset: () => {},
  });

  // 1. Initialize WebGLRenderer, Scene, Lights, RoomEnvironment, OrbitControls, Raycaster ONCE
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      });
    } catch {
      setWebglError('WebGL context could not be initialized in this browser environment.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initWidth = Math.max(320, mount.clientWidth || 800);
    const initHeight = Math.max(320, mount.clientHeight || 520);
    renderer.setSize(initWidth, initHeight);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgColor = 0x0b1220;
    scene.background = new THREE.Color(bgColor);
    scene.fog = new THREE.FogExp2(bgColor, 0.011);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(44, initWidth / initHeight, 0.1, 220);
    camera.position.set(14.5, 9.2, 15.0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.92;
    controls.minDistance = 4.5;
    controls.maxDistance = 48;
    controls.target.set(0, -1.2, 0);
    controls.update();

    // 3-Point Studio + Geophysical Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x1e293b, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.85);
    keyLight.position.set(16, 22, 14);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.left = -14;
    keyLight.shadow.camera.right = 14;
    keyLight.shadow.camera.top = 14;
    keyLight.shadow.camera.bottom = -14;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 65;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.65);
    rimLight.position.set(-18, 8, -16);
    scene.add(rimLight);

    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    // Coalesced On-Demand Rendering + Software WebGL Fence Pacing
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;
    let isTransitioningCamera = false;
    let lastClockMs = performance.now();

    function afterDraw(cb: () => void) {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;

        const now = performance.now();
        const delta = Math.min(0.1, (now - lastClockMs) / 1000);
        lastClockMs = now;

        if (isTransitioningCamera) {
          camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetPos.x, 8, delta);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetPos.y, 8, delta);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetPos.z, 8, delta);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetLook.x, 8, delta);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetLook.y, 8, delta);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetLook.z, 8, delta);

          const posDist = camera.position.distanceTo(_targetPos);
          const tgtDist = controls.target.distanceTo(_targetLook);
          if (posDist < 0.03 && tgtDist < 0.03) {
            camera.position.copy(_targetPos);
            controls.target.copy(_targetLook);
            isTransitioningCamera = false;
          } else {
            renderDirty = true;
          }
        }

        controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty && !disposed) requestRender();
        };
        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    }

    function applyCameraPreset(preset: CameraPresetId, exag: number, depthKm: number) {
      const hypoY = depthKmToSceneY(depthKm, exag);
      const midY = Math.min(-0.8, hypoY * 0.75);
      if (preset === 'iso') {
        _targetPos.set(14.5, 9.2, 15.0);
        _targetLook.set(0, midY, 0);
      } else if (preset === 'ew') {
        _targetPos.set(0, midY + 0.6, 22.0);
        _targetLook.set(0, midY, 0);
      } else if (preset === 'ns') {
        _targetPos.set(22.0, midY + 0.6, 0);
        _targetLook.set(0, midY, 0);
      } else if (preset === 'top') {
        _targetPos.set(0, 23.5, 0.05);
        _targetLook.set(0, 0, 0);
      } else if (preset === 'focus') {
        _targetPos.set(5.6, hypoY + 3.1, 6.2);
        _targetLook.set(0, hypoY, 0);
      }
      isTransitioningCamera = true;
      requestRender();
    }

    let lastReportedMpp = 0;
    const syncScaleBarFromCamera = () => {
      const h = Math.max(1, mount.clientHeight || initHeight);
      const dist = Math.max(0.5, camera.position.distanceTo(controls.target));
      const fovRad = THREE.MathUtils.degToRad(camera.fov);
      const worldHeightUnits = 2 * dist * Math.tan(fovRad / 2);
      const nextMpp = ((worldHeightUnits * SCENE_KM_PER_UNIT) / h) * 1000;
      if (lastReportedMpp === 0 || Math.abs(nextMpp - lastReportedMpp) / lastReportedMpp > 0.015) {
        lastReportedMpp = nextMpp;
        setMetersPerPixel(nextMpp);
      }
    };

    const handleControlStart = () => {
      isTransitioningCamera = false;
    };
    const handleControlChange = () => {
      syncScaleBarFromCamera();
      requestRender();
    };
    controls.addEventListener('start', handleControlStart);
    controls.addEventListener('change', handleControlChange);
    syncScaleBarFromCamera();

    // Raycasting for Station Click & Hover
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointerNdc = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };
    let lastHoverCheckMs = 0;

    const updateNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      return rect;
    };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moved > 6) return; // Ignore camera orbit drags

      updateNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, camera);
      const targets = sceneRefs.current.stationTargets;
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const hitSta = hits[0].object.userData.sta as string | undefined;
        if (hitSta) {
          onSelectStationRef.current(hitSta);
          setClickedStationCode(hitSta);
          return;
        }
      }
      setClickedStationCode(null);
    };

    const handlePointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheckMs < 32) return;
      lastHoverCheckMs = now;

      const rect = updateNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(sceneRefs.current.stationTargets, false);
      if (hits.length > 0) {
        const obj = hits[0].object;
        const hitSta = obj.userData.sta as string | undefined;
        const pick = eventRef.current.picks.find((p) => p.sta === hitSta);
        if (pick) {
          obj.getWorldPosition(_projVec);
          _projVec.project(camera);
          const sx = ((_projVec.x + 1) / 2) * rect.width;
          const sy = ((-_projVec.y + 1) / 2) * rect.height;
          renderer.domElement.style.cursor = 'pointer';
          setHoveredStation({
            pick,
            meta: stationMetaMapRef.current[pick.sta],
            screenX: sx,
            screenY: sy,
            containerWidth: rect.width,
            containerHeight: rect.height,
          });
          return;
        }
      }
      renderer.domElement.style.cursor = 'grab';
      setHoveredStation((prev) => (prev ? null : prev));
    };

    const handlePointerLeave = () => {
      setHoveredStation(null);
    };

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
      requestRender();
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(300, entry.contentRect.width);
        const h = Math.max(300, entry.contentRect.height);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        syncScaleBarFromCamera();
        requestRender();
      }
    });
    resizeObserver.observe(mount);

    sceneRefs.current.renderer = renderer;
    sceneRefs.current.scene = scene;
    sceneRefs.current.camera = camera;
    sceneRefs.current.controls = controls;
    sceneRefs.current.worldGroup = worldGroup;
    sceneRefs.current.requestRender = requestRender;
    sceneRefs.current.applyCameraPreset = applyCameraPreset;

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', handleControlStart);
      controls.removeEventListener('change', handleControlChange);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      disposeObject3DTree(worldGroup);
      envTexture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // 2. Rebuild 3D Geological Block, Topography, Strata, Faults, Volcanoes, Stations, Hypocenter & Rays when event or verticalExag changes
  useEffect(() => {
    const { renderer, scene, camera, worldGroup, requestRender } = sceneRefs.current;
    if (!renderer || !scene || !camera || !worldGroup) return;

    // Clear previous geometry/materials cleanly
    while (worldGroup.children.length > 0) {
      const child = worldGroup.children[0];
      worldGroup.remove(child);
      disposeObject3DTree(child);
    }
    sceneRefs.current.stationTargets = [];
    sceneRefs.current.stationRingMap.clear();
    sceneRefs.current.rayMeshMap.clear();

    const unlocated = isEventUnlocated(event);
    const centerLon = unlocated ? DEFAULT_PH_CENTER.lon : event.lon;
    const centerLat = unlocated ? DEFAULT_PH_CENTER.lat : event.lat;

    const blockSize = BLOCK_HALF_UNITS * 2;
    const maxBlockY = depthKmToSceneY(maxDepthKm, verticalExag);

    // --- A. TOPOGRAPHY & BATHYMETRY TERRAIN SURFACE ---
    const segs = 88;
    const terrainGeo = new THREE.PlaneGeometry(blockSize, blockSize, segs, segs);
    terrainGeo.rotateX(-Math.PI / 2);
    const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
    const colorArray = new Float32Array(posAttr.count * 3);
    const tmpColor = new THREE.Color();

    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const [lon, lat] = sceneXZToLonLat(vx, vz, centerLon, centerLat);
      const elevKm = evaluateTopographyKm(lon, lat, stations);
      const vy = elevKmToSceneY(elevKm, verticalExag);
      posAttr.setY(i, vy);
      topoElevationToRgb(elevKm, tmpColor);
      colorArray[i * 3] = tmpColor.r;
      colorArray[i * 3 + 1] = tmpColor.g;
      colorArray[i * 3 + 2] = tmpColor.b;
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    worldGroup.add(terrainMesh);

    // Sea-level translucent horizon plane (0 km datum)
    const seaGeo = new THREE.PlaneGeometry(blockSize, blockSize);
    seaGeo.rotateX(-Math.PI / 2);
    const seaMat = new THREE.MeshPhysicalMaterial({
      color: 0x0ea5e9,
      roughness: 0.22,
      metalness: 0.08,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const seaMesh = new THREE.Mesh(seaGeo, seaMat);
    seaMesh.position.y = 0.01;
    seaMesh.renderOrder = 2;
    worldGroup.add(seaMesh);

    // Coordinate & Terrain Grid Overlay (showGrid)
    const gridGroup = new THREE.Group();
    const gridHelper = new THREE.GridHelper(blockSize, 12, 0x38bdf8, 0x1e293b);
    gridHelper.position.y = 0.025;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.35;
    gridGroup.add(gridHelper);
    worldGroup.add(gridGroup);

    // --- B. GEOLOGICAL CRUSTAL STRATA (CRUSTAL_MODEL_1D) ---
    const strataPlanesGroup = new THREE.Group();
    const strataWallsGroup = new THREE.Group();
    const layerColors = [0x38bdf8, 0x22d3ee, 0x818cf8, 0xa855f7, 0xec4899];

    CRUSTAL_MODEL_1D.forEach((layer, idx) => {
      if (layer.topDepthKm >= maxDepthKm) return;
      const yTop = depthKmToSceneY(layer.topDepthKm, verticalExag);
      const nextTop =
        idx < CRUSTAL_MODEL_1D.length - 1 ? CRUSTAL_MODEL_1D[idx + 1].topDepthKm : maxDepthKm;
      const clampedBottom = Math.min(nextTop, maxDepthKm);
      const yBottom = depthKmToSceneY(clampedBottom, verticalExag);
      const layerHeight = Math.abs(yTop - yBottom);
      const col = layerColors[idx] ?? 0x64748b;

      // Horizontal velocity interface plane (skip 0 km because sea/terrain occupies it)
      if (layer.topDepthKm > 0) {
        const planeGeo = new THREE.PlaneGeometry(blockSize, blockSize);
        planeGeo.rotateX(-Math.PI / 2);
        const planeMat = new THREE.MeshStandardMaterial({
          color: col,
          roughness: 0.7,
          metalness: 0.1,
          transparent: true,
          opacity: layer.topDepthKm === 30 ? 0.18 : 0.11,
          depthWrite: false,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
        const planeMesh = new THREE.Mesh(planeGeo, planeMat);
        planeMesh.position.y = yTop;
        planeMesh.renderOrder = 1;
        strataPlanesGroup.add(planeMesh);

        const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(blockSize, 0.002, blockSize));
        const edgeMat = new THREE.LineBasicMaterial({
          color: col,
          transparent: true,
          opacity: layer.topDepthKm === 30 ? 0.8 : 0.45,
        });
        const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
        edgeLines.position.y = yTop;
        strataPlanesGroup.add(edgeLines);
      }

      // Cutaway vertical back walls (North wall z = -BLOCK_HALF_UNITS, West wall x = -BLOCK_HALF_UNITS)
      if (layerHeight > 0.001) {
        const wallMat = new THREE.MeshStandardMaterial({
          color: col,
          roughness: 0.85,
          metalness: 0.05,
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
          side: THREE.DoubleSide,
        });

        const northWallGeo = new THREE.PlaneGeometry(blockSize, layerHeight);
        const northWall = new THREE.Mesh(northWallGeo, wallMat);
        northWall.position.set(0, (yTop + yBottom) / 2, -BLOCK_HALF_UNITS);
        strataWallsGroup.add(northWall);

        const westWallGeo = new THREE.PlaneGeometry(blockSize, layerHeight);
        westWallGeo.rotateY(Math.PI / 2);
        const westWall = new THREE.Mesh(westWallGeo, wallMat.clone());
        westWall.position.set(-BLOCK_HALF_UNITS, (yTop + yBottom) / 2, 0);
        strataWallsGroup.add(westWall);
      }
    });

    // Bottom basal boundary frame + Procedural Depth Ruler Pillar at NW corner
    const baseFrameGeo = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(blockSize, Math.abs(maxBlockY), blockSize),
    );
    const baseFrame = new THREE.LineSegments(
      baseFrameGeo,
      new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.65 }),
    );
    baseFrame.position.y = maxBlockY / 2;
    worldGroup.add(baseFrame);

    const rulerTex = createDepthScaleTexture(maxDepthKm);
    rulerTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const rulerGeo = new THREE.PlaneGeometry(2.3, Math.abs(maxBlockY));
    const rulerMat = new THREE.MeshBasicMaterial({
      map: rulerTex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.94,
    });
    const rulerMesh = new THREE.Mesh(rulerGeo, rulerMat);
    rulerMesh.position.set(-BLOCK_HALF_UNITS + 1.15, maxBlockY / 2, BLOCK_HALF_UNITS + 0.04);
    strataWallsGroup.add(rulerMesh);

    worldGroup.add(strataPlanesGroup);
    worldGroup.add(strataWallsGroup);

    // --- C. ACTIVE FAULT TRACES, PLATE BOUNDARIES & SUBDUCTION SLAB ---
    const faultsGroup = new THREE.Group();
    const boundariesGroup = new THREE.Group();
    const slabGroup = new THREE.Group();

    FAULT_TRACES.forEach((trace) => {
      const pts: THREE.Vector3[] = [];
      for (const [lon, lat] of trace.points) {
        const [fx, fz] = lonLatToSceneXZ(lon, lat, centerLon, centerLat);
        if (Math.abs(fx) <= BLOCK_HALF_UNITS * 1.15 && Math.abs(fz) <= BLOCK_HALF_UNITS * 1.15) {
          const elevY = elevKmToSceneY(evaluateTopographyKm(lon, lat, stations), verticalExag);
          pts.push(new THREE.Vector3(fx, elevY + 0.05, fz));
        }
      }
      if (pts.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(pts);
        const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.045, 6, false);
        const isBoundary = trace.kind === 'boundary';
        const tubeMat = new THREE.MeshStandardMaterial({
          color: isBoundary ? 0x6366f1 : 0xf43f5e,
          emissive: isBoundary ? 0x3730a3 : 0x9f1239,
          emissiveIntensity: 0.4,
          roughness: 0.5,
        });
        if (isBoundary) {
          boundariesGroup.add(new THREE.Mesh(tubeGeo, tubeMat));
        } else {
          faultsGroup.add(new THREE.Mesh(tubeGeo, tubeMat));
        }
      }
    });

    TECTONIC_PLATES.forEach((plate) => {
      const pts: THREE.Vector3[] = [];
      for (const [lon, lat] of plate.points) {
        const [px, pz] = lonLatToSceneXZ(lon, lat, centerLon, centerLat);
        const clampedX = THREE.MathUtils.clamp(px, -BLOCK_HALF_UNITS, BLOCK_HALF_UNITS);
        const clampedZ = THREE.MathUtils.clamp(pz, -BLOCK_HALF_UNITS, BLOCK_HALF_UNITS);
        pts.push(new THREE.Vector3(clampedX, 0.04, clampedZ));
      }
      if (pts.length >= 2) {
        const plateGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const plateLine = new THREE.Line(
          plateGeo,
          new THREE.LineBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.5 }),
        );
        boundariesGroup.add(plateLine);
      }
    });

    // Dipping Philippine Trench Subduction Slab (Wadati-Benioff reference plane)
    const philTrench = FAULT_TRACES.find((f) => f.name.includes('Philippine Trench'));
    if (philTrench && philTrench.points.length >= 2) {
      const slabStepsAlong = 14;
      const slabStepsDip = 8;
      const trenchCurve = new THREE.CatmullRomCurve3(
        philTrench.points.map(([lon, lat]) => {
          const [tx, tz] = lonLatToSceneXZ(lon, lat, centerLon, centerLat);
          return new THREE.Vector3(tx, 0, tz);
        }),
      );
      const slabPositions: number[] = [];
      const slabIndices: number[] = [];
      const horizontalReachKm = maxDepthKm / Math.tan((38 * Math.PI) / 180); // ~38 deg dip

      for (let i = 0; i <= slabStepsAlong; i++) {
        const u = i / slabStepsAlong;
        const pSurf = trenchCurve.getPoint(u);
        for (let j = 0; j <= slabStepsDip; j++) {
          const v = j / slabStepsDip;
          const depthKm = v * maxDepthKm;
          const westShiftUnits = (v * horizontalReachKm) / SCENE_KM_PER_UNIT;
          const sx = THREE.MathUtils.clamp(pSurf.x - westShiftUnits, -BLOCK_HALF_UNITS, BLOCK_HALF_UNITS);
          const sz = THREE.MathUtils.clamp(pSurf.z, -BLOCK_HALF_UNITS, BLOCK_HALF_UNITS);
          const sy = depthKmToSceneY(depthKm, verticalExag);
          slabPositions.push(sx, sy, sz);
        }
      }
      for (let i = 0; i < slabStepsAlong; i++) {
        for (let j = 0; j < slabStepsDip; j++) {
          const a = i * (slabStepsDip + 1) + j;
          const b = a + 1;
          const c = (i + 1) * (slabStepsDip + 1) + j;
          const d = c + 1;
          slabIndices.push(a, b, d, a, d, c);
        }
      }
      const slabGeo = new THREE.BufferGeometry();
      slabGeo.setAttribute('position', new THREE.Float32BufferAttribute(slabPositions, 3));
      slabGeo.setIndex(slabIndices);
      slabGeo.computeVertexNormals();

      const slabMat = new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x0e7490,
        emissiveIntensity: 0.25,
        roughness: 0.55,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const slabMesh = new THREE.Mesh(slabGeo, slabMat);
      slabMesh.renderOrder = 3;
      slabGroup.add(slabMesh);

      const slabWire = new THREE.LineSegments(
        new THREE.WireframeGeometry(slabGeo),
        new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.28 }),
      );
      slabGroup.add(slabWire);
    }

    worldGroup.add(faultsGroup);
    worldGroup.add(boundariesGroup);
    worldGroup.add(slabGroup);

    // --- D. COMPOSITE 3-PART VOLCANOES ---
    const volcanoesGroup = new THREE.Group();
    ACTIVE_VOLCANOES.forEach((vol) => {
      const [vx, vz] = lonLatToSceneXZ(vol.lon, vol.lat, centerLon, centerLat);
      if (Math.abs(vx) > BLOCK_HALF_UNITS || Math.abs(vz) > BLOCK_HALF_UNITS) return;
      const groundY = elevKmToSceneY(evaluateTopographyKm(vol.lon, vol.lat, stations), verticalExag);

      const volGroup = new THREE.Group();
      volGroup.position.set(vx, groundY, vz);

      // Part 1: Basaltic volcanic cone flank
      const coneMesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 0.34, 12, 1, false),
        new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.85, metalness: 0.05 }),
      );
      coneMesh.position.y = 0.14;
      volGroup.add(coneMesh);

      // Part 2: Caldera rim collar
      const rimMesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.08, 0.025, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.55, metalness: 0.15 }),
      );
      rimMesh.rotation.x = Math.PI / 2;
      rimMesh.position.y = 0.29;
      volGroup.add(rimMesh);

      // Part 3: Magma vent accent
      const ventMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 10),
        new THREE.MeshStandardMaterial({
          color: 0xfb923c,
          emissive: 0xea580c,
          emissiveIntensity: 1.2,
          roughness: 0.2,
        }),
      );
      ventMesh.position.y = 0.3;
      volGroup.add(ventMesh);

      volcanoesGroup.add(volGroup);
    });
    worldGroup.add(volcanoesGroup);

    // --- E. HYPOCENTER, TRIAL DEPTH GHOST & ERROR ELLIPSOID ---
    const epiGroundY = elevKmToSceneY(
      evaluateTopographyKm(centerLon, centerLat, stations),
      verticalExag
    );
    const hypoY = depthKmToSceneY(event.depthKm, verticalExag);
    const trialY = depthKmToSceneY(event.trialDepthKm, verticalExag);

    if (!unlocated) {
      // Surface Epicenter Beacon + Horizontal Error Ellipse
      const epiMarkerGroup = new THREE.Group();
      epiMarkerGroup.position.set(0, Math.max(0.02, epiGroundY) + 0.05, 0);

      const epiPrism = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.22, 0),
        new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xdc2626,
          emissiveIntensity: 0.7,
          roughness: 0.25,
          metalness: 0.4,
        }),
      );
      epiPrism.scale.set(1, 0.45, 1);
      epiMarkerGroup.add(epiPrism);

      const errRx = Math.max(0.32, (event.errLonDeg * kmPerDegLon(event.lat)) / SCENE_KM_PER_UNIT);
      const errRz = Math.max(0.32, (event.errLatDeg * KM_PER_DEG_LAT) / SCENE_KM_PER_UNIT);
      const errRingGeo = new THREE.RingGeometry(0.88, 1.0, 32);
      errRingGeo.rotateX(-Math.PI / 2);
      const errRingMesh = new THREE.Mesh(
        errRingGeo,
        new THREE.MeshBasicMaterial({ color: 0xf87171, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
      );
      errRingMesh.scale.set(errRx, 1, errRz);
      epiMarkerGroup.add(errRingMesh);
      worldGroup.add(epiMarkerGroup);

      // Vertical Plumb Shaft (Surface Epicenter -> Solved Hypocenter)
      const plumbGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, Math.max(0.02, epiGroundY) + 0.05, 0),
        new THREE.Vector3(0, hypoY, 0),
      ]);
      const plumbLine = new THREE.Line(
        plumbGeo,
        new THREE.LineBasicMaterial({ color: 0xf87171, transparent: true, opacity: 0.85 }),
      );
      worldGroup.add(plumbLine);

      // Solved Hypocenter Composite Assembly
      const hypoGroup = new THREE.Group();
      hypoGroup.position.set(0, hypoY, 0);

      const hypoCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 24, 24),
        new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xdc2626,
          emissiveIntensity: 1.4,
          roughness: 0.2,
          metalness: 0.3,
        }),
      );
      hypoGroup.add(hypoCore);

      // P & S wavefront equatorial rings
      const pWaveRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.46, 0.02, 10, 32),
        new THREE.MeshStandardMaterial({
          color: 0xfca5a5,
          emissive: 0xef4444,
          emissiveIntensity: 0.8,
          roughness: 0.3,
        }),
      );
      pWaveRing.rotation.x = Math.PI / 2;
      hypoGroup.add(pWaveRing);

      const sWaveRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.015, 10, 32),
        new THREE.MeshStandardMaterial({
          color: 0xfdba74,
          emissive: 0xf97316,
          emissiveIntensity: 0.6,
          roughness: 0.35,
        }),
      );
      sWaveRing.rotation.y = Math.PI / 4;
      hypoGroup.add(sWaveRing);

      // 3D Hypocentral Uncertainty Ellipsoid
      const erzKm = Math.max(event.errKm * 1.45, 3.2);
      const errSphereGeo = new THREE.SphereGeometry(1, 20, 16);
      const errEllipsoid = new THREE.Mesh(
        errSphereGeo,
        new THREE.MeshStandardMaterial({
          color: 0xef4444,
          roughness: 0.4,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        }),
      );
      errEllipsoid.scale.set(
        Math.max(0.42, event.errKm / SCENE_KM_PER_UNIT + 0.35),
        Math.max(0.32, (erzKm / SCENE_KM_PER_UNIT) * verticalExag + 0.25),
        Math.max(0.42, event.errKm / SCENE_KM_PER_UNIT + 0.35),
      );
      errEllipsoid.renderOrder = 4;
      hypoGroup.add(errEllipsoid);
      worldGroup.add(hypoGroup);

      // Trial Depth Ghost Marker + Dashed Migration Connector
      if (Math.abs(event.trialDepthKm - event.depthKm) >= 0.3) {
        const trialGhost = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.2, 0),
          new THREE.MeshBasicMaterial({ color: 0xfbbf24, wireframe: true }),
        );
        trialGhost.position.set(0, trialY, 0);
        worldGroup.add(trialGhost);

        const migGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, trialY, 0),
          new THREE.Vector3(0, hypoY, 0),
        ]);
        const migLine = new THREE.Line(
          migGeo,
          new THREE.LineDashedMaterial({
            color: 0xfbbf24,
            dashSize: 0.14,
            gapSize: 0.08,
          }),
        );
        migLine.computeLineDistances();
        worldGroup.add(migLine);
      }
    }

    // --- F. COMPOSITE 4-PART SEISMIC STATIONS & REFRACTED 3D RAY PATHS ---
    const stationsGroup = new THREE.Group();
    const raysGroup = new THREE.Group();
    const stationMetaLookup: Record<string, StationMeta> = {};
    for (const st of stations) {
      stationMetaLookup[st.code] = st;
    }

    event.picks
      .filter((pick) => stationPickMatchesRegion(pick, regionFilter, stationMetaLookup))
      .forEach((pick) => {
      const [sx, sz] = lonLatToSceneXZ(pick.lon, pick.lat, centerLon, centerLat);
      if (Math.abs(sx) > BLOCK_HALF_UNITS * 1.05 || Math.abs(sz) > BLOCK_HALF_UNITS * 1.05) return;

      const clampedX = THREE.MathUtils.clamp(sx, -BLOCK_HALF_UNITS + 0.2, BLOCK_HALF_UNITS - 0.2);
      const clampedZ = THREE.MathUtils.clamp(sz, -BLOCK_HALF_UNITS + 0.2, BLOCK_HALF_UNITS - 0.2);
      const terrainY = elevKmToSceneY(
        evaluateTopographyKm(pick.lon, pick.lat, stations),
        verticalExag
      );
      const stationColor = getStationResidualColorHex(pick);
      const isSelected = selectedStationRef.current === pick.sta;

      const staGroup = new THREE.Group();
      staGroup.position.set(clampedX, terrainY, clampedZ);

      // Part 1: Concrete pier pad grounded flush on terrain
      const pier = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 0.08, 6),
        new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.88, metalness: 0.1 }),
      );
      pier.position.y = 0.04;
      staGroup.add(pier);

      // Part 2: Broadband vault housing
      const vault = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.13, 0.16, 8),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.45, metalness: 0.65 }),
      );
      vault.position.y = 0.16;
      staGroup.add(vault);

      // Part 3: Telemetry mast
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.025, 0.22, 6),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3, metalness: 0.8 }),
      );
      mast.position.y = 0.34;
      staGroup.add(mast);

      // Part 4: Residual-colored beacon orb
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 14, 14),
        new THREE.MeshStandardMaterial({
          color: stationColor,
          emissive: stationColor,
          emissiveIntensity: isSelected ? 1.4 : 0.7,
          roughness: 0.25,
          metalness: 0.2,
        }),
      );
      beacon.position.y = 0.47;
      staGroup.add(beacon);

      // Selection Halo Ring
      const selRingGeo = new THREE.RingGeometry(0.26, 0.34, 24);
      selRingGeo.rotateX(-Math.PI / 2);
      const selRing = new THREE.Mesh(
        selRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: isSelected ? 0.95 : 0.0,
        }),
      );
      selRing.position.y = 0.06;
      staGroup.add(selRing);
      sceneRefs.current.stationRingMap.set(pick.sta, selRing);

      // Raycast Proxy Target (Layer 1)
      const hitProxy = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 0.95, 10),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hitProxy.position.y = 0.35;
      hitProxy.layers.set(1);
      hitProxy.userData.sta = pick.sta;
      staGroup.add(hitProxy);
      sceneRefs.current.stationTargets.push(hitProxy);

      stationsGroup.add(staGroup);

      if (!unlocated) {
        // 3D Curved Refracted Seismic Ray Path (Hypocenter -> Station Vault)
        const startPt = new THREE.Vector3(0, hypoY, 0);
        const endPt = new THREE.Vector3(clampedX, terrainY + 0.16, clampedZ);
        const midPt = startPt.clone().lerp(endPt, 0.5);
        // Refracted rays bend downward in faster lower layers when TOA < 90° (diving rays)
        const diveFactor = pick.toa < 90 ? Math.min(1.1, (90 - pick.toa) / 48) : -0.15;
        midPt.y -= diveFactor * 0.65 * verticalExag * 0.5;
        midPt.y = Math.max(maxBlockY + 0.15, midPt.y);

        const rayCurve = new THREE.CatmullRomCurve3([startPt, midPt, endPt]);
        const rayPoints = rayCurve.getPoints(24);
        const rayGeo = new THREE.BufferGeometry().setFromPoints(rayPoints);
        const rayMat = pick.pExcluded
          ? new THREE.LineDashedMaterial({
              color: 0x64748b,
              dashSize: 0.18,
              gapSize: 0.12,
              transparent: true,
              opacity: isSelected ? 0.95 : 0.45,
            })
          : new THREE.LineBasicMaterial({
              color: isSelected ? 0xfef08a : stationColor,
              transparent: true,
              opacity: isSelected ? 0.98 : 0.68,
            });
        const rayLine = new THREE.Line(rayGeo, rayMat);
        if (pick.pExcluded) rayLine.computeLineDistances();
        rayLine.userData.baseColor = stationColor;
        rayLine.userData.excluded = pick.pExcluded;
        raysGroup.add(rayLine);
        sceneRefs.current.rayMeshMap.set(pick.sta, rayLine);
      }
    });

    worldGroup.add(stationsGroup);
    worldGroup.add(raysGroup);

    sceneRefs.current.layerGroups = {
      faults: faultsGroup,
      boundaries: boundariesGroup,
      slab: slabGroup,
      volcanoes: volcanoesGroup,
      stations: stationsGroup,
      rays: raysGroup,
      grid: gridGroup,
      strataWalls: strataWallsGroup,
      strataPlanes: strataPlanesGroup,
      shakeMap: null,
    };

    requestRender();
    setHoveredStation(null);
    setClickedStationCode(null);
  }, [event, stations, verticalExag, maxDepthKm, regionFilter]);

  // 2b. Render 3D Surface ShakeMap Intensity Contours (geometry rebuilt only on event/exag/shakeMap change)
  useEffect(() => {
    const { worldGroup, layerGroups, requestRender } = sceneRefs.current;
    if (!worldGroup) return;

    if (layerGroups.shakeMap) {
      worldGroup.remove(layerGroups.shakeMap);
      disposeObject3DTree(layerGroups.shakeMap);
      layerGroups.shakeMap = null;
    }

    const {
      showShakeMap: initShow,
      shakeMapOpacity: initOpacity,
      visibleShakeBands: initBands,
      highlightedShakeBand: initHighlight,
    } = shakeLatestStateRef.current;

    if (shakeMap && shakeMap.contours.length > 0) {
      const smCenterLon = isEventUnlocated(event) ? DEFAULT_PH_CENTER.lon : event.lon;
      const smCenterLat = isEventUnlocated(event) ? DEFAULT_PH_CENTER.lat : event.lat;
      const smGroup = new THREE.Group();
      const targetLineOp =
        initOpacity <= 0 ? 0 : Math.min(1, 0.25 + initOpacity * 0.75);
      for (const contour of shakeMap.contours) {
        const lineColor = new THREE.Color(contour.band.strokeHex);
        const glowColor = new THREE.Color(contour.band.fillHex);
        const isEpicentral = contour.isEpicentral !== false;
        const visible =
          initShow &&
          (initBands ? initBands[contour.band.roman] !== false : true) &&
          initOpacity > 0;
        const isHi = visible && initHighlight === contour.band.roman && isEpicentral;
        for (const ring of contour.rings) {
          const pts: THREE.Vector3[] = [];
          const glowPts: THREE.Vector3[] = [];
          for (const [lon, lat] of ring) {
            const [sx, sz] = lonLatToSceneXZ(lon, lat, smCenterLon, smCenterLat);
            if (Math.abs(sx) <= BLOCK_HALF_UNITS && Math.abs(sz) <= BLOCK_HALF_UNITS) {
              const elevY = elevKmToSceneY(evaluateTopographyKm(lon, lat), verticalExag);
              const baseY = Math.max(0.035, elevY + 0.045);
              pts.push(new THREE.Vector3(sx, baseY, sz));
              glowPts.push(new THREE.Vector3(sx, baseY + 0.025, sz));
            }
          }
          if (pts.length >= 3) {
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            const mat = new THREE.LineBasicMaterial({
              color: lineColor,
              transparent: true,
              opacity: visible ? (isHi ? 1 : targetLineOp) : 0,
            });
            const line = new THREE.Line(geo, mat);
            line.userData.bandRoman = contour.band.roman;
            line.userData.isEpicentral = isEpicentral;
            line.userData.isGlow = false;
            line.visible = visible && targetLineOp > 0.005;
            smGroup.add(line);

            const glowGeo = new THREE.BufferGeometry().setFromPoints(glowPts);
            const glowMat = new THREE.LineBasicMaterial({
              color: glowColor,
              transparent: true,
              opacity: isHi ? 0.85 : 0,
            });
            const glowLine = new THREE.Line(glowGeo, glowMat);
            glowLine.userData.bandRoman = contour.band.roman;
            glowLine.userData.isEpicentral = isEpicentral;
            glowLine.userData.isGlow = true;
            glowLine.visible = isHi;
            smGroup.add(glowLine);
          }
        }

        const [lblLon, lblLat] = contour.labelPoint ?? contour.centroid;
        const [lx, lz] = lonLatToSceneXZ(lblLon, lblLat, smCenterLon, smCenterLat);
        if (Math.abs(lx) <= BLOCK_HALF_UNITS && Math.abs(lz) <= BLOCK_HALF_UNITS) {
          const elevY = elevKmToSceneY(evaluateTopographyKm(lblLon, lblLat), verticalExag);
          const labelY = Math.max(0.035, elevY + 0.045) + 0.16;
          const sprite = createContourLabelSprite(contour.band.roman, contour.band.strokeHex);
          sprite.position.set(lx, labelY, lz);
          const labelOp = !visible
            ? 0
            : isHi
              ? 1
              : Math.min(1, 0.5 + initOpacity * 0.5);
          sprite.material.opacity = labelOp;
          sprite.visible = labelOp > 0.005;
          sprite.userData.bandRoman = contour.band.roman;
          sprite.userData.isEpicentral = isEpicentral;
          sprite.userData.isLabel = true;
          sprite.userData.baseScaleX = 0.62;
          sprite.userData.baseScaleY = 0.36;
          if (isHi) {
            sprite.scale.set(0.62 * 1.15, 0.36 * 1.15, 1);
          }
          smGroup.add(sprite);
        }
      }
      worldGroup.add(smGroup);
      layerGroups.shakeMap = smGroup;
    }

    requestRender();
  }, [event, verticalExag, shakeMap]);

  // 2c. Smoothly animate 3D ShakeMap contour opacity, centroid labels & epicentral hover glow
  useEffect(() => {
    const { layerGroups, requestRender } = sceneRefs.current;
    const smGroup = layerGroups.shakeMap;
    if (!smGroup) return;

    const targetBase =
      shakeMapOpacity <= 0 ? 0 : Math.min(1, 0.25 + shakeMapOpacity * 0.75);

    const targets: Array<{
      obj: THREE.Object3D;
      mat: THREE.LineBasicMaterial | THREE.SpriteMaterial;
      from: number;
      to: number;
      isLabel: boolean;
      fromScale: number;
      toScale: number;
    }> = [];

    smGroup.traverse((obj) => {
      const line = obj as THREE.Line;
      const sprite = obj as THREE.Sprite;
      const isLineTarget = line.isLine && line.material instanceof THREE.LineBasicMaterial;
      const isSpriteTarget =
        sprite.isSprite &&
        sprite.material instanceof THREE.SpriteMaterial &&
        Boolean(sprite.userData.isLabel);

      if (isLineTarget || isSpriteTarget) {
        const mat = (isLineTarget ? line.material : sprite.material) as
          | THREE.LineBasicMaterial
          | THREE.SpriteMaterial;
        const roman = obj.userData.bandRoman as PeisBandCode | undefined;
        const isEpicentral = obj.userData.isEpicentral !== false;
        const isGlow = Boolean(obj.userData.isGlow);
        const visible =
          showShakeMap &&
          (roman && visibleShakeBands ? visibleShakeBands[roman] !== false : true) &&
          shakeMapOpacity > 0;
        const isHi =
          visible && roman !== undefined && highlightedShakeBand === roman && isEpicentral;
        const isDimmed =
          visible && highlightedShakeBand !== null && highlightedShakeBand !== roman;

        const targetOpacity = isSpriteTarget
          ? !visible
            ? 0
            : isHi
              ? 1
              : isDimmed
                ? 0.35
                : Math.min(1, 0.5 + shakeMapOpacity * 0.5)
          : isGlow
            ? isHi
              ? 0.85
              : 0
            : !visible
              ? 0
              : isHi
                ? 1
                : isDimmed
                  ? targetBase * 0.4
                  : targetBase;

        const baseScaleX = (obj.userData.baseScaleX as number) || 0.62;
        const currentScaleFactor = isSpriteTarget ? obj.scale.x / baseScaleX : 1;

        targets.push({
          obj,
          mat,
          from: mat.opacity,
          to: targetOpacity,
          isLabel: isSpriteTarget,
          fromScale: currentScaleFactor,
          toScale: isHi ? 1.15 : 1.0,
        });
      }
    });

    if (targets.length === 0) return;

    let rafId = 0;
    const durationMs = 240;
    const startTs = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - startTs) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      for (const item of targets) {
        const nextOpacity = item.from + (item.to - item.from) * eased;
        item.mat.opacity = nextOpacity;
        item.obj.visible = nextOpacity > 0.005;
        if (item.isLabel) {
          const nextScale = item.fromScale + (item.toScale - item.fromScale) * eased;
          const baseScaleX = (item.obj.userData.baseScaleX as number) || 0.62;
          const baseScaleY = (item.obj.userData.baseScaleY as number) || 0.36;
          item.obj.scale.set(baseScaleX * nextScale, baseScaleY * nextScale, 1);
        }
      }
      requestRender();
      if (t < 1) {
        rafId = window.requestAnimationFrame(step);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [shakeMap, showShakeMap, visibleShakeBands, shakeMapOpacity, highlightedShakeBand]);

  // 3. Synchronize Layer Toggles & Selected Station Highlight without rebuilding geometry
  useEffect(() => {
    const { layerGroups, stationRingMap, rayMeshMap, requestRender } = sceneRefs.current;
    if (layerGroups.faults) layerGroups.faults.visible = showFaults;
    if (layerGroups.boundaries) layerGroups.boundaries.visible = showPlates;
    if (layerGroups.slab) layerGroups.slab.visible = showPlates && showSlab;
    if (layerGroups.volcanoes) layerGroups.volcanoes.visible = showVolcanoes;
    if (layerGroups.stations) layerGroups.stations.visible = showStations;
    if (layerGroups.rays) layerGroups.rays.visible = showStations && showRays;
    if (layerGroups.grid) layerGroups.grid.visible = showGrid;

    if (layerGroups.strataWalls) {
      layerGroups.strataWalls.visible = strataMode === 'cutaway';
    }
    if (layerGroups.strataPlanes) {
      layerGroups.strataPlanes.visible = true;
      layerGroups.strataPlanes.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh && mesh.material instanceof THREE.MeshStandardMaterial) {
          mesh.visible = strataMode !== 'wire';
          mesh.material.opacity = strataMode === 'planes' ? 0.2 : 0.11;
        }
      });
    }

    stationRingMap.forEach((ring, sta) => {
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.opacity = selectedStation === sta ? 0.95 : 0.0;
    });

    rayMeshMap.forEach((line, sta) => {
      const isSel = selectedStation === sta;
      const baseColor = (line.userData.baseColor as number) ?? 0x38bdf8;
      const excluded = Boolean(line.userData.excluded);
      const mat = line.material as THREE.LineBasicMaterial;
      mat.color.setHex(isSel ? 0xfef08a : excluded ? 0x64748b : baseColor);
      mat.opacity = isSel ? 0.98 : excluded ? 0.42 : 0.65;
    });

    requestRender();
  }, [
    event,
    verticalExag,
    maxDepthKm,
    showFaults,
    showPlates,
    showSlab,
    showVolcanoes,
    showStations,
    showRays,
    showGrid,
    strataMode,
    selectedStation,
  ]);

  // Smoothly re-aim camera on event switch
  useEffect(() => {
    sceneRefs.current.applyCameraPreset(activePreset, verticalExag, event.depthKm);
  }, [event.id]);

  const snapshotMetaRef = useRef({
    metersPerPixel,
    diagnostics,
    strataMode,
    verticalExag,
    showSlab,
    showRays,
    event,
  });
  snapshotMetaRef.current = {
    metersPerPixel,
    diagnostics,
    strataMode,
    verticalExag,
    showSlab,
    showRays,
    event,
  };

  useEffect(() => {
    if (!onSnapshotProviderReady) return;
    const provider: MapSnapshotProvider = async () => {
      const { renderer, scene, camera } = sceneRefs.current;
      const mount = canvasMountRef.current;
      const st = snapshotMetaRef.current;
      if (!renderer || !scene || !camera || !mount) return null;

      renderer.render(scene, camera);
      const srcCanvas = renderer.domElement;
      const copy = document.createElement('canvas');
      copy.width = Math.max(1, srcCanvas.width);
      copy.height = Math.max(1, srcCanvas.height);
      const ctx = copy.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(srcCanvas, 0, 0);

      const hostingLayerLabel = isEventUnlocated(st.event)
        ? 'Pending location'
        : `L${st.diagnostics.hostingLayer.layer} · ${st.diagnostics.hostingLayer.topDepthKm.toFixed(0)}–${
            st.diagnostics.hostingLayer.topDepthKm + st.diagnostics.hostingLayer.thicknessKm > 200
              ? '∞'
              : (st.diagnostics.hostingLayer.topDepthKm + st.diagnostics.hostingLayer.thicknessKm).toFixed(0)
          } km (Vp ${st.diagnostics.hostingLayer.vpKmS.toFixed(2)})`;

      return {
        engine: '3d',
        canvas: copy,
        cssWidth: Math.max(320, mount.clientWidth || 800),
        cssHeight: Math.max(240, mount.clientHeight || 520),
        metersPerPixel: st.metersPerPixel,
        basemapLabel: '3D Subsurface & Topography (WebGL)',
        strataMode: st.strataMode,
        verticalExag: st.verticalExag,
        showSlab: st.showSlab,
        showRays: st.showRays,
        depthDiagnostics: {
          hostingLayerLabel,
          nearestBoundaryLabel: `${st.diagnostics.nearestBoundaryKm.toFixed(1)} km to ${st.diagnostics.nearestBoundaryLabel}`,
          trialDeltaLabel: `${st.diagnostics.trialDeltaKm >= 0 ? '+' : ''}${st.diagnostics.trialDeltaKm.toFixed(1)} km / ${st.diagnostics.minStationDistKm.toFixed(1)} km`,
          assessment: st.diagnostics.finding,
          status: st.diagnostics.status,
          depthConstraintRatio: st.diagnostics.depthConstraintRatio,
          trialDepthKm: st.event.trialDepthKm,
        },
      };
    };

    onSnapshotProviderReady(provider);
    return () => onSnapshotProviderReady(null);
  }, [onSnapshotProviderReady]);

  const handlePresetChange = (preset: CameraPresetId) => {
    setActivePreset(preset);
    sceneRefs.current.applyCameraPreset(preset, verticalExag, event.depthKm);
  };

  return (
    <div className="flex flex-col border border-slate-200 bg-white rounded-lg overflow-hidden">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50">
        <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">
            3D Subsurface &amp; Topography (WebGL)
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {isEventUnlocated(event)
              ? `Depth Pending (Trial ${event.trialDepthKm.toFixed(1)} km)`
              : `Depth ${event.depthKm.toFixed(1)} km (Trial ${event.trialDepthKm.toFixed(1)} km)`}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-slate-500">
            {isEventUnlocated(event)
              ? 'Awaiting location'
              : `Layer ${diagnostics.hostingLayer.layer} (Vp ${diagnostics.hostingLayer.vpKmS.toFixed(2)} km/s)`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500 mr-1">Vert. Exag:</span>
          {[1, 2, 3].map((ex) => (
            <button
              key={ex}
              type="button"
              title={`Set Vertical Exaggeration to ${ex}×`}
              onClick={() => {
                setVerticalExag(ex);
                sceneRefs.current.applyCameraPreset(activePreset, ex, event.depthKm);
              }}
              className={`px-2 py-1 text-xs font-mono font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                verticalExag === ex
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {ex}×
            </button>
          ))}
        </div>
      </div>

      {/* 3D WebGL Viewport Container */}
      <div
        className={`relative ${
          compact ? 'h-[400px]' : 'h-[520px]'
        } w-full bg-[#0b1220] overflow-hidden select-none`}
      >
        {/* Isolated empty mount container for WebGLRenderer canvas */}
        <div ref={canvasMountRef} className="w-full h-full" />

        {/* Fallback if WebGL unavailable or lost */}
        {(webglError || contextLost) && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/95 p-6 text-center">
            <div className="max-w-md space-y-2 text-slate-200">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <div className="text-sm font-semibold">
                {contextLost ? 'WebGL Context Interrupted' : 'WebGL Unavailable'}
              </div>
              <p className="text-xs text-slate-400">
                {webglError ??
                  'Graphics context was lost. Switch to Vector Schematic or reset the 3D view.'}
              </p>
            </div>
          </div>
        )}

        {/* Top-Left Minimal Spec & Depth Constraint Readout (No backdrop-blur over WebGL) */}
        <div className="pointer-events-none absolute top-3 left-3 z-10 rounded-lg border border-slate-700/80 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 shadow-lg">
          {isEventUnlocated(event) ? (
            <>
              <div className="font-mono font-semibold text-amber-300">
                Hypocenter Pending
              </div>
              <div className="mt-1 text-[11px] text-slate-300">
                Philippine Archipelago Subsurface Block · Enter phase picks and Locate
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 font-mono tabular-nums">
                <span className="font-semibold text-rose-400">
                  Z = {event.depthKm.toFixed(1)} km
                </span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-300">
                  {event.lat.toFixed(3)}°N, {event.lon.toFixed(3)}°E
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                <span
                  className={`font-medium ${
                    diagnostics.status === 'Well-Constrained'
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                >
                  {diagnostics.status}
                </span>
                <span className="text-slate-500">·</span>
                <span className="font-mono tabular-nums text-slate-300">
                  Δmin/Z = {diagnostics.depthConstraintRatio.toFixed(2)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Top-Right Dynamic Surface Scale Marker */}
        <MapScaleBar
          metersPerPixel={metersPerPixel}
          compact={compact}
          className="absolute top-3 right-3 z-10"
        />

        {/* Station 3D Hover Tooltip (Whole Name, Lat, Lon, Elev) */}
        {hoveredStation && (
          <StationHoverCard
            code={hoveredStation.pick.sta}
            meta={hoveredStation.meta}
            lat={hoveredStation.pick.lat}
            lon={hoveredStation.pick.lon}
            dark={true}
            style={{
              left: `${Math.min(Math.max(hoveredStation.screenX + 14, 12), Math.max(12, hoveredStation.containerWidth - 300))}px`,
              top: `${Math.min(Math.max(hoveredStation.screenY - 12, 12), Math.max(12, hoveredStation.containerHeight - 135))}px`,
            }}
            className="absolute z-20"
          />
        )}

        {clickedStationPick && (
          <FloatingStationPopup
            pick={clickedStationPick}
            meta={stationMetaMap[clickedStationPick.sta]}
            event={event}
            onClose={() => setClickedStationCode(null)}
            className="top-12 right-3"
          />
        )}

        {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 z-20 transition-transform duration-200 w-[min(860px,95%)] ${
            dockCollapsed ? 'bottom-0 translate-y-[calc(100%-30px)]' : 'bottom-3 translate-y-0'
          }`}
        >
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setDockCollapsed((v) => !v)}
              title={dockCollapsed ? 'Show 3D Camera & Strata Controls' : 'Hide 3D Camera & Strata Controls'}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-t-md border border-b-0 border-slate-700 bg-slate-950/95 text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
            >
              {dockCollapsed ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Show 3D Controls
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Hide Controls
                </>
              )}
            </button>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200 shadow-2xl">
            {/* Camera Presets */}
            <div className="flex flex-wrap items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-sky-400 mr-1 shrink-0" />
              {(
                [
                  { id: 'iso', label: 'Isometric' },
                  { id: 'ew', label: 'E–W Slice' },
                  { id: 'ns', label: 'N–S Slice' },
                  { id: 'top', label: 'Top-Down' },
                  { id: 'focus', label: 'Focus Hypo' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={`Switch 3D Camera to ${p.label} View`}
                  onClick={() => handlePresetChange(p.id)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                    activePreset === p.id
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Strata & Overlay Toggles */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex items-center gap-0.5 p-0.5 bg-slate-900 rounded border border-slate-800">
                <Layers className="w-3 h-3 text-slate-400 mx-1" />
                {(
                  [
                    { id: 'cutaway', label: 'Cutaway' },
                    { id: 'planes', label: 'Planes' },
                    { id: 'wire', label: 'Wire' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    title={`Switch Subsurface Strata Display to ${mode.label}`}
                    onClick={() => setStrataMode(mode.id)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                      strataMode === mode.id
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                title={showSlab ? 'Disable Subduction Slab Mesh' : 'Enable Subduction Slab Mesh'}
                onClick={() => setShowSlab((v) => !v)}
                className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors whitespace-nowrap ${
                  showSlab
                    ? 'bg-cyan-950/90 text-cyan-300 border-cyan-700/70'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                Subduction Slab
              </button>

              <button
                type="button"
                title={showRays ? 'Disable 3D Seismic Ray Paths' : 'Enable 3D Seismic Ray Paths'}
                onClick={() => setShowRays((v) => !v)}
                className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors whitespace-nowrap ${
                  showRays
                    ? 'bg-blue-950/90 text-blue-300 border-blue-700/70'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                Ray Paths
              </button>

              <button
                type="button"
                aria-label="Reset 3D Camera to Isometric"
                title="Reset 3D Camera to Isometric"
                onClick={() => handlePresetChange('iso')}
                className="p-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Subsurface Legend & Deep-Event Diagnostic Strip */}
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 space-y-2.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600" />
              Solved Hypocenter
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 border border-amber-500 rotate-45" />
              {isEventUnlocated(event)
                ? 'Trial Depth (Pending)'
                : `Trial Depth (${event.trialDepthKm.toFixed(1)} km)`}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-2.5 bg-cyan-500/35 border border-cyan-600" />
              Philippine Trench Slab (~38°W)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-2.5 bg-purple-500/30 border border-purple-600" />
              Moho (30.0 km)
            </span>
          </div>
          <span className="font-mono tabular-nums text-slate-500">
            Drag to orbit · Scroll to zoom · Click station to inspect
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-slate-200/80">
          {isEventUnlocated(event) ? (
            <>
              <div>
                <div className="text-[11px] text-slate-500">Hosting Crustal Layer</div>
                <div className="font-mono tabular-nums font-semibold text-slate-400">
                  Pending location
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Nearest Velocity Discontinuity</div>
                <div className="font-mono tabular-nums font-semibold text-slate-400">—</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Trial-to-Solved ΔZ / Nearest Sta</div>
                <div className="font-mono tabular-nums font-semibold text-slate-400">— / —</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Depth Assessment</div>
                <div className="font-medium text-slate-500">
                  Awaiting station phase picks and hypocenter solution.
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="text-[11px] text-slate-500">Hosting Crustal Layer</div>
                <div className="font-mono tabular-nums font-semibold text-slate-900">
                  L{diagnostics.hostingLayer.layer} · {diagnostics.hostingLayer.topDepthKm.toFixed(0)}–
                  {diagnostics.hostingLayer.topDepthKm + diagnostics.hostingLayer.thicknessKm > 200
                    ? '∞'
                    : (
                        diagnostics.hostingLayer.topDepthKm + diagnostics.hostingLayer.thicknessKm
                      ).toFixed(0)}{' '}
                  km (Vp {diagnostics.hostingLayer.vpKmS.toFixed(2)})
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Nearest Velocity Discontinuity</div>
                <div className="font-mono tabular-nums font-semibold text-slate-900">
                  {diagnostics.nearestBoundaryKm.toFixed(1)} km to {diagnostics.nearestBoundaryLabel}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Trial-to-Solved ΔZ / Nearest Sta</div>
                <div className="font-mono tabular-nums font-semibold text-slate-900">
                  {diagnostics.trialDeltaKm >= 0 ? '+' : ''}
                  {diagnostics.trialDeltaKm.toFixed(1)} km / {diagnostics.minStationDistKm.toFixed(1)} km
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Depth Assessment</div>
                <div
                  className={`font-medium ${
                    diagnostics.status === 'Well-Constrained' ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {diagnostics.finding}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
