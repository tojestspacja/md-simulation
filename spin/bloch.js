// bloch.js - the spin physics, shared by the game and the sandbox.
//
// The magnetization is not a single arrow. It is carried by many independent
// spin packets (isochromats), each one a 3-vector with its own frequency
// offset. Everything the game shows falls out of stepping those packets:
//
//   * free precession:  each packet rotates in the xy-plane at its own offset
//   * T2:               the transverse part decays
//   * T1:               mz creeps back towards equilibrium
//   * a pulse:          every packet is rotated about the x axis
//   * the signal:       the VECTOR SUM over packets, which is all a coil can
//                       ever see - so when the packets fan out the sum falls
//                       to nothing even though no single packet has shrunk
//
// That last point is the whole reason a spin echo works, and why it did not
// have to be animated by hand here.
window.Bloch = (function () {
  "use strict";

  const cfg = {
    T1: 0.20,          // s - longitudinal recovery
    T2: 0.16,          // s - transverse decay (T2 <= T1 always)
    nPack: 64,         // spin packets simulated
    M0: 1,             // equilibrium magnetization, normalised
    dwell: 0.00025,    // s between FID samples -> 4 kHz spectral width
    acq: 512,          // points acquired per scan (128 ms)
    nfft: 2048,        // transform length: zero-filled x4, as on a spectrometer
  };

  const packs = [];    // kept as one array for the life of the page
  let spread = [];     // packet offsets, in units of the local inhomogeneity

  // A deterministic, roughly Gaussian set of offsets. Evenly spaced offsets
  // would re-phase periodically and give a fake recurring echo.
  function buildSpread(n) {
    spread = [];
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const t = Math.sqrt(-2 * Math.log(Math.min(u, 1 - u) + 1e-6));
      const z = (u < 0.5 ? -1 : 1) *
        (t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t));
      spread.push(z * 0.62);
    }
  }

  // Back to thermal equilibrium: everything along +z, nothing transverse.
  function reset() {
    packs.length = 0;
    for (let i = 0; i < cfg.nPack; i++) {
      packs.push({ dnu: 0, mx: 0, my: 0, mz: cfg.M0 / cfg.nPack });
    }
  }

  // Hand every packet the offset of the environment it is sitting in. Called
  // when a packet is excited, so it keeps its chemical shift for the scan.
  function seedOffsets(baseHz, inhomHz) {
    for (let i = 0; i < packs.length; i++) {
      packs[i].dnu = baseHz + spread[i] * inhomHz;
    }
  }

  // A pulse is a rotation of every packet about the x axis. 90 deg takes +z
  // into the plane; 180 deg both inverts mz and mirrors the phase fan, which
  // is exactly what makes the fan wind back up into an echo.
  function pulse(deg, efficiency) {
    const th = (deg * Math.PI / 180) * (efficiency === undefined ? 1 : efficiency);
    const c = Math.cos(th), s = Math.sin(th);
    for (const p of packs) {
      const my = p.my * c + p.mz * s;
      const mz = -p.my * s + p.mz * c;
      p.my = my; p.mz = mz;
    }
  }

  // Free precession plus relaxation for dt seconds of spin time.
  function evolve(dt) {
    const e2 = Math.exp(-dt / cfg.T2);
    const e1 = Math.exp(-dt / cfg.T1);
    const eq = cfg.M0 / packs.length;
    for (const p of packs) {
      const ang = 2 * Math.PI * p.dnu * dt;
      const c = Math.cos(ang), s = Math.sin(ang);
      const mx = p.mx * c - p.my * s;
      const my = p.mx * s + p.my * c;
      p.mx = mx * e2;
      p.my = my * e2;
      p.mz = eq + (p.mz - eq) * e1;
    }
  }

  // Knock the packets out of phase with each other without shrinking mz -
  // what a paramagnetic ion does to the coherence nearby.
  function dephase(factor) {
    for (const p of packs) { p.mx *= factor; p.my *= factor; }
  }

  function netMxyComplex() {
    let sx = 0, sy = 0;
    for (const p of packs) { sx += p.mx; sy += p.my; }
    return [sx, sy];
  }
  function netMxy() {
    const v = netMxyComplex();
    return Math.hypot(v[0], v[1]);
  }
  function netMz() {
    let s = 0;
    for (const p of packs) s += p.mz;
    return s;
  }

  function setPackCount(n) {
    cfg.nPack = n;
    buildSpread(n);
    reset();
  }

  // ---------- in-place radix-2 FFT ----------
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k];
          const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }

  // Magnitude spectrum of a recorded FID: apodize, zero-fill, transform,
  // fftshift, and hand back a bin-to-ppm mapping.
  function spectrum(fidBuf, hzPerPpm) {
    const N = cfg.nfft;
    const re = new Float64Array(N), im = new Float64Array(N);
    const n = Math.min(cfg.acq, fidBuf.length);
    for (let i = 0; i < n; i++) {
      const apod = Math.exp(-2 * i / cfg.acq);   // ~5 Hz of line broadening
      re[i] = fidBuf[i][0] * apod;
      im[i] = fidBuf[i][1] * apod;
    }                                            // the rest stays zero: zero-filling
    fft(re, im);
    const mag = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      const ks = (k + N / 2) % N;                // fftshift
      mag[k] = Math.hypot(re[ks], im[ks]);
    }
    const hzPerBin = 1 / (cfg.dwell * N);
    const ppmOf = (k) => ((k - N / 2) * hzPerBin) / hzPerPpm;
    return { mag, ppmOf, hzPerBin };
  }

  buildSpread(cfg.nPack);
  reset();

  return {
    cfg, packets: () => packs,
    reset, setPackCount, seedOffsets, pulse, evolve, dephase,
    netMxy, netMxyComplex, netMz, fft, spectrum,
  };
})();
