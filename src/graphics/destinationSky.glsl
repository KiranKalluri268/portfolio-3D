// One optical mapping for the throat, entrance and tunnel walls.
uniform sampler2D farStars;
uniform sampler2D farNebula;
uniform float skyDrift;
const float PI = 3.141592653589793;
const vec3 TINT = vec3(0.94, 0.97, 1.0);
vec3 driftSky(vec3 d) {
  float c = cos(skyDrift), s = sin(skyDrift);
  return vec3(c*d.x + s*d.z, d.y, -s*d.x + c*d.z);
}
vec3 skyStar(vec2 uv, vec3 tint, float gain) {
  vec4 star = texture2D(farStars, uv);
  float t = clamp(1000.0 + 39000.0 * star.r, 1000.0, 40000.0) / 100.0;
  vec3 color;
  color.r = t <= 66.0 ? 255.0 : 329.698727446 * pow(t - 60.0, -0.1332047592);
  color.g = t <= 66.0 ? 99.4708025861 * log(t) - 161.1195681661
    : 288.1221695283 * pow(t - 60.0, -0.0755148492);
  color.b = t >= 66.0 ? 255.0 : t <= 19.0 ? 0.0
    : 138.5177312231 * log(t - 10.0) - 305.0447927307;
  return clamp(color / 255.0, 0.0, 1.0) * tint * star.g * gain;
}
vec3 starAt(vec2 uv) { return skyStar(uv, TINT, 0.12); }
vec3 perpendicular(vec3 pole, vec3 view) {
  vec3 p = pole - view * dot(view, pole);
  if (dot(p, p) < 0.000001) p = cross(view, abs(view.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0));
  return normalize(p);
}
vec3 destinationSky(vec3 dir) {
  dir = driftSky(dir);
  float angle = 40.0 * PI / 180.0;
  vec3 rotated = vec3(cos(angle)*dir.x - sin(angle)*dir.y,
    sin(angle)*dir.x + cos(angle)*dir.y, dir.z);
  vec2 uv = vec2(atan(rotated.z, rotated.x) / (2.0*PI), asin(clamp(rotated.y, -1.0, 1.0)) / PI) + 0.5;
  vec3 sky = starAt(uv) * 0.36;
  sky += (starAt(uv + vec2(0.004, 0)) + starAt(uv - vec2(0.004, 0))
    + starAt(uv + vec2(0, 0.004)) + starAt(uv - vec2(0, 0.004))) * 0.16;
  return sky + texture2D(farNebula, uv).rgb * TINT;
}
vec3 funnelSky(vec3 ray, vec3 view, float funnel, float travel, float caveRadius) {
  vec3 right = perpendicular(vec3(1, 0, 0), view);
  vec3 up = normalize(cross(right, view));
  vec2 aperture = vec2(dot(ray, right), dot(ray, up)) / max(dot(ray, view), 0.08);
  // Shared centered axis: the optical mouth and straight tunnel lead-in agree.
  float radius = max(length(aperture), 0.012);
  // Scroll controls the optical bore independently of the funnel morph.
  // The tunnel inherits its final radius; the exterior lens never shrinks.
  float boreRadius = max(caveRadius, 0.05);
  float depth = log(1.0 + 2.4 / radius);
  float azimuth = atan(aperture.y, aperture.x) + depth * 0.30 * funnel + travel;
  vec3 around = right * cos(azimuth) + up * sin(azimuth);
  float angle = 1.45 * (1.0 - exp(-radius * (1.0 + 3.0 * funnel) / boreRadius));
  vec3 wallRay = view * cos(angle) + around * sin(angle);
  return destinationSky(normalize(wallRay)) * mix(0.65, 1.15, smoothstep(0.0, 1.0, radius));
}
