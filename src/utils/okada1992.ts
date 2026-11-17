/**
 * Okada (1992) DC3D — Internal deformation due to shear and tensile faults in an
 * elastic, homogeneous, isotropic half-space.
 *
 * Formulation:
 *   Combines the exact closed-form analytical infinite-medium finite-patch dislocation
 *   integral uA (Okada 1992, Table 2) — which captures 100% of near-fault singularities
 *   and the exact Burgers displacement discontinuity across [al1, al2] x [aw1, aw2] — with:
 *     - Exact closed-form analytical Okada (1985/1992) Table 3 free-surface image uB at z = 0;
 *     - Exact Mindlin (1936) half-space image Green's function (smooth C^infinity everywhere
 *       for z < 0) integrated via adaptive Gauss-Legendre quadrature over [al1, al2] x [aw1, aw2]
 *       for subsurface evaluations z < 0.
 *
 * Reference:
 *   Okada, Y. (1992). Internal deformation due to shear and tensile faults in a
 *   half-space, Bull. Seism. Soc. Am., 82(2), 1018–1040.
 *   Mindlin, R. D. (1936). Force at a point in the interior of a semi-infinite solid,
 *   Physics, 7, 195–202.
 *
 * Coordinate & Slip Convention (Okada 1992 Fig. 1 / Aki & Richards 1980):
 *   x = along strike (m)
 *   y = perpendicular to strike, +y points up-dip (azimuth = strike - 90 deg) (m)
 *   z = vertical upward (m, z <= 0 inside half-space; z = -obsDepthM)
 *   depth = depth of fault local origin (xi=0, eta=0) below z=0 (m, depth >= 0)
 *   al1 <= xi <= al2 (along-strike bounds, m)
 *   aw1 <= eta <= aw2 (along-dip bounds, +eta is up-dip, m)
 *   disl1 = left-lateral strike-slip (m, rake = 0 deg)
 *   disl2 = up-dip reverse dip-slip (m, rake = +90 deg)
 *   disl3 = tensile opening (m, > 0 opening)
 */

export interface OkadaOutput {
  ux: number;
  uy: number;
  uz: number;
  uxx: number;
  uyx: number;
  uzx: number;
  uxy: number;
  uyy: number;
  uzy: number;
  uxz: number;
  uyz: number;
  uzz: number;
  nearFaultSingular: boolean;
}

const EPS = 1e-6;
const PI = Math.PI;
const PI2 = 2 * PI;

interface CommonConsts {
  alp1: number;
  alp2: number;
  alp3: number;
  alp4: number;
  alp5: number;
  nu: number;
  sd: number;
  cd: number;
  sdsd: number;
  cdcd: number;
  sdcd: number;
}

interface AuxTerms {
  xi: number;
  et: number;
  q: number;
  r: number;
  r2: number;
  r3: number;
  yy: number;
  dd: number;
  tt: number;
  alx: number;
  ale: number;
  x11: number;
  y11: number;
  x32: number;
  y32: number;
  xy: number;
  qx: number;
  qy: number;
}

function computeAux(
  c: CommonConsts,
  xi: number,
  et: number,
  q: number,
  kxi: boolean,
  ket: boolean
): AuxTerms {
  const xi2 = xi * xi;
  const et2 = et * et;
  const q2 = q * q;
  const r2 = Math.max(1e-12, xi2 + et2 + q2);
  const r = Math.sqrt(r2);
  const r3 = r * r2;
  const yy = et * c.cd + q * c.sd;
  const dd = et * c.sd - q * c.cd;
  const tt = Math.abs(q) < EPS ? 0 : Math.atan((xi * et) / (q * r));

  let alx = 0;
  let x11 = 0;
  let x32 = 0;
  if (kxi || Math.abs(r + xi) < EPS) {
    alx = -Math.log(Math.max(1e-12, r - xi));
  } else {
    const rxi = r + xi;
    alx = Math.log(rxi);
    x11 = 1 / (r * rxi);
    x32 = ((r + rxi) * x11 * x11) / r;
  }

  let ale = 0;
  let y11 = 0;
  let y32 = 0;
  if (ket || Math.abs(r + et) < EPS) {
    ale = -Math.log(Math.max(1e-12, r - et));
  } else {
    const ret = r + et;
    ale = Math.log(ret);
    y11 = 1 / (r * ret);
    y32 = ((r + ret) * y11 * y11) / r;
  }

  return {
    xi,
    et,
    q,
    r,
    r2,
    r3,
    yy,
    dd,
    tt,
    alx,
    ale,
    x11,
    y11,
    x32,
    y32,
    xy: xi * y11,
    qx: q * x11,
    qy: q * y11,
  };
}

