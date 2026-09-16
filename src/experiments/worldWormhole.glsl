uniform sampler2D farStars;
uniform sampler2D farNebula;
uniform float exteriorLensing;
uniform float skyDrift;
uniform vec3 localCamera;
uniform mat4 localToClip;
varying vec3 localSurface;

// Reuse the lab's bounded curved-ray acceleration, but transmit at r=1.
// Crossing rays see the far side. Escaping rays near the rim show the original
// curved sky halo, fading into the resident world outside the lens region.
const float PI = 3.141592653589793;
const vec3 TINT = vec3(1.0, 0.66, 0.44);
vec3 driftSky(vec3 direction) {
  float c = cos(skyDrift), s = sin(skyDrift);
  return vec3(c*direction.x + s*direction.z, direction.y, -s*direction.x + c*direction.z);
}

vec3 skyStar(vec2 uv, vec3 tint, float gain) {
  vec4 star = texture2D(farStars, uv);
  float temperature = clamp(1000.0 + 39000.0 * star.r, 1000.0, 40000.0) / 100.0;
  vec3 color;
  color.r = temperature <= 66.0 ? 255.0 : 329.698727446 * pow(temperature - 60.0, -0.1332047592);
  color.g = temperature <= 66.0 ? 99.4708025861 * log(temperature) - 161.1195681661
    : 288.1221695283 * pow(temperature - 60.0, -0.0755148492);
  color.b = temperature >= 66.0 ? 255.0 : temperature <= 19.0 ? 0.0
    : 138.5177312231 * log(temperature - 10.0) - 305.0447927307;
  return clamp(color / 255.0, 0.0, 1.0) * tint * star.g * gain;
}
vec3 starAt(vec2 uv) {
  return skyStar(uv, TINT, 0.35);
}
vec3 exteriorSky(vec3 dir) {
  dir = driftSky(dir);
  float angle = PI * 0.25;
  vec3 rotated = vec3(cos(angle)*dir.x - sin(angle)*dir.y,
    sin(angle)*dir.x + cos(angle)*dir.y, dir.z);
  vec2 uv = vec2(atan(rotated.z, rotated.x) / (2.0*PI),
    asin(clamp(rotated.y, -1.0, 1.0)) / PI) + 0.5;
  vec3 tint = vec3(1.0, 0.82, 0.72);
  return skyStar(uv, tint, 1.8) + texture2D(farNebula, uv).rgb * 0.8 * tint;
}
vec3 perpendicular(vec3 pole, vec3 view) {
  vec3 p = pole - view * dot(view, pole);
  if (dot(p, p) < 0.000001) p = cross(view, abs(view.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0));
  return normalize(p);
}
vec3 destinationSky(vec3 dir, vec3 view) {
  dir = driftSky(dir);
  view = driftSky(view);
  // Same rotation, temperature decoding, five-tap star blur, tint and gains
  // as the original '/' throat. No image is sampled for an escaped ray.
  float angle = 40.0 * PI / 180.0;
  vec3 rotated = vec3(cos(angle)*dir.x - sin(angle)*dir.y,
    sin(angle)*dir.x + cos(angle)*dir.y, dir.z);
  vec2 uv = vec2(atan(rotated.z, rotated.x) / (2.0*PI), asin(clamp(rotated.y, -1.0, 1.0)) / PI) + 0.5;
  vec3 sky = starAt(uv) * 0.36;
  sky += (starAt(uv + vec2(0.004, 0)) + starAt(uv - vec2(0.004, 0))
    + starAt(uv + vec2(0, 0.004)) + starAt(uv - vec2(0, 0.004))) * 0.16;
  sky += mix(vec3(0.020, 0.009, 0.007), vec3(0.006, 0.002, 0.002), smoothstep(0.0, 0.55, abs(dir.y)));
  sky += texture2D(farNebula, uv).rgb * 1.6 * TINT;
  vec3 pole = perpendicular(normalize(vec3(0.30, 0.88, -0.37)), view);
  float lat = dot(dir, pole);
  vec3 core = normalize(view + 0.45 * cross(pole, view));
  float lon = atan(dot(dir, cross(pole, core)), dot(dir, core));
  float belt = exp(-lat*lat / 0.0121);
  float bulge = exp(-lon*lon / 0.9) * exp(-lat*lat / 0.0484);
  float mottle = 0.72 + 0.28*sin(lon*2.0 + 0.9) + 0.16*sin(lon*3.0 - 2.1);
  float lane = 1.0 - 0.92 * exp(-lat*lat / 0.00121);
  return sky + vec3(0.075, 0.050, 0.034) * (belt*mottle*lane + bulge*1.6);
}
vec3 acceleration(vec3 p, float h2) {
  float r2 = max(dot(p, p), 0.01);
  return -1.5 * h2 * p / (r2 * r2 * sqrt(r2));
}
void main() {
  vec3 ray = normalize(localSurface - localCamera);
  vec3 p = localCamera;
  float start = 0.0;
  if (length(p) > 18.0) {
    float b = dot(p, ray);
    float discriminant = b*b - dot(p,p) + 324.0;
    if (discriminant < 0.0 || b > 0.0) discard;
    start = max(0.0, -b - sqrt(discriminant));
    p += ray * start;
  }
  vec3 velocity = ray;
  vec3 angular = cross(p, velocity);
  float h2 = dot(angular, angular);
  bool crossed = length(p) <= 1.0;
  for (int i = 0; i < 512; i++) {
    if (crossed) break;
    float r = length(p);
    if (r > 18.1 && dot(p, velocity) > 0.0) break;
    float stepSize = clamp(r * 0.025, 0.018, 0.45);
    vec3 a = acceleration(p, h2);
    p += velocity * stepSize + 0.5 * a * stepSize * stepSize;
    velocity += 0.5 * (a + acceleration(p, h2)) * stepSize;
    crossed = length(p) <= 1.0;
  }
  if (!crossed) {
    if (exteriorLensing < 0.5) discard;
    // Impact parameter is world-relative, so the halo grows naturally on
    // approach. Fade before the integration volume ends: no sphere boundary.
    float impact = length(cross(localCamera, ray));
    float halo = 1.0 - smoothstep(4.5, 8.0, impact);
    if (halo <= 0.0) discard;
    vec3 bent = normalize(velocity);
    gl_FragColor = vec4(vec3(0.0, 1.0/255.0, 4.0/255.0) + exteriorSky(bent) * halo, 1.0);
    // This is distant sky light. Resident stars, including foreground stars,
    // retain their own depth and render over it with the existing lens mapping.
    gl_FragDepthEXT = 1.0;
    return;
  }
  vec3 vdir = normalize(velocity);
  float bend = acos(clamp(dot(ray, vdir), -1.0, 1.0));
  float compressed = 0.3 * log(1.0 + bend / 0.3);
  vec3 through = normalize(mix(ray, vdir, bend > 0.0001 ? compressed / bend : 1.0));
  vec3 view = length(localCamera) > 0.00001 ? normalize(-localCamera) : ray;
  vec3 axis = perpendicular(normalize(vec3(0.35, 0.82, 0.45)), view);
  float e = exp(-2.0 * bend / 0.3);
  float twist = 1.5 * (1.0 - e) / (1.0 + e);
  through = through * cos(twist) + cross(axis, through) * sin(twist)
    + axis * dot(axis, through) * (1.0 - cos(twist));
  vec3 transmitted = destinationSky(normalize(through), view);
  // Put the optical surface at the lens plane so foreground stars stay in
  // front. Ray-path length is not the depth of the apparent throat image.
  float depth = max(0.06, length(localCamera) * max(dot(ray, normalize(-localCamera + vec3(0.000001))), 0.0));
  vec4 clip = localToClip * vec4(localCamera + ray * depth, 1.0);
  gl_FragDepthEXT = clamp(0.5 + 0.5 * clip.z / clip.w, 0.0, 1.0);
  gl_FragColor = vec4(transmitted, 1.0);
}
