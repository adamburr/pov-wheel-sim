// Time-integrated POV light. For each pixel on the LED plane, find every moment within the
// exposure when an LED's footprint covers it, and integrate what that LED was emitting then:
// the column the firmware had latched, gated by the LED's PWM. Times are relative to the
// end of the exposure (t <= 0) so float32 keeps microsecond precision.

precision highp float;
precision highp int;
precision highp sampler2D;

in vec3 vLocal;
layout(location = 0) out highp vec4 outColor;

uniform sampler2D uSlices;   // 128x3: (t0, t1, phi0, omega), (m, P, enabled, hubX0), (delta0, deltaRate, hubWorld0, -)
uniform int uSliceCount;
uniform sampler2D uCols;     // columns x rows of PWM duty
uniform int uC;
uniform int uStrips;
uniform int uLeds;
uniform float uRStart;
uniform float uPitch;
uniform float uHalfW;
uniform float uStagger;
uniform float uSide;         // +1 drive-side LEDs, -1 back LEDs
uniform int uBackRow;        // row offset of back-strip data (0 when shared)
uniform int uBackChain;      // chain-unit offset of back strips (0 when wired in parallel)
uniform int uLanes;
uniform float uLatchBase;
uniform float uLatchPerLed;
uniform float uPwmPeriod;
uniform float uPwmPhase;
uniform float uGbPeriod;
uniform float uGbDuty;
uniform float uGbPhase;
uniform float uCurrentScale;
uniform int uOverflowBlank;
uniform float uT;            // exposure length (box)
uniform float uTau;          // > 0: human-eye exponential persistence
uniform float uGain;
uniform int uRideBy;
uniform float uRRoll;
uniform float uFalloff;
uniform vec3 uCamLocal;
uniform int uBanner;         // 1: image pinned to the world (banner mode)
uniform sampler2D uBannerTex;
uniform float uBannerW;      // banner image width (m)
uniform float uBannerTile;   // image width + gap (m)
uniform float uBannerHalfH;  // half the banner height (m), centred on the hub
uniform int uBannerMirror;   // independent back strips paint a mirrored banner
uniform int uPredict;        // compute each update for its mid-display time

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

float overlap(float a0, float a1, float b0, float b1) { return max(0.0, min(a1, b1) - max(a0, b0)); }

// Integral over [a, b] of a square wave that is on for the first `duty` of each period.
float sq(float a, float b, float duty, float period, float phase) {
  if (duty <= 0.0) return 0.0;
  if (period <= 0.0 || duty >= 1.0) return (b - a) * min(duty, 1.0);
  float xa = a + phase, xb = b + phase;
  float fa = floor(xa / period), fb = floor(xb / period);
  float Fa = fa * duty * period + min(xa - fa * period, duty * period);
  float Fb = fb * duty * period + min(xb - fb * period, duty * period);
  return Fb - Fa;
}

// Banner mode: what the firmware sends to an LED it believes is at angle offAng past strip 0,
// radius rk, at time tu. Its belief is the true pose plus the dead-reckoning error delta(t).
vec3 bannerDuty(float tu, vec4 A, vec4 D, float offAng, float rk) {
  float dt = tu - A.x;
  float dl = D.x + D.y * dt;
  float th = A.z + A.w * dt + dl + offAng;      // believed clockwise angle of this strip
  float hub = D.z + uRRoll * (A.w * dt + dl);   // believed hub position along the road
  vec2 pos = vec2(hub + rk * cos(th), -rk * sin(th));
  float x = mod(pos.x + 0.5 * uBannerW, uBannerTile);
  if (x >= uBannerW) return vec3(0.0);
  if (uBannerMirror == 1 && uSide < 0.0) x = uBannerW - x;
  float v = (uBannerHalfH - pos.y) / (2.0 * uBannerHalfH);
  if (v < 0.0 || v >= 1.0) return vec3(0.0);
  ivec2 size = textureSize(uBannerTex, 0);
  ivec2 px = clamp(ivec2(int(x / uBannerW * float(size.x)), int(v * float(size.y))), ivec2(0), size - 1);
  return texelFetch(uBannerTex, px, 0).rgb;
}