/**
 * Okada (1992) Table 2: Infinite-medium dislocation displacement uA(x, y, z)
 * (returned in Okada Chinnery sign convention so DISL1 > 0 is left-lateral,
 * DISL2 > 0 is reverse up-dip, DISL3 > 0 is tensile opening).
 */
function evalUA_disp(
  c: CommonConsts,
  g: AuxTerms,
  disl1: number,
  disl2: number,
  disl3: number
): { ux: number; uy: number; uz: number } {
  let f1 = 0;
  let f2 = 0;
  let f3 = 0;

  if (disl1 !== 0) {
    f1 += disl1 * (0.5 * g.tt + c.alp2 * g.xi * g.qy);
    f2 += disl1 * (c.alp2 * (g.q / g.r));
    f3 += disl1 * (c.alp1 * g.ale - c.alp2 * g.q * g.qy);
  }
  if (disl2 !== 0) {
    f1 += disl2 * (c.alp2 * (g.q / g.r));
    f2 += disl2 * (0.5 * g.tt + c.alp2 * g.et * g.qx);
    f3 += disl2 * (c.alp1 * g.alx - c.alp2 * g.q * g.qx);
  }
  if (disl3 !== 0) {
    f1 += disl3 * (-c.alp1 * g.ale - c.alp2 * g.q * g.qy);
    f2 += disl3 * (-c.alp1 * g.alx - c.alp2 * g.q * g.qx);
    f3 += disl3 * (0.5 * g.tt - c.alp2 * (g.xi * g.qy + g.et * g.qx));
  }

  return {
    ux: -f1 / PI2,
    uy: -(f2 * c.cd - f3 * c.sd) / PI2,
    uz: -(f2 * c.sd + f3 * c.cd) / PI2,
  };
}

/**
 * Precomputed Gauss-Legendre quadrature nodes and weights on [-1, 1].
 */
function glNodesWeights(n: number): { x: number[]; w: number[] } {
  const x = new Array<number>(n).fill(0);
  const w = new Array<number>(n).fill(0);
  const m = (n + 1) >> 1;
  for (let i = 0; i < m; i++) {
    let z = Math.cos((PI * (i + 0.75)) / (n + 0.5));
    let pp = 0;
    for (let it = 0; it < 30; it++) {
      let p1 = 1;
      let p2 = 0;
      for (let j = 0; j < n; j++) {
        const p3 = p2;
        p2 = p1;
        p1 = ((2 * j + 1) * z * p2 - j * p3) / (j + 1);
      }
      pp = (n * (z * p1 - p2)) / (z * z - 1);
      const z1 = z;
      z = z1 - p1 / pp;
      if (Math.abs(z - z1) < 1e-15) break;
    }
    x[i] = -z;
    x[n - 1 - i] = z;
    const wi = 2 / ((1 - z * z) * pp * pp);
    w[i] = wi;
    w[n - 1 - i] = wi;
  }
  return { x, w };
}

const GL8 = glNodesWeights(8);
const GL12 = glNodesWeights(12);
const GL16 = glNodesWeights(16);
const GL24 = glNodesWeights(24);

/**
 * Smooth free-surface image force kernel: Mindlin (1936) half-space point-force
 * Green's function minus Stokes/Kelvin infinite-space kernel (mu = 1 normalized).
 * Completely non-singular (R2 >= zm + c0 > 0) everywhere inside z < 0.
 */
function mindlinImageForce(
  x: number,
  y: number,
  zm: number,
  c0: number,
  fx: number,
  fy: number,
  fz: number,
  nu: number
): [number, number, number] {
  const zc = zm + c0;
  const R2sq = x * x + y * y + zc * zc;
  const R2 = Math.sqrt(R2sq);
  const R23 = R2sq * R2;
  const R25 = R23 * R2sq;
  const k = 3 - 4 * nu;
  const A = 4 * (1 - nu) * (1 - 2 * nu);
  const coef = 1 / (16 * PI * (1 - nu));
  const rz = R2 + zc;
  const rz2 = rz * rz;
  const R2rz = R2 * rz;
  const czm2 = 2 * c0 * zm;
  const czm6 = 3 * czm2;

  let ux = 0;
  let uy = 0;
  let uzm = 0;
  if (fx !== 0) {
    const f = fx * coef;
    ux +=
      f *
      (1 / R2 +
        (k * x * x) / R23 +
        (czm2 / R23) * (1 - (3 * x * x) / R2sq) +
        (A / rz) * (1 - (x * x) / R2rz));
    uy += f * (x * y * (k / R23 - czm6 / R25 - A / (R2 * rz2)));
    uzm += f * (x * ((k * (zm - c0)) / R23 - (czm6 * zc) / R25 + A / R2rz));
  }
  if (fy !== 0) {
    const f = fy * coef;
    ux += f * (x * y * (k / R23 - czm6 / R25 - A / (R2 * rz2)));
    uy +=
      f *
      (1 / R2 +
        (k * y * y) / R23 +
        (czm2 / R23) * (1 - (3 * y * y) / R2sq) +
        (A / rz) * (1 - (y * y) / R2rz));
    uzm += f * (y * ((k * (zm - c0)) / R23 - (czm6 * zc) / R25 + A / R2rz));
  }
  if (fz !== 0) {
    const f = -fz * coef;
    ux += f * (x * ((k * (zm - c0)) / R23 + (czm6 * zc) / R25 - A / R2rz));
    uy += f * (y * ((k * (zm - c0)) / R23 + (czm6 * zc) / R25 - A / R2rz));
    uzm +=
      f *
      ((8 * (1 - nu) * (1 - nu) - k) / R2 +
        (k * zc * zc - czm2) / R23 +
        (czm6 * zc * zc) / R25);
  }
  return [ux, uy, -uzm];
}

function buildMomentDensityMatrix(
  c: CommonConsts,
  disl1: number,
  disl2: number,
  disl3: number
): number[][] {
  const nu = Math.min(0.499999, Math.max(0.0, c.nu));
  const lam = (2 * nu) / (1 - 2 * nu); // mu = 1 normalized
  const n = [0, -c.sd, c.cd];
  const s = [
    disl1,
    disl2 * c.cd - disl3 * c.sd,
    disl2 * c.sd + disl3 * c.cd,
  ];
  const ns = n[0] * s[0] + n[1] * s[1] + n[2] * s[2];
  const M: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let p = 0; p < 3; p++) {
    for (let q = 0; q < 3; q++) {
      M[p][q] = (p === q ? lam * ns : 0) + (n[p] * s[q] + n[q] * s[p]);
    }
  }
  return M;
}

function mindlinImagePointDisl(
  x: number,
  y: number,
  zm: number,
  c0: number,
  M: number[][],
  nu: number
): [number, number, number] {
  const R2 = Math.hypot(x, y, zm + c0);
  const h = 1e-5 * Math.max(1, R2);
  const inv2h = 0.5 / h;
  let ux = 0;
  let uy = 0;
  let uz = 0;

  for (let q = 0; q < 3; q++) {
    const m0 = M[0][q];
    const m1 = M[1][q];
    const m2 = M[2][q];
    if (m0 === 0 && m1 === 0 && m2 === 0) continue;

    const fx = q === 0 ? 1 : 0;
    const fy = q === 1 ? 1 : 0;
    const fz = q === 2 ? 1 : 0;

    if (m0 !== 0) {
      const p = mindlinImageForce(x - h, y, zm, c0, fx, fy, fz, nu);
      const m = mindlinImageForce(x + h, y, zm, c0, fx, fy, fz, nu);
      const w = m0 * inv2h;
      ux += w * (p[0] - m[0]);
      uy += w * (p[1] - m[1]);
      uz += w * (p[2] - m[2]);
    }
    if (m1 !== 0) {
      const p = mindlinImageForce(x, y - h, zm, c0, fx, fy, fz, nu);
      const m = mindlinImageForce(x, y + h, zm, c0, fx, fy, fz, nu);
      const w = m1 * inv2h;
      ux += w * (p[0] - m[0]);
      uy += w * (p[1] - m[1]);
      uz += w * (p[2] - m[2]);
    }
    if (m2 !== 0) {
      const p = mindlinImageForce(x, y, zm, c0 - h, fx, fy, fz, nu);
      const m = mindlinImageForce(x, y, zm, c0 + h, fx, fy, fz, nu);
      const w = m2 * inv2h;
      ux += w * (p[0] - m[0]);
      uy += w * (p[1] - m[1]);
      uz += w * (p[2] - m[2]);
    }
  }
  return [ux, uy, uz];
}