// Light emitted by one LED over [ta, tb] within slice (A, B), split at column changes.
vec3 emit(float ta, float tb, vec4 A, vec4 B, vec4 D, int s, float offAng, float rk, float latch, int row, float ph, float gph) {
  bool locked = B.y < 0.0;
  float C = float(uC);
  float x0, xs;
  if (locked) {
    // Encoder-locked: column follows this strip's true angle.
    x0 = (A.z + A.w * (ta - A.x) + offAng - B.x) / TAU * C;
    xs = A.w / TAU * C;
  } else {
    x0 = (ta - B.x - latch) / B.y;
    xs = 1.0 / B.y;
  }
  float offCol = floor(float(s * uC) / float(uStrips) + 0.5);
  vec3 e = vec3(0.0);
  float t = ta;
  for (int it = 0; it < 12; it++) {
    if (t >= tb) break;
    float x = x0 + xs * (t - ta);
    float j = floor(x);
    float tn = xs > 1e-9 ? ta + (j + 1.0 - x0) / xs : tb;
    tn = it == 11 ? tb : clamp(tn, t + 1e-9, tb);
    bool on = true;
    float col;
    if (locked) {
      col = mod(j, C);
    } else {
      on = uBanner == 1 || !(uOverflowBlank == 1 && j >= C);
      col = mod(j + offCol, C);
    }
    if (on) {
      vec3 duty;
      if (uBanner == 1) {
        // Each update is computed for one moment: the send time, or (with prediction) the
        // middle of the interval it will be on screen. Encoder-locked firmware is exact.
        float tu = locked ? 0.5 * (t + tn) : B.x + j * B.y + (uPredict == 1 ? latch + 0.5 * B.y : 0.0);
        duty = bannerDuty(tu, A, D, offAng, rk);
      } else {
        duty = texelFetch(uCols, ivec2(int(col), row), 0).rgb;
      }
      vec3 lit = vec3(
        sq(t, tn, duty.r, uPwmPeriod, ph),
        sq(t, tn, duty.g, uPwmPeriod, ph),
        sq(t, tn, duty.b, uPwmPeriod, ph));
      // The slow global-brightness PWM gates the fast colour PWM; treat the fast one as its average.
      if (uGbPeriod > 0.0) lit *= sq(t, tn, uGbDuty, uGbPeriod, gph) / max(tn - t, 1e-12);
      e += lit;
    }
    t = tn;
  }
  return e * uCurrentScale;
}

float weight(float ta, float tb) {
  return uTau > 0.0 ? exp(0.5 * (ta + tb) / uTau) / uTau : 1.0 / uT;
}


// Shared per-LED constants for strip s.
struct StripInfo { float stag; float offAng; int chainPos; };
StripInfo stripInfo(int s) {
  StripInfo si;
  si.stag = uStagger * float(s) / float(uStrips) * uPitch;
  si.offAng = TAU * float(s) / float(uStrips);
  int unit = uSide < 0.0 ? s + uBackChain : s;
  si.chainPos = unit / uLanes;
  return si;
}

// Hub fixed (chase camera): the pixel's polar coordinates are constant, so the LED-relative
// angle u(t) = phi0 + offset + omega (t - t0) - theta is linear and pass windows are exact.
vec3 chaseSlice(vec2 P, vec4 A, vec4 B, vec4 D, float px, float hwT, float tanCov, int rowBase) {
  vec3 acc = vec3(0.0);
  float hw = uHalfW;
  float t0 = A.x, t1 = A.y, w = A.w;
  float r = length(P);
  float th = atan(-P.y, P.x); // clockwise rotation-frame angle
  for (int s = 0; s < 8; s++) {
    if (s >= uStrips) break;
    StripInfo si = stripInfo(s);
    int kc = int(floor((r - uRStart - si.stag) / uPitch));
    for (int dk = -1; dk <= 1; dk++) {
      int k = kc + dk;
      if (k < 0 || k >= uLeds) continue;
      float rk = uRStart + si.stag + (float(k) + 0.5) * uPitch;
      float radCov = overlap(r - 0.5 * px, r + 0.5 * px, rk - hw, rk + hw) / px;
      if (radCov <= 0.0) continue;
      int row = rowBase + s * uLeds + k;
      float latch = uLatchBase + uLatchPerLed * float(si.chainPos * uLeds + k);
      float ph = hash(float(row) + 0.5) * uPwmPeriod + uPwmPhase;
      float gph = hash(float(row) + 17.0) * uGbPeriod + uGbPhase;
      float u0 = A.z + si.offAng - th;

      if (abs(w) < 1e-6) {
        // Stationary wheel: a static LED.
        float d = r * (mod(u0 + PI, TAU) - PI);
        float cov = radCov * overlap(d - 0.5 * px, d + 0.5 * px, -hw, hw) / px;
        if (cov > 0.0) acc += emit(t0, t1, A, B, D, s, si.offAng, rk, latch, row, ph, gph) * weight(t0, t1) * cov;
        continue;
      }
      float delta = min(hwT / max(r, 1e-4), PI);
      float u1 = u0 + w * (t1 - t0);
      int n0 = int(ceil((u0 - delta) / TAU));
      int n1 = int(floor((u1 + delta) / TAU));
      for (int n = n0; n <= n1 && n < n0 + 4; n++) {
        float ua = max(u0, TAU * float(n) - delta);
        float ub = min(u1, TAU * float(n) + delta);
        if (ub <= ua) continue;
        float ta = t0 + (ua - u0) / w;
        float tb = t0 + (ub - u0) / w;
        acc += emit(ta, tb, A, B, D, s, si.offAng, rk, latch, row, ph, gph) * weight(ta, tb) * radCov * tanCov;
      }
    }
  }
  return acc;
}