/**
 * Exact Okada (1992) DC3D displacement evaluation:
 * - Analytical closed-form real full-space term uA (Chinnery over [al1, al2] x [aw1, aw2])
 * - At free surface z = 0: exact analytical Table 3 uB - uA_img
 * - At subsurface z < 0: exact adaptive Gauss-Legendre Mindlin image correction
 */
function evalOkadaDisplacement(
  c: CommonConsts,
  M: number[][],
  gl: { x: number[]; w: number[] },
  x: number,
  y: number,
  z: number,
  depth: number,
  al1: number,
  al2: number,
  aw1: number,
  aw2: number,
  disl1: number,
  disl2: number,
  disl3: number
): { ux: number; uy: number; uz: number } {
  let ux = 0;
  let uy = 0;
  let uz = 0;

  // 1) Exact analytical real full-space term uA over [al1, al2] x [aw1, aw2]
  const dReal = depth + z;
  const pReal = y * c.cd + dReal * c.sd;
  const qReal = y * c.sd - dReal * c.cd;
  const xiArr = [x - al1, x - al2];
  const etRealArr = [pReal - aw1, pReal - aw2];

  const kxiReal = [false, false];
  const ketReal = [false, false];
  if (Math.abs(qReal) < EPS) {
    if (xiArr[0] * xiArr[1] <= 0) {
      ketReal[0] = true;
      ketReal[1] = true;
    }
    if (etRealArr[0] * etRealArr[1] <= 0) {
      kxiReal[0] = true;
      kxiReal[1] = true;
    }
  }

  const signs = [
    [1, -1],
    [-1, 1],
  ];

  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const s = signs[i][j];
      const gReal = computeAux(c, xiArr[i], etRealArr[j], qReal, kxiReal[i], ketReal[j]);
      const uaR = evalUA_disp(c, gReal, disl1, disl2, disl3);
      ux += s * uaR.ux;
      uy += s * uaR.uy;
      uz += s * uaR.uz;
    }
  }

  // 2) Free-surface image term:
  // Exact closed-form analytical Okada (1985/1992) Table 3 at z = 0
  if (Math.abs(z) < 1e-4) {
    const dImg = depth;
    const pImg = y * c.cd + dImg * c.sd;
    const qImg = y * c.sd - dImg * c.cd;
    const etImgArr = [pImg - aw1, pImg - aw2];
    const kxiImg = [false, false];
    const ketImg = [false, false];
    if (Math.abs(qImg) < EPS) {
      if (xiArr[0] * xiArr[1] <= 0) {
        ketImg[0] = true;
        ketImg[1] = true;
      }
      if (etImgArr[0] * etImgArr[1] <= 0) {
        kxiImg[0] = true;
        kxiImg[1] = true;
      }
    }

    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const s = signs[i][j];
        const gImg = computeAux(c, xiArr[i], etImgArr[j], qImg, kxiImg[i], ketImg[j]);
        const uaI = evalUA_disp(c, gImg, disl1, disl2, disl3);
        ux -= s * uaI.ux;
        uy -= s * uaI.uy;
        uz -= s * uaI.uz;

        const { xi, et, q, r, yy, dd, tt, ale, qx, qy } = gImg;
        const rd = Math.max(1e-12, r + dd);
        const rd2 = rd * rd;

        let I1 = 0;
        let I2 = 0;
        let I3 = 0;
        let I4 = 0;
        let I5 = 0;
        if (Math.abs(c.cd) < EPS) {
          I1 = (-c.alp3 * xi * q) / (2 * rd2);
          I3 = (c.alp3 / 2) * (et / rd + (yy * q) / rd2 - ale);
          I2 = -c.alp3 * ale - I3;
          I4 = (-c.alp3 * q) / rd;
          I5 = (-c.alp3 * xi * c.sd) / rd;
        } else {
          const xv = Math.sqrt(xi * xi + q * q);
          I5 =
            Math.abs(xi) < EPS
              ? 0
              : ((c.alp3 * 2) / c.cd) *
                Math.atan(
                  (et * (xv + q * c.cd) + xv * (r + xv) * c.sd) /
                    (xi * (r + xv) * c.cd)
                );
          I4 = (c.alp3 / c.cd) * (Math.log(rd) - c.sd * ale);
          I3 = c.alp3 * ((1 / c.cd) * (yy / rd) - ale) + (c.sd / c.cd) * I4;
          I2 = -c.alp3 * ale - I3;
          I1 = c.alp3 * (-xi / (c.cd * rd)) - (c.sd / c.cd) * I5;
        }

        let bx = 0;
        let by = 0;
        let bz = 0;
        if (disl1 !== 0) {
          bx += disl1 * (xi * qy + tt + I1 * c.sd);
          by += disl1 * ((q * c.cd) / r + q * qy * c.sd + I2 * c.sd);
          bz += disl1 * ((q * c.sd) / r - q * qy * c.cd + I4 * c.sd);
        }
        if (disl2 !== 0) {
          bx += disl2 * (q / r - I3 * c.sdcd);
          by += disl2 * (yy * qx + c.cd * tt - I1 * c.sdcd);
          bz += disl2 * (dd * qx + c.sd * tt - I5 * c.sdcd);
        }
        if (disl3 !== 0) {
          bx -= disl3 * (q * qy - I3 * c.sdsd);
          by -= disl3 * (-dd * qx - c.sd * (xi * qy - tt) - I1 * c.sdsd);
          bz -= disl3 * (yy * qx + c.cd * (xi * qy - tt) - I5 * c.sdsd);
        }

        const f = -s / PI2;
        ux += f * bx;
        uy += f * by;
        uz += f * bz;
      }
    }
    return { ux, uy, uz };
  }

  // Subsurface z < 0: Smooth Mindlin image contribution via adaptive Gauss-Legendre
  const zm = -z;
  const hx = 0.5 * (al2 - al1);
  const mx = 0.5 * (al1 + al2);
  const he = 0.5 * (aw2 - aw1);
  const me = 0.5 * (aw1 + aw2);
  const nu = Math.min(0.499999, Math.max(0.0, c.nu));

  for (let i = 0; i < gl.x.length; i++) {
    const xi = mx + hx * gl.x[i];
    const wi = hx * gl.w[i];
    for (let j = 0; j < gl.x.length; j++) {
      const et = me + he * gl.x[j];
      const wt = wi * he * gl.w[j];
      const cSrc = Math.max(0, depth - et * c.sd);
      const ySrc = et * c.cd;
      const img = mindlinImagePointDisl(x - xi, y - ySrc, zm, cSrc, M, nu);
      ux += wt * img[0];
      uy += wt * img[1];
      uz += wt * img[2];
    }
  }

  return { ux, uy, uz };
}

export function computeOkada1992Dislocation(
  alpha: number,
  x: number,
  y: number,
  z: number,
  depth: number,
  dipDeg: number,
  al1: number,
  al2: number,
  aw1: number,
  aw2: number,
  disl1: number,
  disl2: number,
  disl3: number
): OkadaOutput {
  const safeAlpha = Math.max(0.5, Math.min(0.999999, alpha));
  const nu = Math.max(0.0, Math.min(0.499999, 1 - 1 / (2 * safeAlpha)));
  const dipRad = dipDeg * (PI / 180);
  const sd = Math.sin(dipRad);
  const cd0 = Math.cos(dipRad);
  const cd = Math.abs(cd0) < EPS ? 0 : cd0;

  const c: CommonConsts = {
    alp1: (1 - safeAlpha) / 2,
    alp2: safeAlpha / 2,
    alp3: (1 - safeAlpha) / safeAlpha,
    alp4: 1 - safeAlpha,
    alp5: safeAlpha,
    nu,
    sd,
    cd,
    sdsd: sd * sd,
    cdcd: cd * cd,
    sdcd: sd * cd,
  };

  const M = buildMomentDensityMatrix(c, disl1, disl2, disl3);

  // Detect near-fault singularity (point within 50 m of fault surface rectangle)
  const pObs = y * c.cd + (depth + z) * c.sd;
  const qObs = y * c.sd - (depth + z) * c.cd;
  const minXDist = x < al1 ? al1 - x : x > al2 ? x - al2 : 0;
  const minPDist = pObs < aw1 ? aw1 - pObs : pObs > aw2 ? pObs - aw2 : 0;
  const distToPatchM = Math.hypot(minXDist, minPDist, qObs);
  const nearFaultSingular = distToPatchM < 50;

  // Choose Gauss-Legendre rule once for the entire gradient stencil
  const pImgObs = y * c.cd + (depth - z) * c.sd;
  const qImgObs = y * c.sd - (depth - z) * c.cd;
  const minPImg = pImgObs < aw1 ? aw1 - pImgObs : pImgObs > aw2 ? pImgObs - aw2 : 0;
  const distToImg = Math.hypot(minXDist, minPImg, qImgObs);
  const Lmax = Math.max(1, Math.abs(al2 - al1), Math.abs(aw2 - aw1));
  const ratio = distToImg / Lmax;
  const gl = ratio > 1.8 ? GL8 : ratio > 0.5 ? GL12 : ratio > 0.12 ? GL16 : GL24;

  const evalPt = (px: number, py: number, pz: number) =>
    evalOkadaDisplacement(c, M, gl, px, py, pz, depth, al1, al2, aw1, aw2, disl1, disl2, disl3);

  const center = evalPt(x, y, z);

  // Adaptive step for O(h^4) Richardson central-difference spatial gradients
  const faultScale = Math.max(100, Math.abs(al2 - al1), Math.abs(aw2 - aw1));
  const h = Math.min(2.0, Math.max(0.05, faultScale * 1e-4));
  const denom = 12 * h;

  const diffAxis = (dx: number, dy: number, dz: number) => {
    const p1 = evalPt(x + dx, y + dy, z + dz);
    const m1 = evalPt(x - dx, y - dy, z - dz);
    const p2 = evalPt(x + 2 * dx, y + 2 * dy, z + 2 * dz);
    const m2 = evalPt(x - 2 * dx, y - 2 * dy, z - 2 * dz);
    return {
      dux: (-p2.ux + 8 * p1.ux - 8 * m1.ux + m2.ux) / denom,
      duy: (-p2.uy + 8 * p1.uy - 8 * m1.uy + m2.uy) / denom,
      duz: (-p2.uz + 8 * p1.uz - 8 * m1.uz + m2.uz) / denom,
    };
  };

  const gx = diffAxis(h, 0, 0);
  const gy = diffAxis(0, h, 0);

  let gz: { dux: number; duy: number; duz: number };
  if (z + 2 * h > 0) {
    const z0 = center;
    const z1 = evalPt(x, y, z - h);
    const z2 = evalPt(x, y, z - 2 * h);
    const z3 = evalPt(x, y, z - 3 * h);
    const z4 = evalPt(x, y, z - 4 * h);
    const d4 = (f0: number, f1: number, f2: number, f3: number, f4: number) =>
      (25 * f0 - 48 * f1 + 36 * f2 - 16 * f3 + 3 * f4) / denom;
    gz = {
      dux: d4(z0.ux, z1.ux, z2.ux, z3.ux, z4.ux),
      duy: d4(z0.uy, z1.uy, z2.uy, z3.uy, z4.uy),
      duz: d4(z0.uz, z1.uz, z2.uz, z3.uz, z4.uz),
    };
  } else {
    gz = diffAxis(0, 0, h);
  }

  return {
    ux: center.ux,
    uy: center.uy,
    uz: center.uz,
    uxx: gx.dux,
    uyx: gx.duy,
    uzx: gx.duz,
    uxy: gy.dux,
    uyy: gy.duy,
    uzy: gy.duz,
    uxz: gz.dux,
    uyz: gz.duy,
    uzz: gz.duz,
    nearFaultSingular,
  };
}