// Bike rolling past a fixed camera: LEDs trace cycloids. The pixel's angle seen from the moving
// hub changes too, so u(t) gains a term qy*v/r^2; solve each pass with Newton steps and use the
// local rate for the dwell time (LEDs near the ground move slowly and leave brighter streaks).
vec3 rideBySlice(vec2 P, vec4 A, vec4 B, vec4 D, float px, float hwT, float tanCov, float rMax, int rowBase) {
  vec3 acc = vec3(0.0);
  float hw = uHalfW;
  float t0 = A.x, t1 = A.y, w = A.w;
  if (abs(w) < 1e-6) return chaseSlice(P - vec2(B.w, 0.0), A, B, D, px, hwT, tanCov, rowBase);
  float v = uRRoll * w;
  vec2 qa = P - vec2(B.w, 0.0);
  vec2 qb = P - vec2(B.w + v * (t1 - t0), 0.0);
  if (abs(P.y) > rMax) return acc;
  if (min(abs(qa.x), abs(qb.x)) > rMax && qa.x * qb.x > 0.0) return acc;
  float tha = atan(-qa.y, qa.x);
  float thb = tha + (mod(atan(-qb.y, qb.x) - tha + PI, TAU) - PI);
  for (int s = 0; s < 8; s++) {
    if (s >= uStrips) break;
    StripInfo si = stripInfo(s);
    float ua = A.z + si.offAng - tha;
    float ub = A.z + si.offAng + w * (t1 - t0) - thb;
    float lo = min(ua, ub) - PI / 8.0, hi = max(ua, ub) + PI / 8.0;
    int n0 = int(ceil(lo / TAU));
    int n1 = int(floor(hi / TAU));
    for (int n = n0; n <= n1 && n < n0 + 4; n++) {
      float target = TAU * float(n);
      float tc = abs(ub - ua) > 1e-6 ? t0 + (target - ua) / (ub - ua) * (t1 - t0) : 0.5 * (t0 + t1);
      float r = 0.0, udot = w, res = 0.0;
      for (int it = 0; it < 4; it++) {
        vec2 q = P - vec2(B.w + v * (tc - t0), 0.0);
        r = max(length(q), 1e-4);
        float u = A.z + si.offAng + w * (tc - t0) - atan(-q.y, q.x);
        u += TAU * floor((target - u) / TAU + 0.5);
        udot = w + q.y * v / (r * r);
        res = target - u;
        if (it == 3 || abs(udot) < 1e-3) break;
        tc += res / udot;
      }
      if (abs(res) > 2.0 * hwT / r) continue;
      float halfT = min(hwT / r, PI) / max(abs(udot), 1e-3);
      float ta = max(t0, tc - halfT), tb = min(t1, tc + halfT);
      if (tb <= ta) continue;
      int kc = int(floor((r - uRStart - si.stag) / uPitch));
      for (int dk = -1; dk <= 1; dk++) {
        int k = kc + dk;
        if (k < 0 || k >= uLeds) continue;
        float rk = uRStart + si.stag + (float(k) + 0.5) * uPitch;
        float radCov = overlap(r - 0.5 * px, r + 0.5 * px, rk - hw, rk + hw) / px;
        if (radCov <= 0.0) continue;
        int row = rowBase + s * uLeds + k;
        float latch = uLatchBase + uLatchPerLed * float(si.chainPos * uLeds + k);
        float ph = hash(float(row) + 0.5) * uPwmPeriod + uPwmPhase;
        float gph = hash(float(row) + 17.0) * uGbPeriod + uGbPhase;
        acc += emit(ta, tb, A, B, D, s, si.offAng, rk, latch, row, ph, gph) * weight(ta, tb) * radCov * tanCov;
      }
    }
  }
  return acc;
}

void main() {
  vec3 toCam = normalize(uCamLocal - vLocal);
  float cosv = toCam.z * uSide;
  if (cosv <= 0.0) discard;

  vec2 P = vLocal.xy;
  float px = max(length(fwidth(P)) * 0.7071, 1e-5);
  float hw = uHalfW;
  float hwT = hw + 0.5 * px;
  float tanCov = hw / hwT; // energy-conserving widening of the dwell window by the pixel size
  float rMin = uRStart - hw - px;
  float rMax = uRStart + (float(uLeds) + 1.0) * uPitch + hw + px;
  if (uRideBy == 0) {
    float r = length(P);
    if (r < rMin || r > rMax) discard;
  }

  vec3 acc = vec3(0.0);
  int rowBase = uSide < 0.0 ? uBackRow : 0;

  for (int i = 0; i < 128; i++) {
    if (i >= uSliceCount) break;
    vec4 A = texelFetch(uSlices, ivec2(i, 0), 0);
    vec4 B = texelFetch(uSlices, ivec2(i, 1), 0);
    if (B.z < 0.5) continue;
    vec4 D = texelFetch(uSlices, ivec2(i, 2), 0);
    if (uRideBy == 1) acc += rideBySlice(P, A, B, D, px, hwT, tanCov, rMax, rowBase);
    else acc += chaseSlice(P, A, B, D, px, hwT, tanCov, rowBase);
  }

  float view = pow(cosv, uFalloff);
  outColor = vec4(acc * view * uGain, 1.0);
}
